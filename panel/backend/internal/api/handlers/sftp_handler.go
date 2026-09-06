// Package handlers: sftp_handler.go owns the per-instance SFTP credential
// endpoints. The panel mints username inst_<id> + a 32-byte random password,
// vaults the password in instance_secrets (secretbox AES-256-GCM, key
// "sftp_password"), records the dial parameters in instance_sftp (migration
// 058), and pushes the identity to the edge's in-memory SFTP server via
// edge.Client Provision/Delete.
//
// Routes (gates set in server.go):
//
//	GET  /api/instances/{id}/sftp          — masked dial params (VIEW_INSTANCES)
//	POST /api/instances/{id}/sftp/enable   — mint + vault + provision (INSTANCES_EDIT)
//	POST /api/instances/{id}/sftp/rotate   — new password + re-provision (INSTANCES_EDIT)
//	POST /api/instances/{id}/sftp/disable  — edge delete + row + vault removal (INSTANCES_EDIT)
//
// The custom sftp.json instance page calls fetchPanel('/sftp') against the
// GET route; the SPA InstanceSftpCard drives the POST routes plus
// GET ?reveal=1. Reveal is EDIT-gated + audited inline so SFTP never depends
// on the unrelated "env" page guard the generic secrets endpoint enforces.
package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// DefaultSFTPPort is the edge SSH listen port the panel dials when no row
// exists yet. It matches the edge --sftp-port default (2222) and the
// instance_sftp.port column default (migration 058).
const DefaultSFTPPort = 2222

// sftpMutMu serialises the enable/rotate/disable critical sections
// (vault write → DB upsert → edge provision). Without it two concurrent
// rotates could interleave vault and edge writes so the vaulted password no
// longer matches the edge's bcrypt hash. SFTP mutators are rare admin
// actions; a process-wide lock is cheaper than per-instance striping.
var sftpMutMu sync.Mutex

// sftpUsername mints the panel-side SFTP login for an instance.
func sftpUsername(id int64) string {
	return fmt.Sprintf("inst_%d", id)
}

// sftpMintPassword generates 32 random bytes, base64-encoded (44 chars).
// 32B matches the task spec ("32B random pass"); base64 keeps it
// paste-safe for FileZilla / WinSCP / CLI without shell quoting hazards.
func sftpMintPassword() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

// sftpRootForInstance resolves the chroot root for an instance: the host
// side of its first declared bind-mount (with %INSTANCE_NAME% substituted,
// mirroring hostPathForInstance). Returns "" when the instance declares no
// mounts — the edge then falls back to its deterministic per-user default.
// A dangerous or relative host path also degrades to "" (fail closed; the
// edge re-validates with isDangerousPath anyway).
func sftpRootForInstance(con sqlDB, inst *models.Instance) string {
	mounts := instanceMounts(con, inst)
	for _, m := range mounts {
		host := strings.TrimSpace(m.host())
		if host == "" {
			continue
		}
		name := inst.ExternalID
		if name == "" {
			name = inst.Name
		}
		host = strings.ReplaceAll(host, "%INSTANCE_NAME%", name)
		if !strings.HasPrefix(host, "/") {
			continue
		}
		lower := strings.ToLower(host)
		for _, d := range []string{"/bin", "/sbin", "/usr", "/etc", "/proc", "/sys", "/dev", "/boot", "/lib", "/lib64", "/root"} {
			if lower == d || strings.HasPrefix(lower, d+"/") {
				host = ""
				break
			}
		}
		if host == "" || host == "/" {
			continue
		}
		return host
	}
	return ""
}

// sftpAllocatePort picks the SFTP port for an instance. The edge exposes ONE
// shared SSH listener (--sftp-port, default 2222) for every inst_<id>, so
// the dial port is always DefaultSFTPPort; this helper exists to consult the
// instance_ports table (055) first so a docker -p allocation squatting 2222
// on the same node surfaces as a warning instead of a silent connect
// failure. It returns the port plus an optional warning for the response.
func sftpAllocatePort(con sqlDB, nodeID int64) (int, string) {
	var n int
	if err := con.QueryRow(
		`SELECT COUNT(*) FROM instance_ports p
		 JOIN instances i ON i.id = p.instance_id
		 WHERE i.node_id = ? AND p.host_port = ?`, nodeID, DefaultSFTPPort,
	).Scan(&n); err == nil && n > 0 {
		return DefaultSFTPPort, fmt.Sprintf(
			"host port %d is also allocated to a container (instance_ports); SFTP still dials :%d — remove the colliding -p mapping if connects fail",
			DefaultSFTPPort, DefaultSFTPPort)
	}
	return DefaultSFTPPort, ""
}

// sftpEdgeClient resolves the owning node + token + edge client for SFTP
// RPCs. It mirrors loadInstNode but keeps its own DB handle so callers that
// already hold a connection don't double-open.
func sftpEdgeClient(con sqlDB, inst *models.Instance) (*edge.Client, string, error) {
	nodeRepo := repository.NewNodeRepository(con)
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		return nil, "", fmt.Errorf("owner node not found")
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		return nil, "", fmt.Errorf("node has no usable edge token")
	}
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	return edge.NewWithTimeout(*node, token, 30*time.Second), name, nil
}

// sftpOwnScope enforces INSTANCES_OWN: Own may only read/mutate own
// instances. Returns false (and writes) on denial. Fail closed on checker
// errors so a DB blip never opens another owner's dial address.
func sftpOwnScope(w http.ResponseWriter, r *http.Request, con sqlDB, inst *models.Instance) bool {
	uid, uerr := UserIDFromContext(r)
	if uerr != nil || uid == 0 {
		return true
	}
	checker := permissions.NewChecker(con)
	hasOwn, hasAll, serr := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
	if serr != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}
	if !hasAll && hasOwn && inst.OwnerID != uid {
		http.Error(w, "forbidden: own-scope may only manage own instances", http.StatusForbidden)
		return false
	}
	return true
}

// sftpPublicView is the masked GET body shared by the SPA card and the
// sftp.json custom page (fetchPanel('/sftp')). It never carries the
// password — callers add it explicitly on the enable/rotate/reveal paths.
func sftpPublicView(inst *models.Instance, cfg *repository.SFTPConfig, nodeAddr string, hasPassword bool) map[string]any {
	port := DefaultSFTPPort
	username := sftpUsername(inst.ID)
	root := ""
	enabled := 0
	if cfg != nil {
		port = cfg.Port
		if cfg.Username != "" {
			username = cfg.Username
		}
		root = cfg.Root
		enabled = cfg.Enabled
	}
	host := strings.TrimSpace(nodeAddr)
	// The reverse_tunnel placeholder has no dialable address: the SFTP data
	// plane needs direct TCP to the edge's :2222, which a NAT-ed tunnel edge
	// cannot provide. Don't present "tunnel" as a dialable host (it produced
	// copy-pasteable but undialable sftp://…@tunnel:2222 URIs); return an
	// empty host/uri plus an explicit warning the SPA can surface.
	if host == "tunnel" || host == "" {
		return map[string]any{
			"enabled":      enabled == 1,
			"username":     username,
			"host":         "",
			"port":         port,
			"root":         root,
			"uri":          "",
			"has_password": hasPassword,
			"host_warning": "SFTP needs a direct address — reverse_tunnel has no dialable host; use direct/both/local modes for file transfer",
		}
	}
	// Node addresses are stored as host:port (edge HTTP); the SFTP dial
	// host is the bare hostname/IP without the HTTP port. Bracketed IPv6
	// ("[::1]:4040") strips to "::1"; a bare IPv6 ("::1", "2001:db8::1")
	// has no port to strip and must be kept verbatim — splitting on the
	// last colon would mangle it into ":" / "2001:db8:".
	if strings.HasPrefix(host, "[") {
		if end := strings.LastIndex(host, "]"); end > 0 {
			host = host[1:end]
		} else {
			host = strings.Trim(host, "[]")
		}
	} else if strings.Count(host, ":") == 1 {
		if h := strings.LastIndex(host, ":"); h > 0 {
			maybeHost := host[:h]
			maybePort := host[h+1:]
			if _, perr := strconv.Atoi(maybePort); perr == nil && maybeHost != "" {
				host = maybeHost
			}
		}
	}
	host = strings.Trim(host, "[]")
	uri := fmt.Sprintf("sftp://%s@%s:%d", username, host, port)
	return map[string]any{
		"enabled":      enabled == 1,
		"username":     username,
		"host":         host,
		"port":         port,
		"root":         root,
		"uri":          uri,
		"has_password": hasPassword,
	}
}

// GetSFTPHandler returns the masked SFTP dial parameters for an instance.
// 404 when never provisioned (the sftp.json page renders its "not
// provisioned" state from this). Suspended-but-provisioned rows return
// enabled=false so the page can explain the block.
//
// ?reveal=1 returns the cleartext password inline (audited as sftp.reveal).
// Reveal requires INSTANCES_EDIT (umbrella or granular, own-scope aware) so
// read-only operators and other owners can't pull passwords through the
// masked read path; it does NOT require the "env" instance page, because
// SFTP credentials are useless when reveal is gated behind an unrelated
// template page the instance never imported.
func GetSFTPHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Own-scope on reads too: the masked view still discloses the node's
	// dial address, which an OWN user must not learn for others' instances
	// (mirrors ListPortsHandler).
	if !sftpOwnScope(w, r, con, inst) {
		return
	}
	cfg, err := repository.NewSFTPRepository(con).Get(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		http.Error(w, "sftp not provisioned for this instance", http.StatusNotFound)
		return
	}
	nodeAddr := ""
	if node, nerr := repository.NewNodeRepository(con).GetNode(inst.NodeID); nerr == nil && node != nil {
		nodeAddr = node.Address
	}
	_, rerr := repository.NewSecretRepository(con).Reveal(id, repository.SFTPSecretKey)
	view := sftpPublicView(inst, cfg, nodeAddr, rerr == nil)
	if r.URL.Query().Get("reveal") != "1" {
		writeJSON(w, view)
		return
	}
	// Reveal path: EDIT-gated (umbrella MANAGE_INSTANCES or granular
	// INSTANCES_EDIT), own-scope aware, audited. Fail closed on any
	// checker error.
	uid, uerr := UserIDFromContext(r)
	if uerr != nil || uid == 0 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	checker := permissions.NewChecker(con)
	canEdit, cerr := checker.HasAnyPermission(uid, permissions.ManageInstancesKey, permissions.InstancesEditKey)
	if cerr != nil || !canEdit {
		http.Error(w, "forbidden: INSTANCES_EDIT is required to reveal the SFTP password", http.StatusForbidden)
		return
	}
	if !sftpOwnScope(w, r, con, inst) {
		return
	}
	password, perr := repository.NewSecretRepository(con).Reveal(id, repository.SFTPSecretKey)
	if perr != nil || password == "" {
		http.Error(w, "sftp password not found in vault", http.StatusNotFound)
		return
	}
	auditInst(r, id, "sftp.reveal", fmt.Sprintf("revealed SFTP password for %q", cfg.Username))
	view["password"] = password
	writeJSON(w, view)
}

// EnableSFTPHandler mints username inst_<id> + a 32B random password, vaults
// it, records the dial params, and provisions the edge. Idempotent guard:
// an already-enabled row gets 409 (use rotate); a suspended (disabled) row
// is re-enabled in place.
func EnableSFTPHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	if !sftpOwnScope(w, r, con, inst) {
		return
	}
	sftpRepo := repository.NewSFTPRepository(con)
	if existing, _ := sftpRepo.Get(id); existing != nil && existing.Enabled == 1 {
		http.Error(w, "sftp already enabled for this instance (use rotate to mint a new password)", http.StatusConflict)
		return
	}
	if suspended, _, _ := repository.NewInstanceRepository(con).IsInstanceSuspended(id); suspended {
		http.Error(w, "instance is suspended — unsuspend before enabling SFTP", http.StatusForbidden)
		return
	}
	sftpMutMu.Lock()
	defer sftpMutMu.Unlock()
	// Re-check under the lock so a concurrent enable can't mint twice.
	if existing2, _ := sftpRepo.Get(id); existing2 != nil && existing2.Enabled == 1 {
		http.Error(w, "sftp already enabled for this instance (use rotate to mint a new password)", http.StatusConflict)
		return
	}
	password, err := sftpMintPassword()
	if err != nil {
		http.Error(w, "failed to mint password", http.StatusInternalServerError)
		return
	}
	username := sftpUsername(id)
	root := sftpRootForInstance(con, inst)
	port, portWarning := sftpAllocatePort(con, inst.NodeID)

	secRepo := repository.NewSecretRepository(con)
	if _, err := secRepo.Set(id, repository.SFTPSecretKey, password, true, "SFTP password for "+username); err != nil {
		http.Error(w, "failed to vault password", http.StatusInternalServerError)
		return
	}
	if err := sftpRepo.Upsert(repository.SFTPConfig{
		InstanceID: id, Enabled: 1, Username: username, Port: port, Root: root,
	}); err != nil {
		http.Error(w, "failed to store sftp config", http.StatusInternalServerError)
		return
	}
	ec, workload, ecErr := sftpEdgeClient(con, inst)
	edgeErr := ""
	if ecErr != nil {
		edgeErr = ecErr.Error()
	} else if _, err := ec.ProvisionSFTP(edge.SFTPProvisionRequest{
		Kind: inst.Kind, Name: workload, Username: username, Password: password, Root: root,
	}); err != nil {
		edgeErr = err.Error()
	}
	auditInst(r, id, "sftp.enable", fmt.Sprintf("enabled SFTP for %q (port %d)", username, port))
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "sftp.enable",
		TargetID: &id, Message: fmt.Sprintf("enabled SFTP for instance %q (%s)", inst.Name, username),
	})
	nodeAddr := ""
	if node, nerr := repository.NewNodeRepository(con).GetNode(inst.NodeID); nerr == nil && node != nil {
		nodeAddr = node.Address
	}
	resp := sftpPublicView(inst, &repository.SFTPConfig{
		InstanceID: id, Enabled: 1, Username: username, Port: port, Root: root,
	}, nodeAddr, true)
	// The cleartext is returned ONCE so the operator can copy it into
	// FileZilla now; later reads go through the audited secrets reveal.
	resp["password"] = password
	if edgeErr != "" {
		resp["edge_error"] = edgeErr
		resp["edge_warning"] = "credentials vaulted but edge provision failed; rotate to retry"
	}
	if portWarning != "" {
		resp["port_warning"] = portWarning
	}
	writeJSONStatus(w, http.StatusCreated, resp)
}

// RotateSFTPHandler mints a fresh password, re-vaults, and re-provisions the
// edge. Requires an existing row (enable first).
func RotateSFTPHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	if !sftpOwnScope(w, r, con, inst) {
		return
	}
	sftpRepo := repository.NewSFTPRepository(con)
	cfg, err := sftpRepo.Get(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		http.Error(w, "sftp not provisioned for this instance (enable first)", http.StatusNotFound)
		return
	}
	if suspended, _, _ := repository.NewInstanceRepository(con).IsInstanceSuspended(id); suspended {
		http.Error(w, "instance is suspended — unsuspend before rotating SFTP", http.StatusForbidden)
		return
	}
	sftpMutMu.Lock()
	defer sftpMutMu.Unlock()
	password, err := sftpMintPassword()
	if err != nil {
		http.Error(w, "failed to mint password", http.StatusInternalServerError)
		return
	}
	username := cfg.Username
	if username == "" {
		username = sftpUsername(id)
	}
	secRepo := repository.NewSecretRepository(con)
	if _, err := secRepo.Set(id, repository.SFTPSecretKey, password, true, "SFTP password for "+username); err != nil {
		http.Error(w, "failed to vault password", http.StatusInternalServerError)
		return
	}
	// Re-resolve the root so a mount added after the first enable takes
	// effect on rotate; keep the stored port stable.
	root := sftpRootForInstance(con, inst)
	if err := sftpRepo.Upsert(repository.SFTPConfig{
		InstanceID: id, Enabled: 1, Username: username, Port: cfg.Port, Root: root,
	}); err != nil {
		http.Error(w, "failed to store sftp config", http.StatusInternalServerError)
		return
	}
	ec, workload, ecErr := sftpEdgeClient(con, inst)
	edgeErr := ""
	if ecErr != nil {
		edgeErr = ecErr.Error()
	} else if _, err := ec.ProvisionSFTP(edge.SFTPProvisionRequest{
		Kind: inst.Kind, Name: workload, Username: username, Password: password, Root: root,
	}); err != nil {
		edgeErr = err.Error()
	}
	auditInst(r, id, "sftp.rotate", fmt.Sprintf("rotated SFTP password for %q", username))
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "sftp.rotate",
		TargetID: &id, Message: fmt.Sprintf("rotated SFTP password for instance %q (%s)", inst.Name, username),
	})
	nodeAddr := ""
	if node, nerr := repository.NewNodeRepository(con).GetNode(inst.NodeID); nerr == nil && node != nil {
		nodeAddr = node.Address
	}
	resp := sftpPublicView(inst, &repository.SFTPConfig{
		InstanceID: id, Enabled: 1, Username: username, Port: cfg.Port, Root: root,
	}, nodeAddr, true)
	resp["password"] = password
	if edgeErr != "" {
		resp["edge_error"] = edgeErr
		resp["edge_warning"] = "password rotated in vault but edge re-provision failed; rotate again to retry"
	}
	writeJSON(w, resp)
}

// DisableSFTPHandler removes SFTP entirely: edge creds + DB row + vault
// secret. Suspend (soft block) is separate — it keeps the vault so
// unsuspend can restore without minting a new password.
func DisableSFTPHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	if !sftpOwnScope(w, r, con, inst) {
		return
	}
	cfg, _ := repository.NewSFTPRepository(con).Get(id)
	username := sftpUsername(id)
	if cfg != nil && cfg.Username != "" {
		username = cfg.Username
	}
	sftpMutMu.Lock()
	defer sftpMutMu.Unlock()
	// Best-effort edge delete: a down edge must not block the panel-side
	// removal (the credential dies with the edge restart anyway, and the
	// next provision overwrites it).
	if ec, _, ecErr := sftpEdgeClient(con, inst); ecErr == nil {
		_, _ = ec.DeleteSFTP(edge.SFTPDeleteRequest{Username: username})
	}
	_ = repository.NewSFTPRepository(con).Delete(id)
	_ = repository.NewSecretRepository(con).Delete(id, repository.SFTPSecretKey)
	auditInst(r, id, "sftp.disable", fmt.Sprintf("disabled SFTP for %q", username))
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "sftp.disable",
		TargetID: &id, Message: fmt.Sprintf("disabled SFTP for instance %q (%s)", inst.Name, username),
	})
	writeJSON(w, map[string]any{"ok": true})
}

// provisionSFTPForInstance is the shared Deploy/Start/Unsuspend helper: it
// reads the vaulted password + stored dial params and pushes them to the
// edge. Best-effort by contract — callers log but never fail the lifecycle
// action when the edge is down (the credential can be re-pushed via rotate).
func provisionSFTPForInstance(con sqlDB, inst *models.Instance) error {
	cfg, err := repository.NewSFTPRepository(con).Get(inst.ID)
	if err != nil || cfg == nil || cfg.Enabled != 1 {
		return nil
	}
	password, err := repository.NewSecretRepository(con).Reveal(inst.ID, repository.SFTPSecretKey)
	if err != nil || password == "" {
		return fmt.Errorf("no vaulted sftp password")
	}
	ec, workload, err := sftpEdgeClient(con, inst)
	if err != nil {
		return err
	}
	_, err = ec.ProvisionSFTP(edge.SFTPProvisionRequest{
		Kind: inst.Kind, Name: workload, Username: cfg.Username, Password: password, Root: cfg.Root,
	})
	return err
}

// removeSFTPFromEdge is the shared Destroy/Suspend helper: best-effort edge
// delete for the instance's username (unknown usernames are OK on the edge).
func removeSFTPFromEdge(con sqlDB, inst *models.Instance) {
	cfg, _ := repository.NewSFTPRepository(con).Get(inst.ID)
	username := sftpUsername(inst.ID)
	if cfg != nil && cfg.Username != "" {
		username = cfg.Username
	}
	if ec, _, err := sftpEdgeClient(con, inst); err == nil {
		_, _ = ec.DeleteSFTP(edge.SFTPDeleteRequest{Username: username})
	}
}

// autoProvisionSFTPOnDeploy mints + vaults + records + pushes SFTP for a
// freshly-deployed instance. Best-effort: any failure is logged and the
// deploy still succeeds (the operator retries via rotate). Skips when a row
// already exists (re-deploy race) so it never clobbers a live password.
func autoProvisionSFTPOnDeploy(con sqlDB, id int64) {
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		return
	}
	sftpRepo := repository.NewSFTPRepository(con)
	if existing, _ := sftpRepo.Get(id); existing != nil {
		return
	}
	password, err := sftpMintPassword()
	if err != nil {
		log.Printf("sftp auto-provision for instance %d: mint failed: %v", id, err)
		return
	}
	username := sftpUsername(id)
	root := sftpRootForInstance(con, inst)
	port, _ := sftpAllocatePort(con, inst.NodeID)
	if _, err := repository.NewSecretRepository(con).Set(id, repository.SFTPSecretKey, password, true, "SFTP password for "+username); err != nil {
		log.Printf("sftp auto-provision for instance %d: vault failed: %v", id, err)
		return
	}
	if err := sftpRepo.Upsert(repository.SFTPConfig{
		InstanceID: id, Enabled: 1, Username: username, Port: port, Root: root,
	}); err != nil {
		log.Printf("sftp auto-provision for instance %d: store failed: %v", id, err)
		return
	}
	ec, workload, err := sftpEdgeClient(con, inst)
	if err != nil {
		log.Printf("sftp auto-provision for instance %d: edge client: %v", id, err)
		return
	}
	if _, err := ec.ProvisionSFTP(edge.SFTPProvisionRequest{
		Kind: inst.Kind, Name: workload, Username: username, Password: password, Root: root,
	}); err != nil {
		log.Printf("sftp auto-provision for instance %d: edge provision failed (rotate to retry): %v", id, err)
	}
}
