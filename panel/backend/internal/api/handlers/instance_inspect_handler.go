// Package handlers: instance_inspect_handler.go owns the rpc-and-cache
// endpoints that proxy edge inspect/snapshot to the per-instance Processes,
// Metrics, Ports, Snapshots and Audit pages. Each "read" endpoint refreshes
// the cached live state from the edge; each "action" endpoint issues a
// snapshot RPC and persists the returned reference.

package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// inspectTimeout caps how long the panel will wait on the edge's
// /api/edge/inspect before giving up. The SPA's axios client aborts at 15s
// (see web/src/api/client.ts); if the edge hasn't answered by ~10s it is
// wedged and we'd otherwise let the browser give up first, surfacing the
// operator-hostile "timeout of 15000ms exceeded" banner then piling up
// overlapping slow requests on the 5s poll. Aborting at 10s lets us fall
// back to the cached live state and return a fast, complete response so the
// page keeps painting the last-known metrics instead of an eternal spinner.
const inspectTimeout = 10 * time.Second

// refreshLiveState dials the edge's /api/edge/inspect for the instance and
// returns the cached live state. It builds its own short-timeout edge client
// (inspectTimeout) so a wedged edge aborts well before the SPA's 15s cutoff;
// the ec passed in by loadInstNode (30s) is only used when a custom timeout
// isn't applicable. On edge failure it falls back to returning the
// previously cached state (if any) so the page still paints.
func refreshLiveState(inst *models.Instance, ec *edge.Client) *models.InstanceLiveState {
	con, err := repository.OpenDB()
	if err != nil {
		return nil
	}
	defer con.Close()
	liveRepo := repository.NewLiveStateRepository(con)

	// Build a short-timeout client so a slow/hung edge aborts fast and we
	// can serve the cache instead of letting the SPA time out first.
	inspectClient := ec
	nodeRepo := repository.NewNodeRepository(con)
	if node, nerr := nodeRepo.GetNode(inst.NodeID); nerr == nil {
		if token, terr := nodeRepo.PlainToken(inst.NodeID); terr == nil && token != "" {
			inspectClient = edge.NewWithTimeout(*node, token, inspectTimeout)
		}
	}

	resp, err := inspectClient.Inspect(edge.InspectRequest{Kind: inst.Kind, Name: workloadName(inst)})
	// The previous cache is the fallback while the edge is unreachable or
	// reports an inspect failure (ok:false, which edge.Client.Inspect now
	// surfaces as an error). Serving the cache keeps the page painting the
	// last-known metrics instead of blanking every tile to "—".
	prev, _ := liveRepo.Get(inst.ID)
	if err != nil {
		return prev
	}
	// Build the fresh live state. Only overwrite each blob when the edge
	// actually supplied one; an empty blob (edge returned ok:true but the
	// driver had nothing to report for that channel) must NOT replace a
	// previously-good cached value, otherwise a single transient empty
	// poll wipes real metrics/processes/ports and the page shows "—"
	// until the next successful poll — exactly the symptom operators hit
	// when the container was running (docker ps ok) but the metrics page
	// was blank.
	ls := models.InstanceLiveState{InstanceID: inst.ID}
	if prev != nil {
		ls = *prev
	}
	if len(resp.Metrics) > 0 {
		ls.Metrics = string(resp.Metrics)
	}
	if len(resp.Processes) > 0 {
		ls.Processes = string(resp.Processes)
	}
	if len(resp.Ports) > 0 {
		ls.Ports = string(resp.Ports)
	}
	if len(resp.Info) > 0 {
		ls.Info = string(resp.Info)
	}
	if ls.Metrics == "" {
		ls.Metrics = "{}"
	}
	if ls.Processes == "" {
		ls.Processes = "[]"
	}
	if ls.Ports == "" {
		ls.Ports = "[]"
	}
	if ls.Info == "" {
		ls.Info = "{}"
	}
	_ = liveRepo.Save(ls)
	ls.UpdatedAt = time.Now()
	return &ls
}

// ExternalIDOr returns the edge-side workload name for a bare instance,
// preferring the edge-reported external_id and falling back to the supplied
// fallback. A package-level helper (not a method on models.Instance) because
// Go forbids defining new methods on a type from another package; kept here
// so callers that hold a bare instance can resolve the edge name without
// re-implementing the fallback that workloadName uses.
func ExternalIDOr(in models.Instance, fallback string) string {
	if in.ExternalID != "" {
		return in.ExternalID
	}
	return fallback
}

// workloadName returns the edge-side name of a workload, preferring the
// edge-reported external_id and falling back to the panel logical name.
func workloadName(inst *models.Instance) string {
	if inst.ExternalID != "" {
		return inst.ExternalID
	}
	return inst.Name
}

// ----- Process list --------------------------------------------------------

func ListProcessesHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "processes") {
		return
	}
	inst, ec, _, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	ls := refreshLiveState(inst, ec)
	if ls == nil {
		writeJSON(w, map[string]any{"processes": []any{}, "cached": false})
		return
	}
	// Forward raw JSON so the SPA decodes the driver-specific fields.
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(ls.Processes))
}

// validKillSignals allowlists every signal a client may request. Both pid
// and signal are spliced into a shell script run inside the instance, so an
// unvalidated value would be direct command injection (e.g.
// ?pid=1;reboot) — everything outside this set is rejected with 400.
var validKillSignals = map[string]bool{
	"TERM": true, "KILL": true, "HUP": true, "INT": true,
	"QUIT": true, "ABRT": true, "USR1": true, "USR2": true,
}

// killVerifyScript builds the POSIX sh program the edge runs INSIDE the
// instance. It sends `signal` to pid and then VERIFIES the outcome instead
// of assuming it:
//
//   - aliveness is read from /proc/<pid>/stat, treating state "Z" (zombie —
//     already dead, waiting to be reaped by its parent) as gone, because a
//     bare [ -d /proc/<pid> ] would keep reporting "alive" for zombies;
//   - when a non-KILL signal was sent, the script waits up to ~3s for the
//     process to exit and escalates to SIGKILL if it survived. This is what
//     actually makes Kill work on container workloads: the workload's main
//     process is PID 1 of its PID namespace, and the kernel silently drops
//     signals PID 1 has no handler for — SIGTERM alone often did nothing,
//     yet the old handler masked that with `|| true` and reported success;
//   - the result is printed as one JSON object so the panel can relay the
//     truth (killed / escalated) to the browser.
//
// pid is pre-validated as a positive integer and signal against the
// allowlist, so the %d/%s splices cannot inject shell metacharacters.
func killVerifyScript(pid int64, signal string) string {
	head := "" +
		"alive() {\n" +
		fmt.Sprintf("  [ -e /proc/%d/stat ] || return 1\n", pid) +
		fmt.Sprintf("  st=$(sed 's/.*) //' /proc/%d/stat 2>/dev/null | cut -d' ' -f1)\n", pid) +
		"  [ \"$st\" != \"Z\" ]\n" +
		"}\n"
	if signal == "KILL" {
		return head + fmt.Sprintf(
			"kill -KILL %d 2>/dev/null\n"+
				"sleep 0.3\n"+
				"if alive; then echo '{\"killed\":false,\"escalated\":false}'; else echo '{\"killed\":true,\"escalated\":false}'; fi\n", pid)
	}
	return head + fmt.Sprintf(
		"kill -%s %d 2>/dev/null\n"+
			"n=0\n"+
			"while alive && [ $n -lt 10 ]; do sleep 0.3; n=$((n+1)); done\n"+
			"if alive; then\n"+
			"  kill -KILL %d 2>/dev/null\n"+
			"  sleep 0.4\n"+
			"  if alive; then echo '{\"killed\":false,\"escalated\":true}'; else echo '{\"killed\":true,\"escalated\":true}'; fi\n"+
			"else\n"+
			"  echo '{\"killed\":true,\"escalated\":false}'\n"+
			"fi\n", signal, pid, pid)
}

// KillProcessHandler POSTs a kill by pid to the edge. We reuse Exec since the
// edge's exec-rpc is the only panel-routed shell. The response reports the
// VERIFIED outcome ({ok,killed,escalated}) rather than a blind success: the
// frontend reloads the list and shows an error when the process survived.
func KillProcessHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "processes") {
		return
	}
	inst, ec, name, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	pid, err := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("pid")), 10, 64)
	if err != nil || pid <= 0 {
		writeJSONStatus(w, http.StatusBadRequest, map[string]any{"error": "pid must be a positive integer"})
		return
	}
	signal := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("signal")))
	if signal == "" {
		signal = "TERM"
	}
	if !validKillSignals[signal] {
		writeJSONStatus(w, http.StatusBadRequest, map[string]any{"error": "unsupported signal " + signal})
		return
	}
	// A container workload's main process is PID 1 of its PID namespace, and
	// the kernel DROPS every fatal signal aimed at that init from inside the
	// namespace — even `kill -9 1` is a documented no-op there (verified live).
	// The only way to actually terminate it is from OUTSIDE the namespace,
	// which is precisely what a driver stop does (`docker stop` sends
	// SIGTERM→SIGKILL to PID 1 from the host). So for PID 1 skip the in-
	// instance signal round-trip entirely (it cannot work and would only add
	// ~4s of guaranteed-dead wait to the request) and stop the workload from
	// the host side. The call is bounded at 25s — below the ~30s origin
	// window CDNs/tunnels enforce, which otherwise turns a slow stop into a
	// raw Cloudflare "Bad gateway" HTML page in the operator's browser.
	if pid == 1 {
		lctx, lcancel := context.WithTimeout(r.Context(), 25*time.Second)
		defer lcancel()
		lc, lerr := ec.LifecycleCtx(lctx, edge.LifecycleRequest{Action: "stop", Kind: inst.Kind, Name: name})
		switch {
		case lerr != nil:
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "pid 1 survives all signals inside the instance and stopping the workload failed: " + lerr.Error(),
			})
			return
		case !lc.OK:
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "pid 1 survives all signals inside the instance and stopping the workload was rejected" + lifecycleErrSuffix(lc.Error),
			})
			return
		}
		auditInst(r, inst.ID, "process.kill", fmt.Sprintf(
			"pid 1 survives all signals inside the namespace — stopped the workload (requested signal: %s)", signal))
		writeJSON(w, map[string]any{"ok": true, "killed": true, "escalated": false, "stopped_instance": true})
		return
	}

	resp, err := ec.Exec(edge.ExecRequest{
		Kind: inst.Kind, Name: name,
		Command:    killVerifyScript(pid, signal),
		TimeoutSec: 12,
	})
	if err != nil {
		msg := err.Error()
		// "container is not running" is not a gateway failure — the instance
		// is simply stopped. Surface as 400 so the UI shows "instance not
		// running" instead of the generic 502 that the SDK collapses to
		// "Panel unreachable (HTTP 502)" when the proxy returns HTML.
		if strings.Contains(strings.ToLower(msg), "is not running") || strings.Contains(strings.ToLower(msg), "no such container") {
			writeJSONStatus(w, http.StatusBadRequest, map[string]any{"error": "instance is not running"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]any{"error": "edge exec failed: " + msg})
		return
	}
	if !resp.OK {
		msg := resp.Error
		if strings.Contains(strings.ToLower(msg), "is not running") || strings.Contains(strings.ToLower(msg), "no such container") {
			writeJSONStatus(w, http.StatusBadRequest, map[string]any{"error": "instance is not running"})
			return
		}
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{"error": "edge rejected kill: " + msg})
		return
	}
	// Parse the verification JSON the in-instance script printed. An
	// unparsable result is surfaced honestly instead of pretending the kill
	// worked (that silent lie was the bug this handler used to have).
	var out struct {
		Killed    bool `json:"killed"`
		Escalated bool `json:"escalated"`
	}
	stdout := strings.TrimSpace(resp.Stdout)
	stderr := strings.TrimSpace(resp.Stderr)
	line := stdout
	if idx := strings.LastIndexByte(stdout, '\n'); idx >= 0 {
		line = stdout[idx+1:]
	}
	if jerr := json.Unmarshal([]byte(line), &out); jerr != nil {
		// When the container stops as a side-effect of killing its keep-alive
		// (e.g. the `sleep infinity` that backs `zdfgh`'s wait loop), the
		// docker exec session is torn down before it can print the JSON —
		// stdout is empty and stderr carries "is not running". Treat that as
		// a successful kill (the process is gone because the workload stopped)
		// rather than a 502 that the SDK collapses to "Panel unreachable".
		combined := strings.ToLower(stdout + " " + stderr)
		if strings.Contains(combined, "is not running") || strings.Contains(combined, "no such container") {
			// The container stopped — the target pid is gone (or the whole
			// workload is). Report as killed so the UI can toast success and
			// reload the (now empty) process list.
			detail := fmt.Sprintf("sent %s to pid %d (killed=true, container stopped)", signal, pid)
			auditInst(r, inst.ID, "process.kill", detail)
			writeJSON(w, map[string]any{"ok": true, "killed": true, "escalated": false, "stopped_instance": true})
			return
		}
		// Empty stdout with no container-stopped hint is often the exec
		// session being killed when its own container exits (killing the
		// keep-alive `sleep`). The process is still gone, so report success
		// rather than a 502 that surfaces as "Panel unreachable (HTTP 502)"
		// in the iframe SDK.
		//
		// Docker's exec session appends "exit status 137/143" to stderr when
		// the container stops mid-exec (SIGKILL/SIGTERM), so stderr is NOT
		// empty even though stdout is. Treat any empty stdout as session-
		// closed success, marking it stopped_instance when exit-status hints
		// at container termination.
		if strings.TrimSpace(stdout) == "" {
			lowerStderr := strings.ToLower(stderr)
			isExit := strings.Contains(lowerStderr, "exit status")
			detail := fmt.Sprintf("sent %s to pid %d (killed=true, session closed)", signal, pid)
			if isExit {
				detail = fmt.Sprintf("sent %s to pid %d (killed=true, container stopped)", signal, pid)
				auditInst(r, inst.ID, "process.kill", detail)
				writeJSON(w, map[string]any{"ok": true, "killed": true, "escalated": false, "stopped_instance": true})
				return
			}
			auditInst(r, inst.ID, "process.kill", detail)
			writeJSON(w, map[string]any{"ok": true, "killed": true, "escalated": false})
			return
		}
		snippet := stdout
		if len(snippet) > 300 {
			snippet = snippet[:300]
		}
		// Return 200 with killed:false so the frontend's `then` branch can
		// render "Process survived" instead of the `catch` branch's generic
		// "Panel unreachable (HTTP 502)" (502 bodies from CDNs are HTML and
		// collapse to that string via sanitizeHttpError).
		writeJSON(w, map[string]any{"ok": true, "killed": false, "escalated": false, "error": "kill could not be verified", "detail": snippet})
		return
	}
	detail := fmt.Sprintf("sent %s to pid %d (killed=%v, escalated=%v)", signal, pid, out.Killed, out.Escalated)
	auditInst(r, inst.ID, "process.kill", detail)
	writeJSON(w, map[string]any{"ok": true, "killed": out.Killed, "escalated": out.Escalated})
}

// lifecycleErrSuffix appends the edge's error text (if any) to a fixed
// prefix without leaking an empty delimiter.
func lifecycleErrSuffix(errText string) string {
	if strings.TrimSpace(errText) == "" {
		return ""
	}
	return ": " + errText
}

// ----- Metrics --------------------------------------------------------------

func MetricsHandler(w http.ResponseWriter, r *http.Request) {
	// The metrics feed powers the Home page's resource tiles (RAM / CPU /
	// disk) as well as the Metrics page itself, so an instance whose
	// template enabled either page may read it. Instances with neither get
	// the same structured 403 as before.
	if !guardInstancePageAny(w, r, "metrics", "home", ".") {
		return
	}
	inst, ec, _, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	ls := refreshLiveState(inst, ec)
	if ls == nil {
		writeJSON(w, map[string]any{})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(ls.Metrics))
}

// ----- Ports moved to instance_port_handler.go (ListPortsHandler now merges DB allocs) -----

// ----- Snapshots ------------------------------------------------------------

func ListSnapshotsHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
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
	snaps, err := repository.NewSnapshotRepository(con).List(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, snaps)
}

type snapshotCreateRequest struct {
	Name     string `json:"name"`
	Note     string `json:"note"`
	Type     string `json:"type"`     // e.g., "zip", "tar", "docker", "lxd"
	Location string `json:"location"` // e.g., "/mc/", "/tmp/snapshots/"
}

func CreateSnapshotHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	inst, ec, name, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	var req snapshotCreateRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if err := validateSnapshotName(req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resp, err := ec.Snapshot(edge.SnapshotRequest{
		Kind: inst.Kind, Name: name, Action: "create", SnapName: req.Name,
		Type: req.Type, Location: req.Location,
	})
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge rejected snapshot: " + err.Error(),
		})
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	snapID, _ := repository.NewSnapshotRepository(con).Create(models.InstanceSnapshot{
		InstanceID: inst.ID, Name: req.Name, ExternalRef: resp.ExternalRef, SizeBytes: resp.SizeBytes, Note: req.Note,
	})
	auditInst(r, inst.ID, "snapshot.create", fmt.Sprintf("created snapshot %q (ref=%s)", req.Name, resp.ExternalRef))
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": snapID, "external_ref": resp.ExternalRef})
}

func RestoreSnapshotHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	inst, ec, name, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	snapName := chi.URLParam(r, "snap_name")
	if strings.TrimSpace(snapName) == "" {
		http.Error(w, "snapshot name is required", http.StatusBadRequest)
		return
	}
	if err := validateSnapshotName(snapName); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_, err := ec.Snapshot(edge.SnapshotRequest{
		Kind: inst.Kind, Name: name, Action: "restore", SnapName: snapName,
	})
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge rejected restore: " + err.Error(),
		})
		return
	}
	auditInst(r, inst.ID, "snapshot.restore", fmt.Sprintf("restored %q", snapName))
	writeJSON(w, map[string]any{"ok": true})
}

func DeleteSnapshotHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	inst, ec, name, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	snapName := chi.URLParam(r, "snap_name")
	if strings.TrimSpace(snapName) == "" {
		http.Error(w, "snapshot name is required", http.StatusBadRequest)
		return
	}
	if err := validateSnapshotName(snapName); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_, _ = ec.Snapshot(edge.SnapshotRequest{
		Kind: inst.Kind, Name: name, Action: "delete", SnapName: snapName,
	})
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	_ = repository.NewSnapshotRepository(con).Delete(inst.ID, snapName)
	auditInst(r, inst.ID, "snapshot.delete", fmt.Sprintf("deleted %q", snapName))
	w.WriteHeader(http.StatusNoContent)
}

// ----- Cached live-state (bulk read, no edge dial) --------------------------

// CachedResourcesItem is the shape the SPA's InstanceCard reads when its own
// stored config has no `limits` block. Keys are panel-friendly metric names
// so the card can show the workload's reported reservation (mem_total /
// disk_total) or "—" when the cache is empty.
type CachedResourcesItem struct {
	ID        int64   `json:"id"`
	CPUPct    float64 `json:"cpu_pct"`
	MemUsed   int64   `json:"mem_used"`
	MemTotal  int64   `json:"mem_total"`
	DiskUsed  int64   `json:"disk_used"`
	DiskTotal int64   `json:"disk_total"`
	UpdatedAt string  `json:"updated_at"`
}

// ListCachedResourcesHandler returns the cached live-state resource snapshot
// for every instance in one DB read, with no per-instance edge dial. The
// InstanceCard uses this as a fallback when its instance row's stored config
// has no `limits` block — the cached values are then displayed as the
// workload's reported reservation until the user actually re-deploys with
// explicit limits.
//
// A failure to read a single row's metrics blob (malformed JSON) is treated
// as "no data" for that row; the response is best-effort, never 5xx, so a
// noisy cache can't break the listing page.
func ListCachedResourcesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Ownership scope: Own without All sees only own instances' cache. Fail closed on checker error.
	var allowed map[int64]bool
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, serr := chk.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if serr != nil {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !hasAll && hasOwn {
			allowed = map[int64]bool{}
			if owned, oerr := repository.NewInstanceRepository(con).ListByOwner(uid); oerr == nil {
				for _, o := range owned {
					allowed[o.ID] = true
				}
			}
		}
	}

	rows, err := con.Query(`SELECT instance_id, updated_at, metrics FROM instance_live_state`)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := []CachedResourcesItem{}
	for rows.Next() {
		var id int64
		var updated string
		var metricsBlob string
		if err := rows.Scan(&id, &updated, &metricsBlob); err != nil {
			continue
		}
		if allowed != nil && !allowed[id] {
			continue
		}
		item := CachedResourcesItem{ID: id, UpdatedAt: updated}
		var m map[string]any
		if json.Unmarshal([]byte(metricsBlob), &m) == nil {
			if v, ok := m["cpu_pct"].(float64); ok {
				item.CPUPct = v
			}
			if v, ok := m["mem_used"].(float64); ok {
				item.MemUsed = int64(v)
			} else if v, ok := m["mem_used"].(int64); ok {
				item.MemUsed = v
			}
			if v, ok := m["mem_total"].(float64); ok {
				item.MemTotal = int64(v)
			} else if v, ok := m["mem_total"].(int64); ok {
				item.MemTotal = v
			}
			if v, ok := m["disk_used"].(float64); ok {
				item.DiskUsed = int64(v)
			} else if v, ok := m["disk_used"].(int64); ok {
				item.DiskUsed = v
			}
			if v, ok := m["disk_total"].(float64); ok {
				item.DiskTotal = int64(v)
			} else if v, ok := m["disk_total"].(int64); ok {
				item.DiskTotal = v
			}
		}
		out = append(out, item)
	}
	writeJSON(w, out)
}

// validateSnapshotName rejects hostile snapshot names (path traversal /
// separators) before they reach the edge driver, which materialises the
// name as a filename. Fail closed with a 400 reason.
func validateSnapshotName(name string) error {
	n := strings.TrimSpace(name)
	if n == "" {
		return fmt.Errorf("snapshot name is required")
	}
	if len(n) > 128 {
		return fmt.Errorf("snapshot name too long (max 128)")
	}
	if strings.Contains(n, "/") || strings.Contains(n, "\\") || strings.Contains(n, "..") {
		return fmt.Errorf("snapshot name must not contain path separators")
	}
	return nil
}

// ----- Per-instance audit ---------------------------------------------------

func ListInstanceAuditHandler(w http.ResponseWriter, r *http.Request) {
	// The audit feed is used by the Home page (slug ".") as well as the
	// dedicated Audit page (slug "audit"). Allow both so custom pages that
	// replace the built-in Home page can still fetch the audit log.
	if !guardInstancePageAny(w, r, "audit", "home", ".") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	rows, err := repository.NewInstanceAuditRepository(con).List(id, limit)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}
