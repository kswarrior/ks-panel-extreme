package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// Application one-shot run engine.
//
// A Run takes an application (info + script files), merges the environment
// the operator supplied on the Run form with the app's saved env defaults
// and config_schema defaults, stages the files onto the chosen target and
// executes the entrypoint once, capturing stdout/stderr/exit-code into an
// application_runs row.
//
// Target resolution ("where does this run?"):
//
//	target = "node"  → the registered edge node executes it:
//	                   exec_mode=host             → /api/edge/host-exec
//	                   exec_mode=docker/lxd/kvm/  → /api/edge/exec-rpc
//	                           multipass            (inside that workload)
//	target = "panel" → prefer a LOCAL node (the 127.0.0.1 / localhost edge
//	                   provisioned by `kspanel setup:localnode`): the run
//	                   travels through it exactly like a node target.
//	                   With no usable local node, exec_mode=host falls back
//	                   to a direct shell from the panel process itself;
//	                   container/VM modes need a local node to drive the
//	                   driver, so they fail with setup instructions.

const (
	appRunMaxOutputBytes = 200 << 10 // per-stream cap persisted to the DB
	appRunDefaultTimeout = 300       // seconds, matches the migration default
	appRunMinTimeout     = 5
	appRunMaxTimeout     = 1800 // mirrors the edge's maxTimeout clamp
)

type appRunRequestDTO struct {
	Target     string            `json:"target"`
	NodeID     int64             `json:"node_id"`
	ExecMode   string            `json:"exec_mode"`
	Workload   string            `json:"workload"`
	TimeoutSec int               `json:"timeout_sec"`
	Env        map[string]string `json:"env"`
}

func validAppExecMode(m string) bool {
	switch m {
	case models.AppExecModeHost, models.AppExecModeDocker, models.AppExecModeLXD,
		models.AppExecModeKVM, models.AppExecModeMultipass:
		return true
	}
	return false
}

// RunApplicationHandler executes POST /api/applications/{id}/run.
func RunApplicationHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto appRunRequestDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Target != models.AppRunTargetNode && dto.Target != models.AppRunTargetPanel {
		http.Error(w, "target must be \"node\" or \"panel\"", http.StatusBadRequest)
		return
	}
	if !validAppExecMode(dto.ExecMode) {
		http.Error(w, "exec_mode must be host, docker, lxd, kvm or multipass", http.StatusBadRequest)
		return
	}
	if dto.Target == models.AppRunTargetNode && dto.NodeID <= 0 {
		http.Error(w, "node_id is required when target is node", http.StatusBadRequest)
		return
	}
	if dto.ExecMode != models.AppExecModeHost && strings.TrimSpace(dto.Workload) == "" {
		http.Error(w, "workload is required for container/VM exec modes", http.StatusBadRequest)
		return
	}
	if len(dto.Env) > 64 {
		http.Error(w, "too many env keys (max 64)", http.StatusBadRequest)
		return
	}
	timeout := dto.TimeoutSec
	if timeout == 0 {
		timeout = appRunDefaultTimeout
	}
	if timeout < appRunMinTimeout || timeout > appRunMaxTimeout {
		http.Error(w, fmt.Sprintf("timeout_sec must be %d..%d", appRunMinTimeout, appRunMaxTimeout), http.StatusBadRequest)
		return
	}

	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	app, err := repo.GetApplication(id)
	if err != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	if !app.Active {
		http.Error(w, "application is inactive — activate it before running", http.StatusConflict)
		return
	}

	files, cmd, wireEnv, err := buildAppRunPayload(app, dto.Env)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	run := &models.ApplicationRun{
		ApplicationID: app.ID,
		TriggeredBy:   &uid,
		Target:        dto.Target,
		NodeID:        dto.NodeID,
		ExecMode:      dto.ExecMode,
		Workload:      strings.TrimSpace(dto.Workload),
		Status:        models.AppRunStatusRunning,
		TimeoutSec:    timeout,
	}
	runID, err := repo.CreateApplicationRun(run)
	if err != nil {
		log.Println("CreateApplicationRun error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	run.ID = runID

	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
	defer cancel()

	var out, errOut string
	var exitCode int
	var runErr error

	switch dto.Target {
	case models.AppRunTargetNode:
		out, errOut, exitCode, runErr = runOnNode(ctx, dto.NodeID, dto.ExecMode, run.Workload, cmd, files, wireEnv, timeout)
	case models.AppRunTargetPanel:
		nodeID, nodeName, dialed, o, eOut, exit, rErr := runOnLocalNode(ctx, repo, dto.ExecMode, run.Workload, cmd, files, wireEnv, timeout)
		if dialed {
			run.NodeID, run.NodeName = nodeID, nodeName
			out, errOut, exitCode, runErr = o, eOut, exit, rErr
		} else if dto.ExecMode == models.AppExecModeHost {
			// No local node — the documented fallback: run by shell
			// directly on the panel host from this process.
			out, errOut, exitCode, runErr = runOnPanelShell(ctx, cmd, files, wireEnv)
		} else {
			runErr = fmt.Errorf("container/VM runs on the panel host need a local node — set one up with: ./kspanel setup:localnode")
		}
	}

	status := models.AppRunStatusSucceeded
	if runErr != nil {
		status = models.AppRunStatusError
	} else if exitCode != 0 {
		status = models.AppRunStatusFailed
	}
	if err := repo.CompleteApplicationRun(run.ID, status, exitCode, truncateRunOutput(out), truncateRunOutput(errOut), appRunErrText(runErr), run.NodeID, run.NodeName); err != nil {
		log.Println("CompleteApplicationRun error:", err)
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "run",
		TargetID:    &app.ID,
		TargetLabel: app.Name,
		Message: fmt.Sprintf("ran application %q on %s (mode=%s workload=%q status=%s)",
			app.Name, dto.Target, dto.ExecMode, run.Workload, status),
	})

	run.Status = status
	run.ExitCode = exitCode
	run.Output = truncateRunOutput(out)
	run.ErrorOutput = truncateRunOutput(errOut)
	run.Error = appRunErrText(runErr)
	writeJSON(w, run)
}

// ListApplicationRunsHandler serves GET /api/applications/{id}/runs.
func ListApplicationRunsHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	limit := parseIntDefault(r.URL.Query().Get("limit"), 25)
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if _, err := repo.GetApplication(id); err != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	runs, err := repo.ListApplicationRuns(id, limit)
	if err != nil {
		log.Println("ListApplicationRuns error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, runs)
}

// buildAppRunPayload validates + materialises the file set and assembles
// the command line for the application's runtime. Env precedence:
// config_schema defaults < saved application env < request overrides.
// Returns the staged files, the command line and the flattened env map.
func buildAppRunPayload(app *models.Application, overrides map[string]string) ([]edge.ExecFile, string, map[string]string, error) {
	env := map[string]string{}
	// 1. config_schema declared defaults.
	var schema []struct {
		Key     string          `json:"key"`
		Type    string          `json:"type"`
		Default json.RawMessage `json:"default"`
	}
	if len(app.ConfigSchema) > 0 {
		if err := json.Unmarshal(app.ConfigSchema, &schema); err != nil {
			// Rows created before the array contract was enforced (and the
			// column's '{}' default) hold an empty JSON object — treat that
			// as "no fields" instead of failing every run. Anything else
			// that isn't an array stays an error.
			var legacy map[string]json.RawMessage
			if lerr := json.Unmarshal(app.ConfigSchema, &legacy); lerr != nil || len(legacy) != 0 {
				return nil, "", nil, fmt.Errorf("application config_schema is not a JSON array")
			}
		}
	}
	for _, f := range schema {
		if f.Key == "" || len(f.Default) == 0 || string(f.Default) == "null" {
			continue
		}
		var s string
		if err := json.Unmarshal(f.Default, &s); err != nil {
			// The wire contract allows number defaults too (the SPA's
			// Configure editor round-trips them as strings, but uploaded
			// manifests may ship real JSON numbers) — keep those instead of
			// silently dropping them.
			var n json.Number
			if nerr := json.Unmarshal(f.Default, &n); nerr != nil {
				continue
			}
			s = n.String()
		}
		env[f.Key] = s
	}
	// 2. Saved env blob.
	var saved map[string]string
	if len(app.Env) > 0 {
		if err := json.Unmarshal(app.Env, &saved); err != nil {
			saved = nil
		}
	}
	for k, v := range saved {
		env[k] = v
	}
	// 3. Per-run overrides from the Run form (secrets included; they are
	// never logged anywhere in this path).
	for k, v := range overrides {
		env[k] = v
	}
	wireEnv := make(map[string]string, len(env))
	for k, v := range env {
		if k == "" {
			continue
		}
		if !isAppEnvName(k) {
			return nil, "", nil, fmt.Errorf("env key %q is not a valid POSIX identifier", k)
		}
		if strings.TrimSpace(v) == "" {
			continue
		}
		wireEnv[k] = v
	}

	// Script files.
	var rawFiles []struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if len(app.Files) > 0 {
		if err := json.Unmarshal(app.Files, &rawFiles); err != nil {
			return nil, "", nil, fmt.Errorf("application files blob is invalid")
		}
	}
	files := make([]edge.ExecFile, 0, len(rawFiles))
	entrySeen := false
	total := 0
	for _, f := range rawFiles {
		p := strings.TrimSpace(f.Path)
		clean := filepath.ToSlash(filepath.Clean(p))
		if p == "" || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, "../") {
			return nil, "", nil, fmt.Errorf("script file path %q must be relative", p)
		}
		if len(f.Content) > 1<<20 {
			return nil, "", nil, fmt.Errorf("script file %q exceeds 1 MiB", p)
		}
		total += len(f.Content)
		if total > 4<<20 {
			return nil, "", nil, fmt.Errorf("combined script payload exceeds 4 MiB")
		}
		if len(files) >= 64 {
			return nil, "", nil, fmt.Errorf("too many script files (max 64)")
		}
		if clean == filepath.ToSlash(filepath.Clean(app.Entrypoint)) {
			entrySeen = true
		}
		files = append(files, edge.ExecFile{Path: clean, Content: f.Content})
	}

	runtime := strings.ToLower(strings.TrimSpace(app.Runtime))
	if runtime == "" {
		runtime = "nodejs"
	}
	var cmd string
	entryPath := filepath.ToSlash(filepath.Clean(app.Entrypoint))
	switch runtime {
	case "nodejs":
		if !entrySeen {
			return nil, "", nil, fmt.Errorf("entrypoint %q is not among the application's script files", app.Entrypoint)
		}
		cmd = "node " + shellQuotePath(entryPath)
	case "python":
		if !entrySeen {
			return nil, "", nil, fmt.Errorf("entrypoint %q is not among the application's script files", app.Entrypoint)
		}
		cmd = "python3 " + shellQuotePath(entryPath)
	case "bash":
		if !entrySeen {
			return nil, "", nil, fmt.Errorf("entrypoint %q is not among the application's script files", app.Entrypoint)
		}
		cmd = "sh " + shellQuotePath(entryPath)
	case "custom":
		cmd = strings.TrimSpace(app.Entrypoint)
		if cmd == "" {
			return nil, "", nil, fmt.Errorf("custom runtime applications need their entrypoint set to the full command line")
		}
	default:
		return nil, "", nil, fmt.Errorf("unsupported runtime %q", app.Runtime)
	}
	return files, cmd, wireEnv, nil
}

// isAppEnvName mirrors the POSIX identifier rule the edge enforces so bad
// keys are rejected at the panel with a clear message instead of being
// silently dropped remotely.
func isAppEnvName(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r == '_' {
			continue
		}
		if r < 'A' || (r > 'Z' && r < 'a') || r > 'z' {
			if r < '0' || r > '9' || i == 0 {
				return false
			}
		}
	}
	return true
}

func shellQuotePath(p string) string {
	return "'" + strings.ReplaceAll(p, "'", "'\\''") + "'"
}

// runOnNode dispatches a run to a registered edge node.
func runOnNode(ctx context.Context, nodeID int64, mode, workload, cmd string, files []edge.ExecFile, env map[string]string, timeout int) (string, string, int, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return "", "", 0, fmt.Errorf("open db: %w", err)
	}
	defer con.Close()
	nodeRepo := repository.NewNodeRepository(con)
	node, err := nodeRepo.GetNode(nodeID)
	if err != nil {
		return "", "", 0, fmt.Errorf("node not found (id %d)", nodeID)
	}
	token, err := nodeRepo.PlainToken(node.ID)
	if err != nil || token == "" {
		return "", "", 0, fmt.Errorf("edge token unavailable for node %q — rotate the token or re-create the node", node.Name)
	}
	client := edge.NewWithTimeout(*node, token, time.Duration(timeout+15)*time.Second)
	if mode == models.AppExecModeHost {
		resp, herr := client.HostExec(edge.HostExecRequest{Command: cmd, Files: files, Env: env, TimeoutSec: timeout})
		return resp.Stdout, resp.Stderr, resp.ExitCode, herr
	}
	resp, eerr := client.Exec(edge.ExecRequest{
		Kind: mode, Name: workload, Command: cmd, Files: files, Env: env, TimeoutSec: timeout,
	})
	return resp.Stdout, resp.Stderr, resp.ExitCode, eerr
}

// runOnLocalNode finds a localhost edge (the `setup:localnode` install) and
// routes the run through it. dialed=false means no local node exists and the
// caller may use its own fallback.
func runOnLocalNode(ctx context.Context, repo *repository.ApplicationRepository, mode, workload, cmd string, files []edge.ExecFile, env map[string]string, timeout int) (nodeID int64, nodeName string, dialed bool, out, errOut string, exitCode int, runErr error) {
	con, err := repository.OpenDB()
	if err != nil {
		return 0, "", false, "", "", 0, fmt.Errorf("open db: %w", err)
	}
	defer con.Close()
	nodeRepo := repository.NewNodeRepository(con)
	nodes, err := nodeRepo.ListNodes()
	if err != nil {
		return 0, "", false, "", "", 0, fmt.Errorf("list nodes: %w", err)
	}
	var local *models.Node
	for i := range nodes {
		if isLocalAddress(nodes[i].Address) {
			local = &nodes[i]
			break // lowest id wins — deterministic
		}
	}
	if local == nil {
		return 0, "", false, "", "", 0, nil
	}
	token, terr := nodeRepo.PlainToken(local.ID)
	if terr != nil || token == "" {
		return local.ID, local.Name, true, "", "", 0,
			fmt.Errorf("local node %q has no usable token — re-run ./kspanel setup:localnode", local.Name)
	}
	client := edge.NewWithTimeout(*local, token, time.Duration(timeout+15)*time.Second)
	if mode == models.AppExecModeHost {
		resp, herr := client.HostExec(edge.HostExecRequest{Command: cmd, Files: files, Env: env, TimeoutSec: timeout})
		return local.ID, local.Name, true, resp.Stdout, resp.Stderr, resp.ExitCode, herr
	}
	resp, eerr := client.Exec(edge.ExecRequest{
		Kind: mode, Name: workload, Command: cmd, Files: files, Env: env, TimeoutSec: timeout,
	})
	return local.ID, local.Name, true, resp.Stdout, resp.Stderr, resp.ExitCode, eerr
}

// runOnPanelShell is the no-local-node fallback for host-mode runs: the
// panel stages the script files into a temp dir on ITS OWN filesystem and
// executes them with a minimal, non-inherited environment (the panel's own
// process env may hold secrets the script must never see).
func runOnPanelShell(ctx context.Context, cmd string, files []edge.ExecFile, env map[string]string) (string, string, int, error) {
	stage, err := os.MkdirTemp("", "ksapp-")
	if err != nil {
		return "", "", 0, fmt.Errorf("create staging dir: %w", err)
	}
	defer os.RemoveAll(stage)
	for _, f := range files {
		clean := filepath.ToSlash(filepath.Clean(f.Path))
		dest := filepath.Join(stage, filepath.FromSlash(clean))
		if !strings.HasPrefix(dest, stage+string(os.PathSeparator)) {
			return "", "", 0, fmt.Errorf("script path %q escapes the staging directory", f.Path)
		}
		if mkErr := os.MkdirAll(filepath.Dir(dest), 0o755); mkErr != nil {
			return "", "", 0, fmt.Errorf("stage dir for %q: %w", f.Path, mkErr)
		}
		if wErr := os.WriteFile(dest, []byte(f.Content), 0o755); wErr != nil {
			return "", "", 0, fmt.Errorf("stage %q: %w", f.Path, wErr)
		}
	}
	shCmd := exec.CommandContext(ctx, "/bin/sh", "-c", cmd)
	shCmd.Dir = stage
	// Minimal environment: PATH plus the run's own variables. Nothing else
	// leaks from the panel process.
	shCmd.Env = append([]string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"HOME=" + stage,
		"TMPDIR=" + stage,
	}, flattenAppEnv(env)...)

	stdout, perr := shCmd.StdoutPipe()
	if perr != nil {
		return "", "", 0, perr
	}
	stderr, perr := shCmd.StderrPipe()
	if perr != nil {
		return "", "", 0, perr
	}
	if serr := shCmd.Start(); serr != nil {
		return "", "", 0, fmt.Errorf("start shell: %w", serr)
	}
	type readResult struct {
		b   []byte
		err error
	}
	stdoutCh := make(chan readResult, 1)
	stderrCh := make(chan readResult, 1)
	go func() {
		b, e := io.ReadAll(stdout)
		stdoutCh <- readResult{b, e}
	}()
	go func() {
		b, e := io.ReadAll(stderr)
		stderrCh <- readResult{b, e}
	}()
	outRes := <-stdoutCh
	errRes := <-stderrCh
	exitCode := 0
	if werr := shCmd.Wait(); werr != nil {
		if ee, ok := werr.(*exec.ExitError); ok && ee.ExitCode() >= 0 {
			exitCode = ee.ExitCode()
		} else if ctx.Err() != nil {
			errRes.b = append(errRes.b, []byte("\nrun exceeded the timeout and was killed")...)
			exitCode = 124
		} else {
			errRes.b = append(errRes.b, []byte("\n"+werr.Error())...)
			exitCode = -1
		}
	}
	return string(outRes.b), string(errRes.b), exitCode, nil
}

// flattenAppEnv converts the run's env map into KEY=VALUE process env
// entries (keys are already validated POSIX identifiers by
// buildAppRunPayload; empty values are dropped there too).
func flattenAppEnv(env map[string]string) []string {
	out := make([]string, 0, len(env))
	for k, v := range env {
		out = append(out, k+"="+v)
	}
	return out
}

func truncateRunOutput(s string) string {
	if len(s) > appRunMaxOutputBytes {
		return s[:appRunMaxOutputBytes]
	}
	return s
}

func appRunErrText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
