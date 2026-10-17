package handlers

// mod_hostops.go — the panel-side implementation of modengine.HostOps.
//
// This is the bridge between the capability-gated JS bindings (ks.db.*,
// ks.files.*, ks.exec, ks.container/vm.action, ks.console.send) and the real
// panel machinery: the panel DB and the per-node edge client. The engine and
// sandbox never touch either directly — they call through this provider, so
// all SQL/edge knowledge stays in the handlers layer (house rule: handlers own
// request/edge orchestration, repository owns SQL).
//
// Every method re-validates its inputs even though the sandbox already gated
// the call by capability: defense in depth for a security boundary. Instance
// operations resolve the instance → its node → the node's edge token, then
// speak the same page-action / lifecycle RPCs the instance-pages feature uses,
// so mods get the exact same edge semantics (timeouts, containerd vs libvirt,
// tunneled WSS) with zero duplicated driver logic.
//
// Wiring: BootModEngine calls modengine.Default().SetHostOps(NewModHostOps()).

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/modengine"
	"github.com/example/kspanel/internal/repository"
)

// modHostOps implements modengine.HostOps against the live panel.
type modHostOps struct{}

// NewModHostOps returns the host-ops provider the engine wires at boot.
func NewModHostOps() modengine.HostOps { return modHostOps{} }

// Budget limits. The row cap keeps a runaway SELECT from ballooning the VM
// heap; the edge timeout bounds a hung node RPC so a mod hook can't pin a
// request goroutine for the default lifecycle.
const (
	modHostQueryRowCap = 1000
	modHostEdgeTimeout = 30 * time.Second
)

// normalizeModDBValue converts driver scan values to JSON-safe types so the
// {ok:true,data} bridge into the JS VM never chokes on []byte / time.Time.
func normalizeModDBValue(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		return string(t)
	case time.Time:
		return t.UTC().Format(time.RFC3339)
	default:
		return v
	}
}

// DBQuery runs a read statement and returns at most modHostQueryRowCap rows as
// column→value maps. Re-validates with the read-direction SQL guard.
func (modHostOps) DBQuery(sql string, args []any) ([]map[string]any, error) {
	if err := modengine.ValidateModSQL(sql, true); err != nil {
		return nil, err
	}
	con, err := repository.OpenDB()
	if err != nil {
		return nil, err
	}
	defer con.Close()
	rows, err := con.Query(sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, 32)
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			m[c] = normalizeModDBValue(vals[i])
		}
		out = append(out, m)
		if len(out) >= modHostQueryRowCap {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// DBExec runs a write statement and returns rows affected. Re-validates with
// the write-direction SQL guard.
func (modHostOps) DBExec(sql string, args []any) (int64, error) {
	if err := modengine.ValidateModSQL(sql, false); err != nil {
		return 0, err
	}
	con, err := repository.OpenDB()
	if err != nil {
		return 0, err
	}
	defer con.Close()
	res, err := con.Exec(sql, args...)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		// Some drivers may not report it; treat as zero rather than failing
		// the whole call after the write already committed.
		return 0, nil
	}
	return n, nil
}

// instanceEdge resolves instance → node → edge token in one connection.
func (modHostOps) instanceEdge(instanceID int64) (*models.Instance, *models.Node, string, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, nil, "", err
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(instanceID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("load instance %d: %w", instanceID, err)
	}
	if inst == nil {
		return nil, nil, "", fmt.Errorf("instance %d not found", instanceID)
	}
	nodeRepo := repository.NewNodeRepository(con)
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("load node %d: %w", inst.NodeID, err)
	}
	if node == nil {
		return nil, nil, "", fmt.Errorf("node %d not found", inst.NodeID)
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		return nil, nil, "", fmt.Errorf("node %d has no usable edge token", inst.NodeID)
	}
	return inst, node, token, nil
}

// pageAction runs one edge page-action for the instance, filling Kind/Name
// from the resolved row. Transport errors and protocol-level failures come
// back as Go errors; a nonzero shell exit is NOT an error (callers surface
// exit_code/stdout/stderr to the script — that is the command's result).
func (o modHostOps) pageAction(instanceID int64, typ string, req edge.PageActionRequest) (edge.PageActionResponse, error) {
	inst, node, token, err := o.instanceEdge(instanceID)
	if err != nil {
		return edge.PageActionResponse{}, err
	}
	req.Kind = inst.Kind
	req.Name = inst.Name
	req.Type = typ
	req.Token = token
	ec := edge.NewWithTimeout(*node, token, modHostEdgeTimeout)
	resp, err := ec.PageAction(req)
	if err != nil {
		return edge.PageActionResponse{}, fmt.Errorf("edge page-action: %w", err)
	}
	if resp.Error != "" {
		return resp, errors.New(resp.Error)
	}
	return resp, nil
}

// FSList lists a directory inside the instance via the edge list_files
// page-action and maps the parsed entries 1:1 into modengine.FileInfo.
func (o modHostOps) FSList(instanceID int64, path string) ([]modengine.FileInfo, error) {
	if strings.TrimSpace(path) == "" {
		path = "/"
	}
	resp, err := o.pageAction(instanceID, "list_files", edge.PageActionRequest{Path: path})
	if err != nil {
		return nil, err
	}
	if !resp.OK {
		return nil, errors.New(actionFailure("list_files", resp))
	}
	if resp.Data == nil {
		return []modengine.FileInfo{}, nil
	}
	// The edge ships structured FileEntry JSON; round-trip so we don't depend
	// on the decoder's generic map shape.
	raw, err := json.Marshal(resp.Data)
	if err != nil {
		return nil, fmt.Errorf("encode list_files data: %w", err)
	}
	var files []modengine.FileInfo
	if err := json.Unmarshal(raw, &files); err != nil {
		return nil, fmt.Errorf("decode list_files data: %w", err)
	}
	return files, nil
}

// FSRead reads a file inside the instance via the edge read_file page-action.
func (o modHostOps) FSRead(instanceID int64, path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("path is required")
	}
	resp, err := o.pageAction(instanceID, "read_file", edge.PageActionRequest{Path: path})
	if err != nil {
		return "", err
	}
	if !resp.OK {
		return "", errors.New(actionFailure("read_file", resp))
	}
	content, _ := resp.Data.(string)
	return content, nil
}

// FSWrite writes a file inside the instance via the edge write_file
// page-action.
func (o modHostOps) FSWrite(instanceID int64, path string, content string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("path is required")
	}
	resp, err := o.pageAction(instanceID, "write_file", edge.PageActionRequest{Path: path, Content: content})
	if err != nil {
		return err
	}
	if !resp.OK {
		return errors.New(actionFailure("write_file", resp))
	}
	return nil
}

// Exec runs a shell command inside the instance via the edge shell
// page-action. A nonzero exit code is returned as a normal ExecResult (the
// command ran; the script decides what it means).
func (o modHostOps) Exec(instanceID int64, command string, timeoutSec int) (modengine.ExecResult, error) {
	if strings.TrimSpace(command) == "" {
		return modengine.ExecResult{}, errors.New("command is required")
	}
	if timeoutSec < 1 {
		timeoutSec = 0
	}
	resp, err := o.pageAction(instanceID, "shell", edge.PageActionRequest{Command: command, Timeout: timeoutSec})
	if err != nil {
		return modengine.ExecResult{}, err
	}
	return modengine.ExecResult{
		ExitCode: resp.ExitCode,
		Stdout:   resp.Stdout,
		Stderr:   resp.Stderr,
	}, nil
}

// Control performs a lifecycle action through the edge's lifecycle RPC. The
// action set is clamped here as well as in the sandbox — "destroy" and
// "deploy" are intentionally NOT reachable from mod scripts.
func (o modHostOps) Control(instanceID int64, action string) (string, error) {
	switch action {
	case "start", "stop", "kill", "status":
	default:
		return "", fmt.Errorf("unsupported lifecycle action %q", action)
	}
	inst, node, token, err := o.instanceEdge(instanceID)
	if err != nil {
		return "", err
	}
	ec := edge.NewWithTimeout(*node, token, modHostEdgeTimeout)
	resp, err := ec.Lifecycle(edge.LifecycleRequest{
		Token:  token,
		Action: action,
		Kind:   inst.Kind,
		Name:   inst.Name,
	})
	if err != nil {
		return "", fmt.Errorf("edge lifecycle: %w", err)
	}
	if !resp.OK {
		msg := resp.Error
		if msg == "" {
			msg = "edge lifecycle failed"
		}
		return "", errors.New(msg)
	}
	return resp.Status, nil
}

// ConsoleSend runs a console-style command inside the instance (edge shell
// page-action under the terminal capability) and returns its output. This is
// command execution on the instance's shell, not an attached interactive
// console session — game-console framing (stdin to PID 1 etc.) is not
// modelled here.
func (o modHostOps) ConsoleSend(instanceID int64, command string) (modengine.ExecResult, error) {
	if strings.TrimSpace(command) == "" {
		return modengine.ExecResult{}, errors.New("command is required")
	}
	resp, err := o.pageAction(instanceID, "shell", edge.PageActionRequest{Command: command})
	if err != nil {
		return modengine.ExecResult{}, err
	}
	return modengine.ExecResult{
		ExitCode: resp.ExitCode,
		Stdout:   resp.Stdout,
		Stderr:   resp.Stderr,
	}, nil
}

// actionFailure builds the human-readable error for a failed page-action,
// preferring the edge's explicit error, then stderr.
func actionFailure(typ string, resp edge.PageActionResponse) string {
	if resp.Error != "" {
		return resp.Error
	}
	if s := strings.TrimSpace(resp.Stderr); s != "" {
		return s
	}
	if resp.ExitCode != 0 {
		return fmt.Sprintf("%s failed (exit %d)", typ, resp.ExitCode)
	}
	return typ + " failed"
}
