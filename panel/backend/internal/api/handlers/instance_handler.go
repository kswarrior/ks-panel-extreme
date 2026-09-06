package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/modengine"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// templateActionSpec is the subset of a template's spec.actions[i] entry
// InvokeActionHandler / StopActionHandler consume. Kept narrow on purpose:
// missing fields default to their zero value, which is safe behaviour for the
// action runtime (no auto_start, no retries, no ignore_errors, no
// stop_command). The full set lives in the TS-side TemplateForm; this struct
// only needs what panel orchestration consumes — identity, lifecycle flags,
// the optional stop_command, stop_mode, and the steps themselves.
type templateActionSpec struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	AutoStart      bool   `json:"auto_start_instance"`
	AutoStopOnExit bool   `json:"auto_stop_on_exit"`
	// StopCommand is the optional shell command the operator edited into the
	// template action; StopActionHandler forwards it to the edge so the edge
	// runs it once INSIDE the container after cancelling the in-flight
	// workflow. Empty = no cleanup command (the workflow is just cancelled).
	StopCommand string `json:"stop_command,omitempty"`
	// StopMode controls how the stop_command is delivered:
	//   - "different" (default): exec a new shell with the stop_command
	//   - "same": write stop_command + newline to the running step's stdin pipe
	StopMode string `json:"stop_mode,omitempty"`
	// MaxRuntimeS is the operator-authored whole-workflow budget in seconds
	// (TemplateForm's "Max runtime (s)"). Empty/"0" means NO limit — the form
	// documents that as the default, and long_running actions are supposed
	// to keep a server alive until the operator clicks Stop. A positive
	// value becomes the edge workflow's hard deadline.
	MaxRuntimeS string `json:"max_runtime_s,omitempty"`
	Steps       []struct {
		Action       string `json:"action"`
		Command      string `json:"command"`
		URL          string `json:"url"`
		Filename     string `json:"filename"`
		Archive      string `json:"archive"`
		Dest         string `json:"dest"`
		From         string `json:"from"`
		To           string `json:"to"`
		Path         string `json:"path"`
		Content      string `json:"content"`
		Branch       string `json:"branch"`
		Retries      string `json:"retries"`
		IgnoreErrors bool   `json:"ignore_errors"`
	} `json:"steps"`
}

// ============================== INSTANCES ==============================
//
// Instances are bookkeeping rows on the panel; the real lifecycle runs on
// ksedge. Every deploy/start/stop/destroy handler follows the same shape:
//   1. load the instance (or template+node for deploy)
//   2. fetch the raw edge token from the node row
//   3. dial the edge over http/https (decided by node.UseTLS)
//   4. dispatch the matching action
//   5. mirror the edge's response into the instance row
//
// We keep the panel's state machine simple: "creating" → "running"/"stopped"
// → "destroyed" (which deletes the row). The edge is authoritative for the
// real workload; the panel only reflects what it was told.
//
// DEPLOY WITH INSTALL WORKFLOW:
//
// If the template's spec contains an `install[]` array, the deploy flow is:
//   a. Deploy RPC → container created (status="installing")
//   b. Edge install kick-off (async) → install_id stored
//   c. Background poller (installSweepLoop) hits edge /api/edge/install every ~2s
//   d. On done → status="running"; on failed → status="install_failed"
//
// ENV VARIABLE VALIDATION:
//
// The template's spec.env[] array defines rules (required, regex rule,
// user_editable, append/prepend). At deploy time we validate the operator's
// provided overrides against these rules and build the final KEY=VALUE map
// that goes to docker -e AND to the edge install env_vars for {{KEY}}
// substitution.

// deployRequest is the body the admin Instances page POSTs to spin up a new
// workload. TemplateID picks the driver+spec, NodeID picks the host, OwnerID
// ties the instance to the user that owns it (admins deploy on behalf of an
// owner). Overrides merge into the template's spec.json on the edge.
// EnvVars carries the operator's per-deploy values for template-defined env
// variables (validated against the template's env[] rules).
type deployRequest struct {
	TemplateID int64  `json:"template_id"`
	NodeID     int64  `json:"node_id"`
	OwnerID    int64  `json:"owner_id"`
	Name       string `json:"name"`
	// Display identity fields persisted to the instances row (migration 035).
	// The admin deploy form ships them at the top level; the card renders
	// them (InstanceCard) — they must NOT be dropped at decode time.
	DisplayName string            `json:"display_name,omitempty"`
	Icon        string            `json:"icon,omitempty"`
	Color       string            `json:"color,omitempty"`
	Overrides   map[string]any    `json:"overrides,omitempty"`
	EnvVars     map[string]string `json:"env_vars,omitempty"`
}

// envVarSpec mirrors the template's spec.env[] entry (from TemplateForm).
// Only the fields relevant for deploy-time validation are included.
type envVarSpec struct {
	Name         string `json:"name"`
	Label        string `json:"label"`
	Description  string `json:"description"`
	Default      string `json:"default"`
	UserViewable bool   `json:"user_viewable"`
	UserEditable bool   `json:"user_editable"`
	Required     bool   `json:"required"`
	Rule         string `json:"rule"`
	Display      string `json:"display"`
	Options      string `json:"options"`
	Append       bool   `json:"append"`
	Prepend      string `json:"prepend"`
	AppendValue  string `json:"append_value"`
	IsSecret     bool   `json:"is_secret"`
}

// installStepSpec mirrors the template's spec.install[] entry.
type installStepSpec struct {
	Action       string `json:"action"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	Filename     string `json:"filename"`
	Archive      string `json:"archive"`
	Dest         string `json:"dest"`
	From         string `json:"from"`
	To           string `json:"to"`
	Path         string `json:"path"`
	Content      string `json:"content"`
	Branch       string `json:"branch"`
	Retries      string `json:"retries"`
	IgnoreErrors bool   `json:"ignore_errors"`
}

// ListInstancesHandler returns every instance with joined node/template names.
// Ownership scoping: if the caller holds INSTANCES_ALL (or the umbrella
// MANAGE_INSTANCES) they see the full fleet; if they hold only INSTANCES_OWN
// they see only their own instances; when neither scope is granted the handler
// falls back to the legacy behaviour (full fleet) so existing seeded roles
// that carry only INSTANCES_VIEW keep working. The same Own/All contract is
// mirrored in GetInstanceHandler / DeployInstanceHandler / instanceAction.
func ListInstancesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	uid, _ := UserIDFromContext(r)
	// Scope-aware branching: All → full list, Own → owned only.
	if uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn {
			owned, err := repository.NewInstanceRepository(con).ListByOwner(uid)
			if err != nil {
				log.Println("ListInstances (own) error:", err)
				http.Error(w, "server error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, owned)
			return
		}
	}
	insts, err := repository.NewInstanceRepository(con).List()
	if err != nil {
		log.Println("ListInstances error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, insts)
}

// GetInstanceHandler returns a single instance row (same shape as the list
// endpoint) with joined node/template names. It exists so custom HTML pages
// running inside the sandboxed CustomPageView iframe can poll THIS instance's
// live row — status + install-workflow tracking — through the SDK's
// instance-scoped fetchPanel() bridge, which only permits paths under
// /api/instances/{id}/…. The list endpoint already exposes every row to any
// VIEW_INSTANCES holder, so this per-id read grants no new data surface.
// Ownership scoping: Own → caller must own the instance, All/umbrella → any.
func GetInstanceHandler(w http.ResponseWriter, r *http.Request) {
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
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope enforcement.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	writeJSON(w, inst)
}

// ListMyInstancesHandler returns only the instances owned by the caller. Used
// by the regular (non-admin) Instances page so users see just their own
// workloads instead of the whole fleet. Supports optional pagination via
// `page` and `page_size` query parameters (defaults: page=1, page_size=20).
func ListMyInstancesHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil || uid == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Parse pagination parameters. Only slice when the caller opted into
	// pagination (page or page_size query present); the SPA's listMyInstances()
	// calls /api/me/instances with no params and expects the full owned fleet
	// (same shape as the admin listInstances which is never paginated). Capping
	// the old default of 20 would silently hide instances past the first page.
	paginate := r.URL.Query().Has("page") || r.URL.Query().Has("page_size")
	page := 1
	pageSize := 20
	if v := r.URL.Query().Get("page"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 {
			page = n
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 200 {
			pageSize = n
		}
	}

	repo := repository.NewInstanceRepository(con)
	insts, err := repo.ListByOwner(uid)
	if err != nil {
		log.Println("ListMyInstances error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	if paginate {
		start := (page - 1) * pageSize
		end := start + pageSize
		if start < len(insts) {
			if end > len(insts) {
				end = len(insts)
			}
			insts = insts[start:end]
		} else {
			insts = []models.Instance{}
		}
	}
	writeJSON(w, insts)
}

// ---- INSTANCE UPDATE (admin editor) ------------------------------------
//
// The instances-page Edit button opens the full Advance-Options-style
// editor and PUTs the serialized spec here. Saving is DB-always;
// recreate-on-the-edge only when a create-time-only field changed (the
// user-visible contract: limits/pages/actions edits are hot, image/port/
// mount/env/command edits require tearing the workload down and deploying
// it again).

// updateInstanceRequest is the body PUT /api/instances/{id} accepts. Config
// is the full edited spec (the frontend serializeEditor output). Identity /
// lifecycle fields are intentionally not editable through this route.
type updateInstanceRequest struct {
	Config map[string]any `json:"config"`
}

// recreateTopKeys lists spec keys whose change always requires a workload
// recreate on the edge: they are baked in at create time (docker image /
// command / published ports / mounts / resolved env; volumes is the legacy
// mounts alias).
var recreateTopKeys = []string{"image", "command", "ports", "mounts", "volumes", "env"}

// advancedRecreateKeys lists advanced{} sub-keys docker only accepts at
// create time. Resource limits (memory / cpus / swap / pids) and the
// restart policy are deliberately absent — those stay live-updatable or
// panel-side, so editing them saves DB-only without touching the workload.
var advancedRecreateKeys = []string{
	"startup_command", "network_mode", "dns", "extra_hosts",
	"hostname", "user", "working_dir", "privileged",
	"readonly_rootfs", "enable_tty", "stop_signal", "shm_size",
}

// commandScript normalises a spec command argv into the single shell string
// the advance-options editor edits (advanced.startup_command): ["sh","-c",
// rest] collapses to rest, anything else joins verbatim. Mirrors the exact
// parsing in the frontend's specToEditor, so a legacy ["nginx","-g","…"]
// command that round-trips through the editor as ["sh","-c","nginx -g …"]
// doesn't register as a change and trigger a needless recreate.
func commandScript(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []any:
		parts := make([]string, len(t))
		for i, p := range t {
			parts[i] = fmt.Sprintf("%v", p)
		}
		if len(parts) >= 3 && parts[0] == "sh" && parts[1] == "-c" {
			return strings.Join(parts[2:], " ")
		}
		return strings.Join(parts, " ")
	default:
		return ""
	}
}

// configNeedsRecreate diffs the stored config against the merged incoming
// one and reports whether any recreate-only field changed. The driver
// runtime blocks (kvm/multipass/lxd) provision disks and CPU at create
// time, so ANY change inside them forces a recreate.
func configNeedsRecreate(old, new map[string]any) bool {
	for _, k := range recreateTopKeys {
		if k == "command" {
			// Compare semantically (see commandScript) instead of raw
			// DeepEqual — the editor rewrites foreign argv shapes into the
			// canonical ["sh","-c",script] form.
			if commandScript(old[k]) != commandScript(new[k]) {
				return true
			}
			continue
		}
		if !reflect.DeepEqual(old[k], new[k]) {
			return true
		}
	}
	oldAdv, _ := old["advanced"].(map[string]any)
	newAdv, _ := new["advanced"].(map[string]any)
	if oldAdv == nil && newAdv == nil {
		return false
	}
	for _, k := range advancedRecreateKeys {
		if !reflect.DeepEqual(oldAdv[k], newAdv[k]) {
			return true
		}
	}
	for _, blk := range []string{"kvm", "multipass", "lxd"} {
		if !reflect.DeepEqual(oldAdv[blk], newAdv[blk]) {
			return true
		}
	}
	return false
}

// normalizeInstanceConfigForStore converts an editor-serialized env array
// (template-style definitions carrying name/default) into the resolved
// {KEY: value} map shape every stored instance config uses at deploy time
// (see DeployInstanceHandler's finalEnv merge). InvokeActionHandler reads
// cfg["env"] as a map for {{KEY}} substitution, so persisting the raw
// definitions array would silently break action-step substitution.
func normalizeInstanceConfigForStore(cfg map[string]any) map[string]any {
	rawEnv, ok := cfg["env"].([]any)
	if !ok {
		return cfg
	}
	m := make(map[string]any, len(rawEnv))
	for _, e := range rawEnv {
		em, ok := e.(map[string]any)
		if !ok {
			continue
		}
		name := getString(em, "name")
		if name == "" {
			continue
		}
		m[name] = getString(em, "default")
	}
	cfg["env"] = m
	return cfg
}

// UpdateInstanceHandler persists admin edits to an instance's config.
//
// URL: PUT /api/instances/{id}  (gated like start/stop: INSTANCES_EDIT or
// the MANAGE_INSTANCES umbrella).
//
// Flow:
//  1. Decode {config}, load the row → 404 on miss.
//  2. Normalize env + shallow-merge the new spec over the stored one
//     (top-level key replacement — same semantics as deploy-time overrides;
//     unknown legacy keys such as install_timeout_sec survive because the
//     editor never emits them).
//  3. Diff recreate-only fields. Nothing recreate-relevant changed →
//     DB-only save, workload untouched.
//  4. Otherwise destroy the workload synchronously (fail-closed: a failed
//     destroy aborts before any redeploy) and kick off an async redeploy
//     goroutine with the merged config — mirroring deploy's background
//     pattern so upstream proxy timeouts can't bite — re-running the
//     install workflow when the edited spec carries install[] steps.
func UpdateInstanceHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var req updateInstanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Config == nil {
		http.Error(w, "config object is required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope for config edit: Own → must own the instance.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only edit own instances", http.StatusForbidden)
			return
		}
	}

	oldCfg := map[string]any{}
	if inst.Config != "" {
		_ = json.Unmarshal([]byte(inst.Config), &oldCfg)
	}
	newCfg := normalizeInstanceConfigForStore(req.Config)
	merged := make(map[string]any, len(oldCfg)+len(newCfg))
	for k, v := range oldCfg {
		merged[k] = v
	}
	for k, v := range newCfg {
		merged[k] = v
	}

	needsRecreate := configNeedsRecreate(oldCfg, merged) &&
		inst.ExternalID != "" &&
		inst.Status != "destroyed"

	cfgBytes, err := json.Marshal(merged)
	if err != nil {
		http.Error(w, "config is not serializable", http.StatusBadRequest)
		return
	}
	if err := instRepo.UpdateConfig(id, string(cfgBytes)); err != nil {
		log.Println("UpdateInstance error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	if !needsRecreate {
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryInstance,
			Action:      "update",
			TargetID:    &id,
			TargetLabel: inst.Name,
			Message:     fmt.Sprintf("updated config of instance %q (%s)", inst.Name, inst.Kind),
		})
		writeJSON(w, map[string]any{"id": id, "status": inst.Status, "recreated": false})
		return
	}

	// Recreate path: resolve the owning edge first so a missing node/token
	// surfaces BEFORE we tear anything down.
	nodeRepo := repository.NewNodeRepository(con)
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error":  "config saved, but recreate aborted: owning node not found",
			"detail": err.Error(),
		})
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "config saved, but recreate aborted: node has no usable edge token (rotate it first)",
		})
		return
	}

	// Tear the current workload down with the same 3-attempt retry policy
	// instanceAction uses. Fail closed: no destroy confirmation → no
	// redeploy (the row already carries the saved config either way).
	var destroyErr error
	for i := 0; i < 3; i++ {
		ec := edge.NewWithTimeout(*node, token, 60*time.Second)
		_, destroyErr = ec.Lifecycle(edge.LifecycleRequest{
			Action: "destroy",
			Kind:   inst.Kind,
			Name:   inst.Name,
		})
		if destroyErr == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if destroyErr != nil {
		log.Printf("UpdateInstance: destroy before recreate failed for instance %d: %v", id, destroyErr)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error":  "config saved, but recreate aborted: edge refused destroy after 3 retries",
			"detail": destroyErr.Error(),
		})
		return
	}

	// Flip the row to "creating" right away so no card claims the old
	// workload still exists while the redeploy goroutine runs. SetStatus's
	// COALESCE keeps the stored ExternalID until the new deploy reports.
	_ = instRepo.SetStatus(id, "creating", "", "")

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "update+recreate",
		TargetID:    &id,
		TargetLabel: inst.Name,
		Message:     fmt.Sprintf("saved config of %q and recreated the workload (%s on %q)", inst.Name, inst.Kind, node.Name),
	})

	go func() {
		con2, err := repository.OpenDB()
		if err != nil {
			log.Printf("recreate async: db open failed: %v", err)
			return
		}
		defer con2.Close()

		repo2 := repository.NewInstanceRepository(con2)
		nodeRepo2 := repository.NewNodeRepository(con2)
		node2, err := nodeRepo2.GetNode(inst.NodeID)
		if err != nil {
			_ = repo2.SetStatus(id, "errored", "", "recreate: node not found: "+err.Error())
			return
		}
		token2, err := nodeRepo2.PlainToken(inst.NodeID)
		if err != nil || token2 == "" {
			_ = repo2.SetStatus(id, "errored", "", "recreate: node token missing")
			return
		}

		// Same generous timeout as the deploy goroutine (image pull + run);
		// the HTTP response has long since returned.
		ec2 := edge.NewWithTimeout(*node2, token2, 5*time.Minute)
		resp, err := ec2.Lifecycle(edge.LifecycleRequest{
			Action: "deploy",
			Kind:   inst.Kind,
			Name:   inst.Name,
			Config: merged,
		})
		if err != nil {
			log.Printf("recreate async for instance %d failed: %v", id, err)
			_ = repo2.SetStatus(id, "errored", "", "recreate failed: "+err.Error())
			return
		}
		status := resp.Status
		if status == "" {
			status = "running"
		}

		// Re-run the install workflow when the edited spec carries
		// install[] steps — the recreated workload starts from a fresh
		// filesystem, exactly like a first deploy.
		var steps []installStepSpec
		if rawInstall, ok := merged["install"].([]any); ok {
			for _, s := range rawInstall {
				if m, ok := s.(map[string]any); ok {
					steps = append(steps, installStepSpec{
						Action:       getString(m, "action"),
						Command:      getString(m, "command"),
						URL:          getString(m, "url"),
						Filename:     getString(m, "filename"),
						Archive:      getString(m, "archive"),
						Dest:         getString(m, "dest"),
						From:         getString(m, "from"),
						To:           getString(m, "to"),
						Path:         getString(m, "path"),
						Content:      getString(m, "content"),
						Branch:       getString(m, "branch"),
						Retries:      getString(m, "retries"),
						IgnoreErrors: getBool(m, "ignore_errors"),
					})
				}
			}
		}
		if len(steps) > 0 && status != "running" {
			failMsg := fmt.Sprintf(
				"container exited before install workflow could start after recreate (docker status=%q, id=%s)",
				status, resp.ExternalID,
			)
			log.Printf("recreate async: instance %d refusing install — %s", id, failMsg)
			_ = repo2.SetStatus(id, "install_failed", resp.ExternalID, failMsg)
			return
		}
		if len(steps) > 0 {
			status = "installing"
		}
		if err := repo2.SetStatus(id, status, resp.ExternalID, ""); err != nil {
			log.Printf("recreate async: failed to update status for instance %d: %v", id, err)
			return
		}
		if len(steps) > 0 {
			stepsJSON, _ := json.Marshal(steps)
			_ = repo2.UpdateInstallStatus(id, "running", inst.Kind+":"+inst.Name, 0, "", string(stepsJSON))
			edgeSteps := make([]edge.InstallStep, len(steps))
			for i, s := range steps {
				edgeSteps[i] = edge.InstallStep{
					Action:       s.Action,
					Command:      s.Command,
					URL:          s.URL,
					Filename:     s.Filename,
					Archive:      s.Archive,
					Dest:         s.Dest,
					From:         s.From,
					To:           s.To,
					Path:         s.Path,
					Content:      s.Content,
					Branch:       s.Branch,
					Retries:      s.Retries,
					IgnoreErrors: s.IgnoreErrors,
				}
			}
			// Resolved KEY=VALUE pairs ride along for {{KEY}} substitution
			// inside install steps (same contract as deploy).
			envVars := map[string]string{}
			if em, ok := merged["env"].(map[string]any); ok {
				for k, v := range em {
					if s, ok := v.(string); ok {
						envVars[k] = s
					}
				}
			}
			if _, err := ec2.InstallStart(edge.InstallStartRequest{
				Token:      token2,
				Kind:       inst.Kind,
				Name:       inst.Name,
				Steps:      edgeSteps,
				EnvVars:    envVars,
				TimeoutSec: timeoutSecFromSpec(merged["install_timeout_sec"]),
			}); err != nil {
				log.Printf("recreate async: install kick-off for instance %d failed: %v", id, err)
				_ = repo2.UpdateInstallStatus(id, "failed", inst.Kind+":"+inst.Name, 0, "edge install start failed: "+err.Error(), string(mustJSON(steps)))
				_ = repo2.SetStatus(id, "install_failed", resp.ExternalID, "edge install start failed: "+err.Error())
			}
			// Success: installSweepLoop polls progress and flips the row to
			// "running"/"install_failed".
		}
	}()

	writeJSON(w, map[string]any{"id": id, "status": "creating", "recreated": true})
}

// updateIdentityRequest is the body for the display-identity rename: only
// the human-facing labels change (display_name, icon, color). The
// container/VM name on the edge is immutable and never touched.
type updateIdentityRequest struct {
	DisplayName string `json:"display_name"`
	Icon        string `json:"icon,omitempty"`
	Color       string `json:"color,omitempty"`
}

// UpdateInstanceIdentityHandler renames an instance's display identity
// without touching the workload: no edge call, no recreate, no restart.
// Same ownership scoping as the config editor (Own → own instances only).
func UpdateInstanceIdentityHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var req updateIdentityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if len(req.DisplayName) > 128 {
		http.Error(w, "display_name too long (max 128 chars)", http.StatusBadRequest)
		return
	}
	if req.Icon != "" && len(req.Icon) > 16*1024 {
		http.Error(w, "icon too large (max 16KB)", http.StatusBadRequest)
		return
	}
	if req.Icon != "" && strings.Contains(strings.ToLower(req.Icon), "<script") {
		http.Error(w, "icon must not contain <script>", http.StatusBadRequest)
		return
	}
	if req.Color != "" && !validNodeColorHex(strings.TrimSpace(req.Color)) {
		http.Error(w, "color must be a #rrggbb hex value", http.StatusBadRequest)
		return
	}
	req.Color = strings.ToUpper(strings.TrimSpace(req.Color))

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only edit own instances", http.StatusForbidden)
			return
		}
	}
	// Template allow-list (instance.Config snapshot, allow-all default).
	if forbidByInstanceControls(w, inst.Config, "allow_rename", "rename") {
		return
	}
	if err := instRepo.UpdateIdentity(id, req.DisplayName, req.Icon, req.Color); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "rename",
		TargetID:    &id,
		TargetLabel: inst.Name,
		Message:     fmt.Sprintf("renamed instance %q display name to %q", inst.Name, req.DisplayName),
	})
	writeJSON(w, map[string]any{"id": id, "display_name": req.DisplayName})
}

// ReinstallInstanceHandler wipes the edge workload and redeploys it from
// the instance's stored spec — a fresh filesystem plus a re-run of the
// template install workflow, mirroring the config-edit recreate path.
// ALL data inside the workload is lost. Fail-closed like recreate: the
// edge must confirm destroy (3 retries) before the row flips to
// "creating" and the redeploy goroutine starts.
func ReinstallInstanceHandler(w http.ResponseWriter, r *http.Request) {
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

	instRepo := repository.NewInstanceRepository(con)
	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only manage own instances", http.StatusForbidden)
			return
		}
	}
	if suspended, until, _ := instRepo.IsInstanceSuspended(id); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}
	// Template allow-list (instance.Config snapshot, allow-all default).
	if forbidByInstanceControls(w, inst.Config, "allow_reinstall", "reinstall") {
		return
	}
	// A deploy already in flight owns the row — reinstalling over
	// "creating"/"installing" would destroy a workload that doesn't exist
	// yet and orphan the running workflow.
	if inst.Status == "creating" || inst.Status == "installing" {
		writeJSONStatus(w, http.StatusConflict, map[string]any{
			"error": fmt.Sprintf("instance is %q — wait for the deploy to finish before reinstalling", inst.Status),
		})
		return
	}
	// The stored config is already the merged deploy-time spec — redeploy
	// it verbatim.
	cfg := map[string]any{}
	if inst.Config != "" {
		if err := json.Unmarshal([]byte(inst.Config), &cfg); err != nil {
			http.Error(w, "stored config is corrupt, cannot reinstall", http.StatusInternalServerError)
			return
		}
	}
	nodeRepo := repository.NewNodeRepository(con)
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error":  "reinstall aborted: owning node not found",
			"detail": err.Error(),
		})
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "reinstall aborted: node has no usable edge token (rotate it first)",
		})
		return
	}

	// Tear the current workload down with the same 3-attempt retry policy
	// the recreate path uses. Fail closed: no destroy confirmation → no
	// reinstall.
	var destroyErr error
	for i := 0; i < 3; i++ {
		ec := edge.NewWithTimeout(*node, token, 60*time.Second)
		_, destroyErr = ec.Lifecycle(edge.LifecycleRequest{
			Action: "destroy",
			Kind:   inst.Kind,
			Name:   inst.Name,
		})
		if destroyErr == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if destroyErr != nil {
		log.Printf("ReinstallInstance: destroy before reinstall failed for instance %d: %v", id, destroyErr)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error":  "reinstall aborted: edge refused destroy after 3 retries",
			"detail": destroyErr.Error(),
		})
		return
	}

	// Clear stale install tracking, then flip to "creating" so no card
	// claims the old workload still exists while redeploy runs.
	_ = instRepo.UpdateInstallStatus(id, "", "", -1, "", "")
	_ = instRepo.SetStatus(id, "creating", "", "")

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "reinstall",
		TargetID:    &id,
		TargetLabel: inst.Name,
		Message:     fmt.Sprintf("reinstalled instance %q (%s on %q) — workload wiped and redeployed", inst.Name, inst.Kind, node.Name),
	})

	go reinstallAsync(id, inst.NodeID, inst.Kind, inst.Name, cfg)
	writeJSON(w, map[string]any{"id": id, "status": "creating"})
}

// reinstallAsync redeploys an already-torn-down workload and kicks off its
// install workflow. It mirrors the config-edit recreate goroutine step for
// step (deploy → status hand-off → secrets/SFTP → InstallStart) so a
// reinstall behaves exactly like a first deploy of the same spec.
func reinstallAsync(instID, nodeID int64, kind, name string, cfg map[string]any) {
	con2, err := repository.OpenDB()
	if err != nil {
		log.Printf("reinstall async: db open failed: %v", err)
		return
	}
	defer con2.Close()

	repo2 := repository.NewInstanceRepository(con2)
	nodeRepo2 := repository.NewNodeRepository(con2)
	node2, err := nodeRepo2.GetNode(nodeID)
	if err != nil {
		_ = repo2.SetStatus(instID, "errored", "", "reinstall: node not found: "+err.Error())
		return
	}
	token2, err := nodeRepo2.PlainToken(nodeID)
	if err != nil || token2 == "" {
		_ = repo2.SetStatus(instID, "errored", "", "reinstall: node token missing")
		return
	}

	ec2 := edge.NewWithTimeout(*node2, token2, 5*time.Minute)
	resp, err := ec2.Lifecycle(edge.LifecycleRequest{
		Action: "deploy",
		Kind:   kind,
		Name:   name,
		Config: cfg,
	})
	if err != nil {
		log.Printf("reinstall async for instance %d failed: %v", instID, err)
		_ = repo2.SetStatus(instID, "errored", "", "reinstall failed: "+err.Error())
		return
	}
	status := resp.Status
	if status == "" {
		status = "running"
	}

	// Parse install[] steps from the stored spec, same as the recreate path.
	var steps []installStepSpec
	if rawInstall, ok := cfg["install"].([]any); ok {
		for _, s := range rawInstall {
			if m, ok := s.(map[string]any); ok {
				steps = append(steps, installStepSpec{
					Action:       getString(m, "action"),
					Command:      getString(m, "command"),
					URL:          getString(m, "url"),
					Filename:     getString(m, "filename"),
					Archive:      getString(m, "archive"),
					Dest:         getString(m, "dest"),
					From:         getString(m, "from"),
					To:           getString(m, "to"),
					Path:         getString(m, "path"),
					Content:      getString(m, "content"),
					Branch:       getString(m, "branch"),
					Retries:      getString(m, "retries"),
					IgnoreErrors: getBool(m, "ignore_errors"),
				})
			}
		}
	}
	if len(steps) > 0 && status != "running" {
		failMsg := fmt.Sprintf(
			"container exited before install workflow could start after reinstall (docker status=%q, id=%s)",
			status, resp.ExternalID,
		)
		log.Printf("reinstall async: instance %d refusing install — %s", instID, failMsg)
		_ = repo2.SetStatus(instID, "install_failed", resp.ExternalID, failMsg)
		return
	}
	if len(steps) > 0 {
		status = "installing"
	}
	if err := repo2.SetStatus(instID, status, resp.ExternalID, ""); err != nil {
		log.Printf("reinstall async: failed to update status for instance %d: %v", instID, err)
		return
	}
	if len(steps) > 0 {
		stepsJSON, _ := json.Marshal(steps)
		_ = repo2.UpdateInstallStatus(instID, "running", kind+":"+name, 0, "", string(stepsJSON))
		edgeSteps := make([]edge.InstallStep, len(steps))
		for i, s := range steps {
			edgeSteps[i] = edge.InstallStep{
				Action:       s.Action,
				Command:      s.Command,
				URL:          s.URL,
				Filename:     s.Filename,
				Archive:      s.Archive,
				Dest:         s.Dest,
				From:         s.From,
				To:           s.To,
				Path:         s.Path,
				Content:      s.Content,
				Branch:       s.Branch,
				Retries:      s.Retries,
				IgnoreErrors: s.IgnoreErrors,
			}
		}
		envVars := map[string]string{}
		if em, ok := cfg["env"].(map[string]any); ok {
			for k, v := range em {
				if s, ok := v.(string); ok {
					envVars[k] = s
				}
			}
		}
		if _, err := ec2.InstallStart(edge.InstallStartRequest{
			Token:      token2,
			Kind:       kind,
			Name:       name,
			Steps:      edgeSteps,
			EnvVars:    envVars,
			TimeoutSec: timeoutSecFromSpec(cfg["install_timeout_sec"]),
		}); err != nil {
			log.Printf("reinstall async: install kick-off for instance %d failed: %v", instID, err)
			_ = repo2.UpdateInstallStatus(instID, "failed", kind+":"+name, 0, "edge install start failed: "+err.Error(), string(mustJSON(steps)))
			_ = repo2.SetStatus(instID, "install_failed", resp.ExternalID, "edge install start failed: "+err.Error())
		}
		// Success: installSweepLoop polls progress and flips the row to
		// "running"/"install_failed".
	}
}

// mustJSON marshals v or returns "null" on failure — best-effort helper for
// audit/transcript columns where a marshal failure must never panic.
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("null")
	}
	return b
}

// DeployInstanceHandler schedules a new instance onto a node.
//
// Flow: validate input → load template → load node → read raw edge token →
// resolve spec (template.spec marshalled + overrides merged shallow-ly) →
// validate env vars against template rules → build final env map →
// POST /api/edge/lifecycle {action:deploy} → persist the row with the edge's
// ExternalID + install tracking. On any edge failure we still DON'T persist
// the row so the panel never shows an instance that doesn't really exist.
func DeployInstanceHandler(w http.ResponseWriter, r *http.Request) {
	var req deployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.TemplateID == 0 || req.NodeID == 0 || req.Name == "" {
		http.Error(w, "template_id, node_id and name are required", http.StatusBadRequest)
		return
	}
	// Validate the instance name against docker / lxd naming rules early so
	// a typo surfaces as a clean 400 ("invalid name") instead of a 502 from
	// the edge with "docker: invalid container name". The rules we enforce:
	//   - 1..63 chars (docker's hard limit)
	//   - only [a-zA-Z0-9_-]
	//   - must start with [a-zA-Z0-9]
	//   - no leading hyphen (mirrors docker's "may not start with `-`" rule)
	// LXD is similarly restrictive; KVM/multipass tolerate more, but if the
	// name passes this check it'll work on every backend.
	if !validInstanceName(req.Name) {
		http.Error(w, fmt.Sprintf("instance name %q is invalid (1-63 chars, [a-zA-Z0-9_-], must start with alphanumeric, no leading hyphen)", req.Name), http.StatusBadRequest)
		return
	}
	if len(req.DisplayName) > 128 {
		http.Error(w, "display_name too long (max 128 chars)", http.StatusBadRequest)
		return
	}
	if req.Icon != "" && len(req.Icon) > 16*1024 {
		http.Error(w, "icon too large (max 16KB)", http.StatusBadRequest)
		return
	}
	if req.Icon != "" && strings.Contains(strings.ToLower(req.Icon), "<script") {
		http.Error(w, "icon must not contain <script>", http.StatusBadRequest)
		return
	}
	if req.Color != "" && !validNodeColorHex(strings.TrimSpace(req.Color)) {
		http.Error(w, "color must be a #rrggbb hex value", http.StatusBadRequest)
		return
	}
	req.Color = strings.ToUpper(strings.TrimSpace(req.Color))

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Ownership scope for create: Own → may create only for self, All/umbrella → any user.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn {
			if req.OwnerID != 0 && req.OwnerID != uid {
				http.Error(w, "forbidden: own-scope may only create instances for yourself", http.StatusForbidden)
				return
			}
			req.OwnerID = uid
		}
		if req.OwnerID == 0 {
			req.OwnerID = uid
		}
	}

	tmplRepo := repository.NewTemplateRepository(con)
	nodeRepo := repository.NewNodeRepository(con)
	instRepo := repository.NewInstanceRepository(con)

	tmpl, err := tmplRepo.Get(req.TemplateID)
	if err != nil {
		http.Error(w, "template not found", http.StatusBadRequest)
		return
	}
	node, err := nodeRepo.GetNode(req.NodeID)
	if err != nil {
		http.Error(w, "node not found", http.StatusBadRequest)
		return
	}
	// Enforce the per-edge allowed_kinds allow-list (migration 019). An
	// empty list means "no restriction" so legacy rows stay permissive.
	if !repository.KindAllowed(node.AllowedKinds, tmpl.Kind) {
		http.Error(w, fmt.Sprintf("node %q does not allow %q instances (allowed: %q)", node.Name, tmpl.Kind, node.AllowedKinds), http.StatusBadRequest)
		return
	}
	// Preflight the node's advertised driver availability.
	if missing := driverMissingOn(*node, tmpl.Kind); missing != "" {
		writeJSONStatus(w, http.StatusBadRequest, map[string]any{
			"error":  "node cannot run this instance",
			"detail": fmt.Sprintf("edge %q hasn't reported the %q driver as available — install %s on the edge host (or pick a node that advertises it)", node.Name, tmpl.Kind, missing),
			"node":   node.Address,
			"kind":   tmpl.Kind,
			"name":   req.Name,
		})
		return
	}
	token, err := nodeRepo.PlainToken(req.NodeID)
	if err != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}

	// Parse the template's spec to extract env[] rules and install[] steps.
	var tmplSpec map[string]any
	if tmpl.Spec != "" {
		_ = json.Unmarshal([]byte(tmpl.Spec), &tmplSpec)
	}
	if tmplSpec == nil {
		tmplSpec = map[string]any{}
	}

	// Apply per-deploy overrides onto the Parsed template spec BEFORE any
	// downstream consumer reads from it. Without this, envSpecs (used for
	// validation) and installSteps (used to drive the post-deploy install
	// workflow) would both be extracted from the original template spec and
	// silently ignore the operator's tab edits on the deploy page — the
	// symptom being "I edited install/env/actions on /instances/new
	// but the deployed instance still used the template's values."
	//
	// The merge is shallow (top-level key replacement), which matches both
	// the cfg merge below and how buildOverrides on the frontend produces
	// whole-object keys (limits, env, install, actions, ...). Nested
	// per-field overrides are NOT a supported model — the whole object is
	// replaced, same as the template editor.
	for k, v := range req.Overrides {
		tmplSpec[k] = v
	}

	// ---- ENV VAR VALIDATION ----
	// Extract template-defined env vars with their rules.
	var envSpecs []envVarSpec
	if rawEnv, ok := tmplSpec["env"].([]any); ok {
		for _, e := range rawEnv {
			if m, ok := e.(map[string]any); ok {
				spec := envVarSpec{
					Name:         getString(m, "name"),
					Label:        getString(m, "label"),
					Description:  getString(m, "description"),
					Default:      getString(m, "default"),
					UserViewable: getBool(m, "user_viewable"),
					UserEditable: getBool(m, "user_editable"),
					Required:     getBool(m, "required"),
					Rule:         getString(m, "rule"),
					Display:      getString(m, "display"),
					Options:      getString(m, "options"),
					Append:       getBool(m, "append"),
					Prepend:      getString(m, "prepend"),
					AppendValue:  getString(m, "append_value"),
					IsSecret:     getBool(m, "is_secret"),
				}
				if spec.Name != "" {
					envSpecs = append(envSpecs, spec)
				}
			}
		}
	}

	// Build final env map: start with defaults, apply operator overrides,
	// validate required+regex, apply prepend/append.
	finalEnv := make(map[string]string)
	for _, spec := range envSpecs {
		val := spec.Default
		if v, ok := req.EnvVars[spec.Name]; ok {
			// Operator provided a value (only allowed if user_editable or admin).
			// We don't gate by role here — the admin UI only sends editable ones.
			val = v
		}
		// Required check.
		if spec.Required && strings.TrimSpace(val) == "" {
			writeJSONStatus(w, http.StatusBadRequest, map[string]any{
				"error":  "env validation failed",
				"detail": fmt.Sprintf("required variable %q has no value", spec.Name),
				"field":  spec.Name,
			})
			return
		}
		// Regex rule validation (PufferPanel-style: full-match regex like "^[a-z]+$").
		if spec.Rule != "" && val != "" {
			// The rule is expected to be a full-match regex. We anchor it if the
			// operator didn't already — but we don't force anchors so a rule like
			// "prod|staging" works as-is.
			pattern := spec.Rule
			if !strings.HasPrefix(pattern, "^") {
				pattern = "^" + pattern
			}
			if !strings.HasSuffix(pattern, "$") {
				pattern = pattern + "$"
			}
			re, err := regexp.Compile(pattern)
			if err != nil {
				writeJSONStatus(w, http.StatusBadRequest, map[string]any{
					"error":  "env validation failed",
					"detail": fmt.Sprintf("variable %q has invalid regex rule: %v", spec.Name, err),
					"field":  spec.Name,
				})
				return
			}
			if !re.MatchString(val) {
				writeJSONStatus(w, http.StatusBadRequest, map[string]any{
					"error":  "env validation failed",
					"detail": fmt.Sprintf("variable %q value %q does not match rule %q", spec.Name, val, spec.Rule),
					"field":  spec.Name,
				})
				return
			}
		}
		// Prepend/append.
		if spec.Prepend != "" {
			val = spec.Prepend + val
		}
		if spec.Append && spec.AppendValue != "" {
			val = val + spec.AppendValue
		}
		finalEnv[spec.Name] = val
	}
	// Also pass through any extra env vars from overrides that aren't in the
	// template's env[] (backwards compat for templates that don't define env rules).
	// Skip keys that are already defined in the template's env[] to avoid conflicts.
	// These extra env vars bypass template-defined validation (required, regex, etc.)
	// so we apply minimal sanitization: reject empty keys and values with newlines.
	templateEnvKeys := make(map[string]bool, len(envSpecs))
	for _, spec := range envSpecs {
		templateEnvKeys[spec.Name] = true
	}
	for k, v := range req.Overrides {
		if ks, ok := v.(string); ok && strings.HasPrefix(k, "env_") {
			envKey := strings.TrimPrefix(k, "env_")
			if envKey == "" {
				writeJSONStatus(w, http.StatusBadRequest, map[string]any{
					"error":  "env validation failed",
					"detail": "extra env var key cannot be empty",
					"field":  k,
				})
				return
			}
			if strings.Contains(ks, "\n") || strings.Contains(ks, "\r") {
				writeJSONStatus(w, http.StatusBadRequest, map[string]any{
					"error":  "env validation failed",
					"detail": "extra env var value cannot contain newlines",
					"field":  envKey,
				})
				return
			}
			if !templateEnvKeys[envKey] {
				finalEnv[envKey] = ks
			}
		}
	}

	// ---- INSTALL STEPS ----
	// Extract install[] steps from template spec.
	var installSteps []installStepSpec
	if rawInstall, ok := tmplSpec["install"].([]any); ok {
		for _, s := range rawInstall {
			if m, ok := s.(map[string]any); ok {
				installSteps = append(installSteps, installStepSpec{
					Action:       getString(m, "action"),
					Command:      getString(m, "command"),
					URL:          getString(m, "url"),
					Filename:     getString(m, "filename"),
					Archive:      getString(m, "archive"),
					Dest:         getString(m, "dest"),
					From:         getString(m, "from"),
					To:           getString(m, "to"),
					Path:         getString(m, "path"),
					Content:      getString(m, "content"),
					Branch:       getString(m, "branch"),
					Retries:      getString(m, "retries"),
					IgnoreErrors: getBool(m, "ignore_errors"),
				})
			}
		}
	}

	// Build the config the edge driver will consume.
	var cfg map[string]any
	if tmpl.Spec != "" {
		_ = json.Unmarshal([]byte(tmpl.Spec), &cfg)
	}
	if cfg == nil {
		cfg = map[string]any{}
	}
	cfg["image"] = tmpl.Image
	for k, v := range req.Overrides {
		cfg[k] = v
	}

	// ---- MERGE VALIDATED ENV INTO DEPLOY CONFIG ----
	// The operator's validated env vars (finalEnv) must be passed to the
	// container via docker -e so they're available at runtime, AND to the
	// edge install workflow for {{KEY}} substitution. The template's stored
	// spec.env may have defaults; we override with the validated values.
	//
	// The cfg["env"] type assertion uses comma-ok so a template that defines
	// env as a non-map (some old templates serialised it as `[]`) doesn't
	// panic here. The docker driver accepts both `map[string]any` and
	// `map[string]string` via its asStringMap helper, so anything we write
	// here is downstream-compatible.
	envMap, ok := cfg["env"].(map[string]any)
	if !ok {
		envMap = map[string]any{}
		cfg["env"] = envMap
	}
	for k, v := range finalEnv {
		envMap[k] = v
	}

	// Substitute per-deploy placeholders in mounts.
	substituteInstanceName(cfg, req.Name)
	// Substitute {{KEY}} placeholders in all template spec fields using
	// the validated environment variables. This allows operators to use
	// {{KEY}} in command, image, mounts, volumes, labels, devices,
	// advanced settings, etc. — not just in install steps.
	substituteEnvVars(cfg, finalEnv)
	// Reject a deploy whose host ports are already taken on this node by
	// another instance. Without this every second minecraft deploy (default
	// host 25565) sailed through to `docker run -p 25565:…` and died with
	// the opaque `docker: Error … Bind for 0.0.0.0:25565 failed: port is
	// already allocated` (exit 125) plus a leftover Created container.
	// Answer 409 now with the owner so the operator picks a free host port.
	if tmpl.Kind == "docker" {
		if want := extractRequestedPorts(cfg); len(want) > 0 {
			if bad, owner, found := findPortCollision(con, req.NodeID, 0, want); found {
				writeJSONStatus(w, http.StatusConflict, map[string]any{
					"error":  fmt.Sprintf("host port %d is already allocated to instance %q on this node — pick a different host port", bad.host, owner),
					"detail": fmt.Sprintf("docker would fail with exit 125: Bind for 0.0.0.0:%d failed: port is already allocated", bad.host),
					"port":   bad.host,
					"owner":  owner,
				})
				return
			}
		}
	}
	// Keep the full config (with plaintext secrets) for the edge deploy
	// RPC, but persist a redacted copy where IsSecret env keys are
	// stripped so the `instances.config` JSON column never stores
	// secrets at rest — they are kept only in `instance_secrets`
	// (secretbox-encrypted) and in the live container's env.
	cfgForStore := cfg
	if len(envSpecs) > 0 {
		// Shallow clone cfg and its env map so the redaction does not
		// mutate the deploy payload the goroutine will use.
		clone := make(map[string]any, len(cfg))
		for k, v := range cfg {
			clone[k] = v
		}
		if em, ok := clone["env"].(map[string]any); ok {
			emClone := make(map[string]any, len(em))
			for k, v := range em {
				emClone[k] = v
			}
			for _, spec := range envSpecs {
				if spec.IsSecret {
					delete(emClone, spec.Name)
				}
			}
			clone["env"] = emClone
		}
		cfgForStore = clone
	}
	cfgBytes, _ := json.Marshal(cfgForStore)

	// Create the instance row immediately with status="creating" so the
	// panel responds in <100ms (well under any upstream proxy timeout).
	// The actual edge lifecycle deploy runs in a background goroutine.
	id, err := instRepo.Create(repository.InstanceCreateInput{
		NodeID:           req.NodeID,
		TemplateID:       req.TemplateID,
		OwnerID:          req.OwnerID,
		Name:             req.Name,
		DisplayName:      req.DisplayName,
		Icon:             req.Icon,
		Color:            req.Color,
		Kind:             tmpl.Kind,
		Status:           "creating",
		ExternalID:       "",
		Config:           string(cfgBytes),
		InstallState:     "",
		InstallID:        "",
		InstallStep:      -1,
		InstallError:     "",
		InstallStepsJSON: "",
	})
	if err != nil {
		log.Printf("failed to create instance row for %q: %v", req.Name, err)
		// UNIQUE(node_id, name) is the DB modelling an expected operator
		// mistake (re-deploying a name that already exists on this node) —
		// answer 409 with the reason instead of the generic 500. Match the
		// driver-specific phrasings: SQLite "UNIQUE constraint failed",
		// MySQL "Duplicate entry", PostgreSQL "duplicate key value".
		msg := err.Error()
		if strings.Contains(msg, "UNIQUE") || strings.Contains(msg, "unique") ||
			strings.Contains(msg, "Duplicate entry") || strings.Contains(msg, "duplicate key") {
			http.Error(w, fmt.Sprintf("an instance named %q already exists on this node — pick another name", req.Name), http.StatusConflict)
			return
		}
		http.Error(w, "panel failed to store instance (see panel logs)", http.StatusInternalServerError)
		return
	}

	// Kick off the edge deploy asynchronously. This goroutine:
	// 1. Calls edge.Lifecycle(deploy) with a generous timeout (image pull + run)
	// 2. On success: updates instance with ExternalID + status from edge
	// 3. If template has install steps: kicks off InstallStart workflow
	// 4. On failure: marks instance as errored with the error message
	go func() {
		// New DB connection for the goroutine.
		con2, err := repository.OpenDB()
		if err != nil {
			log.Printf("deploy async: db open failed: %v", err)
			return
		}
		defer con2.Close()

		instRepo2 := repository.NewInstanceRepository(con2)
		nodeRepo2 := repository.NewNodeRepository(con2)

		// Re-fetch node + token.
		node2, err := nodeRepo2.GetNode(req.NodeID)
		if err != nil {
			log.Printf("deploy async: node %d not found: %v", req.NodeID, err)
			_ = instRepo2.SetStatus(id, "errored", "", "node not found: "+err.Error())
			return
		}
		token2, err := nodeRepo2.PlainToken(req.NodeID)
		if err != nil || token2 == "" {
			log.Printf("deploy async: node %d token missing: %v", req.NodeID, err)
			_ = instRepo2.SetStatus(id, "errored", "", "node token missing: "+err.Error())
			return
		}

		// Use a generous timeout for the edge deploy (image pull + run).
		// The panel HTTP response has already returned, so proxy timeouts
		// are no longer a concern. 5 minutes matches the edge's own handler timeout.
		ec2 := edge.NewWithTimeout(*node2, token2, 5*time.Minute)
		resp, err := ec2.Lifecycle(edge.LifecycleRequest{
			Action: "deploy",
			Kind:   tmpl.Kind,
			Name:   req.Name,
			Config: cfg,
		})
		if err != nil {
			log.Printf("deploy async to node %s failed: %v", node2.Address, err)
			_ = instRepo2.SetStatus(id, "errored", "", err.Error())
			return
		}

		// Deploy succeeded on edge. Update instance with ExternalID and status.
		//
		// Status hand-off between the two deploy flows:
		//   • Flow 1 (create-only, no install steps): the docker/lxd/… driver
		//     returns its real lifecycle status (typically "running"). We
		//     persist it verbatim — the instance is genuinely live and
		//     nothing else will flip the row.
		//   • Flow 2 (deploy + install workflow): the container is up but the
		//     install steps haven't run yet. Storing "running" here would
		//     make the panel claim success while the workflow is still
		//     downloading/extracting/configuring — and worse, the operator
		//     would see a green "running" badge with no indication the
		//     install is in flight. Instead we force the row to "installing"
		//     and hand the running-transition ownership to
		//     installSweepLoop, which flips it to "running" once the edge
		//     reports the install workflow StateDone (or "install_failed" on
		//     StateFailed). The stored ExternalID is preserved across that
		//     hand-off so start/stop/destroy keep targeting the right
		//     workload.
		//
		// Edge case: the docker driver reports the container's ACTUAL status
		// right after `docker run -d` returns. If the template's command
		// exited immediately (e.g. Java trying to read a server.jar that the
		// install workflow hasn't downloaded yet, or any `command` whose
		// main process crashes on first start), docker status will be
		// "exited" / "dead" / "restarting" — the container is GONE by the
		// time InstallStart tries to `docker exec` into it, and every step
		// bails with "container … is not running" (the symptom operators
		// see as `docker ps` empty while the panel claims "Installing").
		// Refuse to start the install workflow when the container isn't
		// actually running — surface the real docker state + ExternalID in
		// the install_error so the operator can debug (the deploy row keeps
		// the actual external_id, so they can `docker inspect` / `docker
		// logs` against it themselves).
		status := resp.Status
		if status == "" {
			status = "running"
		}
		if len(installSteps) > 0 && status != "running" {
			failMsg := fmt.Sprintf(
				"container exited before install workflow could start (docker status=%q, id=%s) — the template's command exits on first run; check that the command keeps the container alive until the install workflow has finished downloading dependencies",
				status, resp.ExternalID,
			)
			log.Printf("deploy async: instance %d refusing install — %s", id, failMsg)
			stepsJSON, _ := json.Marshal(installSteps)
			_ = instRepo2.UpdateInstallStatus(id, "failed", tmpl.Kind+":"+req.Name, 0, failMsg, string(stepsJSON))
			_ = instRepo2.SetStatus(id, "install_failed", resp.ExternalID, failMsg)
			return
		}
		if len(installSteps) > 0 {
			status = "installing"
		}
		if err := instRepo2.SetStatus(id, status, resp.ExternalID, ""); err != nil {
			log.Printf("deploy async: failed to update status for instance %d: %v", id, err)
			return
		}

		// Store secret env vars in instance_secrets after successful deploy.
		// This ensures sensitive values are encrypted at rest.
		secRepo := repository.NewSecretRepository(con2)
		for _, spec := range envSpecs {
			if spec.IsSecret {
				val := finalEnv[spec.Name]
				if val != "" {
					_, _ = secRepo.Set(id, spec.Name, val, true, spec.Description)
				}
			}
		}

		// Auto-provision SFTP for the new instance (best-effort): mint
		// inst_<id> + 32B password into the vault, record the dial params
		// in instance_sftp (058), and push to the edge's in-memory server.
		// A down edge must not fail the deploy — rotate re-pushes later.
		autoProvisionSFTPOnDeploy(con2, id)

		// If template has install steps, kick off the install workflow.
		if len(installSteps) > 0 {
			installState := "running"
			installID := tmpl.Kind + ":" + req.Name
			installStep := 0
			installError := ""
			stepsJSON, _ := json.Marshal(installSteps)
			installStepsJSON := string(stepsJSON)

			// Update instance with install tracking fields.
			_ = instRepo2.UpdateInstallStatus(id, installState, installID, installStep, installError, installStepsJSON)

			// Kick off InstallStart on edge (async, same pattern as before).
			edgeSteps := make([]edge.InstallStep, len(installSteps))
			for i, s := range installSteps {
				edgeSteps[i] = edge.InstallStep{
					Action:       s.Action,
					Command:      s.Command,
					URL:          s.URL,
					Filename:     s.Filename,
					Archive:      s.Archive,
					Dest:         s.Dest,
					From:         s.From,
					To:           s.To,
					Path:         s.Path,
					Content:      s.Content,
					Branch:       s.Branch,
					Retries:      s.Retries,
					IgnoreErrors: s.IgnoreErrors,
				}
			}

			_, err = ec2.InstallStart(edge.InstallStartRequest{
				Token:   token2,
				Kind:    tmpl.Kind,
				Name:    req.Name,
				Steps:   edgeSteps,
				EnvVars: finalEnv,
				// Template-authored workflow budget (spec.install_timeout_sec).
				// 0 = unset → the edge applies its own 30-minute default, so
				// templates that never set the field behave exactly as before.
				TimeoutSec: timeoutSecFromSpec(tmplSpec["install_timeout_sec"]),
			})
			if err != nil {
				log.Printf("install kick-off for instance %d failed: %v", id, err)
				_ = instRepo2.UpdateInstallStatus(id, "failed", installID, 0, "edge install start failed: "+err.Error(), installStepsJSON)
				_ = instRepo2.SetStatus(id, "install_failed", "", "edge install start failed: "+err.Error())
				return
			}
			// Install started successfully; installSweepLoop will poll for progress.
		}
	}()

	// Fire-and-forget activity log: open its own DB connection so it never
	// contends with the response or with the deploy goroutine. Same
	// fire-and-forget pattern SecurityMiddleware uses for telemetry: a
	// logging failure must never block or break the deploy response. The
	// deploy RPC is the hot path; every synchronous DB call here is one
	// more chance for an upstream proxy to time out before the panel's
	// JSON 200 reaches the SPA.
	go func(input repository.ActivityInput, req *http.Request) {
		con, err := repository.OpenDB()
		if err != nil {
			return
		}
		defer con.Close()
		repo := repository.NewActivityRepository(con)
		if input.Username == "" || input.Role == "" || input.UserID == nil {
			username, role, uid := resolvedActor(req)
			if input.Username == "" {
				input.Username = username
			}
			if input.Role == "" {
				input.Role = role
			}
			if input.UserID == nil {
				input.UserID = uid
			}
		}
		input.IPAddress = clientIP(req)
		input.UserAgent = req.UserAgent()
		_, _ = repo.Create(input)
	}(repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "deploy",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("deployed instance %q (%s) onto %q from template %q", req.Name, tmpl.Kind, node.Name, tmpl.Name),
	}, r)
	writeJSON(w, map[string]any{
		"id":            id,
		"external_id":   "",
		"status":        "creating",
		"install_state": "",
	})
}

// getString safely extracts a string from a map[string]any.
func getString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// getBool safely extracts a bool from a map[string]any.
func getBool(m map[string]any, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

// instanceControlsAllow reports whether the instance's stored config snapshot
// permits a template-gated control key (e.g. "allow_start"). The block lives
// at config.instance_controls and is snapshotted from the template spec at
// deploy time. A missing/unparseable block or key means allow-all, so old
// templates and instances behave exactly as before.
func instanceControlsAllow(configJSON, key string) bool {
	s := strings.TrimSpace(configJSON)
	if s == "" {
		return true
	}
	var cfg map[string]any
	if err := json.Unmarshal([]byte(s), &cfg); err != nil {
		return true
	}
	raw, ok := cfg["instance_controls"]
	if !ok {
		return true
	}
	block, ok := raw.(map[string]any)
	if !ok {
		return true
	}
	v, ok := block[key]
	if !ok {
		return true
	}
	b, ok := v.(bool)
	if !ok {
		return true
	}
	return b
}

// forbidByInstanceControls rejects a mutating instance call the template's
// allow-list disables for this instance. It mirrors the frontend's
// InstanceControls gating so direct API calls cannot bypass template
// restrictions. Returns true when the request was rejected.
func forbidByInstanceControls(w http.ResponseWriter, configJSON, key, action string) bool {
	if instanceControlsAllow(configJSON, key) {
		return false
	}
	writeJSONStatus(w, http.StatusForbidden, map[string]any{
		"error": fmt.Sprintf("forbidden: template disallows %s for this instance", action),
	})
	return true
}

// maxWorkflowTimeoutSec caps operator-authored workflow budgets at 30 days so
// the edge's time.Duration(seconds)*time.Second conversion can never overflow.
const maxWorkflowTimeoutSec = 2592000

// timeoutSecFromSpec normalises an operator-authored timeout (the template
// spec's install_timeout_sec number, or an action's max_runtime_s string)
// into whole seconds for the edge's InstallStartRequest.TimeoutSec. It
// accepts the JSON-decoded shapes (float64 number or numeric string) and
// returns 0 when unset/invalid — callers decide whether 0 means "edge
// default" (install workflows) or "no limit" (actions).
func timeoutSecFromSpec(v any) int {
	n := 0
	switch t := v.(type) {
	case float64:
		if t >= 1 {
			n = int(t)
		}
	case string:
		if p, err := strconv.Atoi(strings.TrimSpace(t)); err == nil && p > 0 {
			n = p
		}
	case int:
		if t > 0 {
			n = t
		}
	}
	if n > maxWorkflowTimeoutSec {
		n = maxWorkflowTimeoutSec
	}
	return n
}

// validInstanceName checks the instance name against docker-compatible rules.
// 1-63 chars, [a-zA-Z0-9_-], must start with [a-zA-Z0-9], no leading hyphen.
// The check is intentionally strict: a name that passes here is valid on
// docker, lxd, kvm and multipass. We don't try to be cleverer than docker's
// own validator — if docker rejects a name we missed, the edge's RPC will
// return the precise rejection message back to the panel UI.
func validInstanceName(name string) bool {
	if len(name) == 0 || len(name) > 63 {
		return false
	}
	// First char: alphanumeric (no leading hyphen).
	if !isAlnum(name[0]) {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		if !isAlnum(c) && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

func isAlnum(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
}

// requestedPort is one desired host binding extracted from a deploy cfg or a
// ports-update payload. proto is lower-cased ("tcp"/"udp"), ip is trimmed
// ("" = all interfaces).
type requestedPort struct {
	host  int
	proto string
	ip    string
}

// portBindingKey normalises a host binding so DB rows and deploy payloads
// compare identically: empty ip = wildcard, proto lower-cased.
func portBindingKey(ip string, host int, proto string) string {
	ip = strings.TrimSpace(ip)
	proto = strings.ToLower(strings.TrimSpace(proto))
	if proto == "" {
		proto = "tcp"
	}
	return fmt.Sprintf("%s:%d/%s", ip, host, proto)
}

// extractRequestedPorts pulls the desired host bindings out of a deploy cfg's
// opaque `ports` key. It tolerates the shapes the edge driver accepts
// (host/host_port, container/container_port, protocol, ip) and skips entries
// without a valid host port so a malformed template surfaces downstream at
// the edge instead of here. Host ports arrive as JSON numbers AND as strings
// (the template form serialises ports as strings) — both are accepted,
// otherwise string ports silently bypassed collision detection.
func extractRequestedPorts(cfg map[string]any) []requestedPort {
	raw, ok := cfg["ports"].([]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	out := make([]requestedPort, 0, len(raw))
	for _, it := range raw {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		host := portNumberFrom(m["host"])
		if host == 0 {
			host = portNumberFrom(m["host_port"])
		}
		if host < 1 || host > 65535 {
			continue
		}
		proto, _ := m["protocol"].(string)
		ip, _ := m["ip"].(string)
		out = append(out, requestedPort{host: host, proto: proto, ip: ip})
	}
	return out
}

// portNumberFrom coerces a JSON-decoded port value (float64/int/int64 from
// hand-written manifests, string from the template form) into an int.
// Returns 0 when the value is missing or not a valid port.
func portNumberFrom(v any) int {
	switch n := v.(type) {
	case float64:
		if n >= 1 && n <= 65535 {
			return int(n)
		}
	case float32:
		if n >= 1 && n <= 65535 {
			return int(n)
		}
	case int:
		if n >= 1 && n <= 65535 {
			return n
		}
	case int64:
		if n >= 1 && n <= 65535 {
			return int(n)
		}
	case string:
		if p, err := strconv.Atoi(strings.TrimSpace(n)); err == nil && p >= 1 && p <= 65535 {
			return p
		}
	}
	return 0
}

// findPortCollision reports whether any wanted host binding is already taken
// on the node by another instance (excludeID skips the caller itself; pass 0
// on deploy). It consults both sources of truth: the instance_ports table
// (055, PUT /ports editor) and the instances.config JSON blobs (template
// spec ports used at deploy time). Returns the colliding wanted binding + the
// owning instance name. A DB error degrades to "no collision" so a transient
// failure never blocks deploys — the edge's docker run remains the final
// arbiter and now cleans up + returns a friendly hint on 125.
func findPortCollision(con sqlDB, nodeID, excludeID int64, want []requestedPort) (requestedPort, string, bool) {
	if len(want) == 0 {
		return requestedPort{}, "", false
	}
	used := map[string]string{}
	// Source 1: instance_ports allocations.
	rows, err := con.Query(`SELECT p.host_port, p.protocol, p.ip, i.name FROM instance_ports p JOIN instances i ON i.id = p.instance_id WHERE i.node_id = ? AND p.instance_id != ?`, nodeID, excludeID)
	if err == nil {
		for rows.Next() {
			var hp int
			var proto, ip, owner string
			if serr := rows.Scan(&hp, &proto, &ip, &owner); serr != nil {
				continue
			}
			used[portBindingKey(ip, hp, proto)] = owner
		}
		_ = rows.Err()
		_ = rows.Close()
	}
	// Source 2: instances.config JSON ports (deploy-time spec).
	rows2, err := con.Query(`SELECT name, config FROM instances WHERE node_id = ? AND id != ?`, nodeID, excludeID)
	if err == nil {
		for rows2.Next() {
			var owner, cfgJSON string
			if serr := rows2.Scan(&owner, &cfgJSON); serr != nil || cfgJSON == "" {
				continue
			}
			var cfg map[string]any
			if jerr := json.Unmarshal([]byte(cfgJSON), &cfg); jerr != nil {
				continue
			}
			for _, p := range extractRequestedPorts(cfg) {
				k := portBindingKey(p.ip, p.host, p.proto)
				if _, ok := used[k]; !ok {
					used[k] = owner
				}
			}
		}
		_ = rows2.Err()
		_ = rows2.Close()
	}
	for _, w := range want {
		if owner, ok := used[portBindingKey(w.ip, w.host, w.proto)]; ok {
			return w, owner, true
		}
	}
	return requestedPort{}, "", false
}

// instanceAction is the helper used by start/stop/kill/destroy — they all
// share the same read-row → dial-node → mirror-status dance.
func instanceAction(w http.ResponseWriter, r *http.Request, action string) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	nodeRepo := repository.NewNodeRepository(con)

	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope enforcement for instance lifecycle: Own → must own the instance.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only manage own instances", http.StatusForbidden)
			return
		}
	}
	// Suspended instances are blocked from lifecycle mutations (start/stop/
	// kill/restart) until an admin unsuspends them. Destroy is exempt so a
	// suspended workload can still be cleaned up.
	if action != "destroy" {
		if suspended, until, _ := instRepo.IsInstanceSuspended(id); suspended {
			msg := "instance is suspended indefinitely"
			if until != nil {
				msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
			}
			writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
			return
		}
	}
	// Template allow-list (instance.Config snapshot, allow-all default) —
	// the frontend hides these buttons, but the API must enforce it too.
	if key, ok := map[string]string{
		"start": "allow_start", "stop": "allow_stop",
		"kill": "allow_kill", "destroy": "allow_destroy",
	}[action]; ok {
		if forbidByInstanceControls(w, inst.Config, key, action) {
			return
		}
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		http.Error(w, "owning node not found", http.StatusBadRequest)
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}

	// Mod engine pre-hook: an active mod may veto the action before any work
	// happens. Guarded by HasHooks so panels with no listening mods pay
	// nothing on this hot path. Cancellation surfaces as 409 with the hook's
	// message so the UI can show WHY the action was refused.
	preEvent := "pre:instance." + action
	if modengine.Default().HasHooks(preEvent) {
		cancelled, msg := modengine.Default().EmitPre(r.Context(), preEvent, map[string]any{
			"id": id, "name": inst.Name, "kind": inst.Kind, "node": inst.NodeName,
		})
		if cancelled {
			writeJSONStatus(w, http.StatusConflict, map[string]any{
				"error":   "blocked by a mod",
				"message": msg,
			})
			return
		}
	}

	// Try to perform lifecycle action with retries in case the edge is temporarily
	// unresponsive.
	var resp edge.LifecycleResponse
	var loopErr error
	for i := 0; i < 3; i++ {
		ec := edge.NewWithTimeout(*node, token, 60*time.Second)
		resp, loopErr = ec.Lifecycle(edge.LifecycleRequest{
			Action: action,
			Kind:   inst.Kind,
			Name:   inst.Name,
		})
		if loopErr == nil {
			if i > 0 {
				log.Printf("instanceAction: edge lifecycle %s succeeded on attempt %d for instance %d", action, i+1, id)
			}
			err = nil
			break
		}
		log.Printf("instanceAction: edge lifecycle %s failed on attempt %d for instance %d: %v", action, i+1, id, loopErr)
		// If this isn't the last attempt, wait a bit before retrying
		if i < 2 {
			time.Sleep(time.Second)
		}
	}
	if loopErr != nil {
		err = loopErr
		log.Printf("instanceAction: all retries exhausted for instance %d action %s, edge unreachable: %v", id, action, loopErr)
		// Reflect edge errors into the instance row so the UI can show them
		// instead of silently dropping the failure.
		_ = instRepo.SetStatus(id, "errored", inst.ExternalID, err.Error())
		writeJSON(w, map[string]any{
			"id":      id,
			"status":  "errored",
			"error":   "edge rejected " + action + ": " + err.Error(),
			"warning": "edge did not confirm " + action + " after 3 retries: " + loopErr.Error(),
		})
		return
	}

	switch action {
	case "destroy":
		// destroy removes the row entirely once the edge confirms the
		// workload is gone. SFTP is deprovisioned first (best-effort edge
		// delete + row + vault) so no orphan credential survives; the
		// instance_sftp row would cascade-delete with the instance anyway,
		// but the vault secret and the edge in-memory cred need explicit
		// removal.
		removeSFTPFromEdge(con, inst)
		_ = repository.NewSFTPRepository(con).Delete(id)
		_ = repository.NewSecretRepository(con).Delete(id, repository.SFTPSecretKey)
		if err := instRepo.Delete(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		emitInstancePost(action, id, inst)
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryInstance,
			Action:      "destroy",
			TargetID:    &id,
			TargetLabel: inst.Name,
			Message:     fmt.Sprintf("destroyed instance %q (%s) on %q", inst.Name, inst.Kind, inst.NodeName),
		})
		w.WriteHeader(http.StatusNoContent)
		return
	default:
		// start/stop/kill mirror the edge's reported status.
		status := resp.Status
		if status == "" {
			status = action + "ed" // "started" / "stopped" — best-effort fallback
		}
		if err := instRepo.SetStatus(id, status, inst.ExternalID, ""); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// A start heals SFTP after an edge restart (in-memory creds are
		// wiped by the restart; the vault still holds the password, so
		// re-push best-effort without failing the start).
		if action == "start" {
			if fresh, gerr := instRepo.Get(id); gerr == nil && fresh != nil {
				_ = provisionSFTPForInstance(con, fresh)
			}
		}
		emitInstancePost(action, id, inst)
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryInstance,
			Action:      action,
			TargetID:    &id,
			TargetLabel: inst.Name,
			Message:     fmt.Sprintf("%sed instance %q (%s) on %q", action, inst.Name, inst.Kind, inst.NodeName),
		})
		writeJSON(w, map[string]any{"id": id, "status": status})
	}
}

// emitInstancePost fires the async post:instance.<action> hook for mods that
// subscribed via the engine bus. HasHooks-guarded: no listeners -> no
// allocation, no goroutines. Post hooks are fire-and-forget by contract; a
// slow or crashing hook must never stall or fail the instance action.
func emitInstancePost(action string, id int64, inst *models.Instance) {
	postEvent := "post:instance." + action
	if !modengine.Default().HasHooks(postEvent) {
		return
	}
	modengine.Default().EmitPost(context.Background(), postEvent, map[string]any{
		"id": id, "name": inst.Name, "kind": inst.Kind, "node": inst.NodeName,
	})
}

func StartInstanceHandler(w http.ResponseWriter, r *http.Request)   { instanceAction(w, r, "start") }
func StopInstanceHandler(w http.ResponseWriter, r *http.Request)    { instanceAction(w, r, "stop") }
func KillInstanceHandler(w http.ResponseWriter, r *http.Request)    { instanceAction(w, r, "kill") }
func DestroyInstanceHandler(w http.ResponseWriter, r *http.Request) { instanceAction(w, r, "destroy") }

// RestartInstanceHandler restarts an instance by issuing a stop RPC followed
// by a start RPC to the owning edge. The edge's lifecycle dispatch has no
// native "restart" action (restart stays graceful; Kill is the forceful
// counterpart), so the panel composes the two primitives it already has. Mirrors
// instanceAction's shape: load row → dial node → retry each RPC up to 3x →
// mirror the edge-reported status back into the row.
func RestartInstanceHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	nodeRepo := repository.NewNodeRepository(con)

	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope for restart: Own → must own the instance.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only manage own instances", http.StatusForbidden)
			return
		}
	}
	// Suspended instances stay stopped until an admin unsuspends them.
	if suspended, until, _ := instRepo.IsInstanceSuspended(id); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}
	// Template allow-list (instance.Config snapshot, allow-all default).
	if forbidByInstanceControls(w, inst.Config, "allow_restart", "restart") {
		return
	}
	// A deploy already in flight owns the row — restarting over
	// "creating"/"installing" races the deploy goroutine and orphans status.
	if inst.Status == "creating" || inst.Status == "installing" {
		writeJSONStatus(w, http.StatusConflict, map[string]any{
			"error": fmt.Sprintf("instance is %q — wait for the deploy to finish before restarting", inst.Status),
		})
		return
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		http.Error(w, "owning node not found", http.StatusBadRequest)
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}

	preEvent := "pre:instance.restart"
	if modengine.Default().HasHooks(preEvent) {
		cancelled, msg := modengine.Default().EmitPre(r.Context(), preEvent, map[string]any{
			"id": id, "name": inst.Name, "kind": inst.Kind, "node": inst.NodeName,
		})
		if cancelled {
			writeJSONStatus(w, http.StatusConflict, map[string]any{
				"error":   "blocked by a mod",
				"message": msg,
			})
			return
		}
	}

	ec := edge.NewWithTimeout(*node, token, 60*time.Second)
	lifecycleWithRetry := func(action string) (edge.LifecycleResponse, error) {
		var resp edge.LifecycleResponse
		var lastErr error
		for i := 0; i < 3; i++ {
			resp, lastErr = ec.Lifecycle(edge.LifecycleRequest{
				Action: action,
				Kind:   inst.Kind,
				Name:   inst.Name,
			})
			if lastErr == nil {
				return resp, nil
			}
			log.Printf("RestartInstanceHandler: edge lifecycle %s failed on attempt %d for instance %d: %v", action, i+1, id, lastErr)
			if i < 2 {
				time.Sleep(time.Second)
			}
		}
		return resp, lastErr
	}

	if _, stopErr := lifecycleWithRetry("stop"); stopErr != nil {
		_ = instRepo.SetStatus(id, "errored", inst.ExternalID, "restart stop failed: "+stopErr.Error())
		writeJSON(w, map[string]any{
			"id":     id,
			"status": "errored",
			"error":  "edge rejected restart stop: " + stopErr.Error(),
		})
		return
	}
	startResp, startErr := lifecycleWithRetry("start")
	if startErr != nil {
		_ = instRepo.SetStatus(id, "errored", inst.ExternalID, "restart start failed: "+startErr.Error())
		writeJSON(w, map[string]any{
			"id":     id,
			"status": "errored",
			"error":  "edge rejected restart start: " + startErr.Error(),
		})
		return
	}
	status := startResp.Status
	if status == "" {
		status = "running"
	}
	if err := instRepo.SetStatus(id, status, inst.ExternalID, ""); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	emitInstancePost("restart", id, inst)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "restart",
		TargetID:    &id,
		TargetLabel: inst.Name,
		Message:     fmt.Sprintf("restarted instance %q (%s) on %q", inst.Name, inst.Kind, inst.NodeName),
	})
	writeJSON(w, map[string]any{"id": id, "status": status})
}

// SuspendInstanceHandler suspends an instance with optional auto-unsuspend time.
func SuspendInstanceHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var req struct {
		Reason        string `json:"reason"`
		DurationHours *int   `json:"duration_hours,omitempty"` // nil = until admin unsuspends
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if req.Reason == "" {
		http.Error(w, "reason is required", http.StatusBadRequest)
		return
	}

	callerID, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	caller, err := repository.NewUserRepository(con).GetByID(callerID)
	callerName := "unknown"
	if err == nil && caller != nil {
		callerName = caller.Username
	}

	instRepo := repository.NewInstanceRepository(con)
	targetInst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}

	var suspendedUntil *time.Time
	if req.DurationHours != nil && *req.DurationHours > 0 {
		t := time.Now().Add(time.Duration(*req.DurationHours) * time.Hour)
		suspendedUntil = &t
	}

	newCount, err := instRepo.SuspendInstance(id, suspendedUntil, req.Reason, callerID, callerName)
	if err != nil {
		log.Println("SuspendInstance error:", err)
		http.Error(w, "failed to suspend instance", http.StatusInternalServerError)
		return
	}

	// Suspend blocks SFTP auth: flip enabled=0 and delete the edge
	// in-memory credential (the vault password + row survive so unsuspend
	// restores without minting a new password). Best-effort edge delete —
	// a down edge loses the cred on its next restart anyway.
	_ = repository.NewSFTPRepository(con).SetEnabled(id, 0)
	removeSFTPFromEdge(con, targetInst)
	auditInst(r, id, "sftp.suspend", "suspended SFTP access")

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "suspend",
		TargetID:    &id,
		TargetLabel: targetInst.Name,
		Message:     fmt.Sprintf("suspended instance %q (count: %d, reason: %s)", targetInst.Name, newCount, req.Reason),
	})

	writeJSON(w, map[string]any{"suspension_count": newCount})
}

// UnsuspendInstanceHandler unsuspends an instance.
func UnsuspendInstanceHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	_, err = UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	targetInst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}

	count, err := instRepo.UnsuspendInstance(id)
	if err != nil {
		log.Println("UnsuspendInstance error:", err)
		http.Error(w, "failed to unsuspend instance", http.StatusInternalServerError)
		return
	}

	// Unsuspend restores SFTP when a row exists: flip enabled=1 and
	// re-provision the edge from the vaulted password (best-effort — a
	// down edge heals on the next start/rotate instead).
	if cfg, _ := repository.NewSFTPRepository(con).Get(id); cfg != nil {
		_ = repository.NewSFTPRepository(con).SetEnabled(id, 1)
		if fresh, gerr := instRepo.Get(id); gerr == nil && fresh != nil {
			_ = provisionSFTPForInstance(con, fresh)
		}
		auditInst(r, id, "sftp.unsuspend", "restored SFTP access after unsuspend")
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "unsuspend",
		TargetID:    &id,
		TargetLabel: targetInst.Name,
		Message:     fmt.Sprintf("unsuspended instance %q (total suspensions: %d)", targetInst.Name, count),
	})

	writeJSON(w, map[string]any{"suspension_count": count})
}

// guard against future unused-symbol lints as the suite grows
var _ = models.Instance{}

// driverMissingOn returns the CLI the operator must install on the edge for the
// given kind, or "" when the node already advertises that driver (or when the
// kind isn't one of the four well-known drivers we preflight). We key off the
// heartbeat-reported driver_* flags rather than dialing the edge so a deploy
// onto a node whose edge is down or whose CLI is absent fails fast with a
// precise "install X" message instead of a 23ms-later 502 cloudflare banner.
//
// When the edge has never heartbeated (HwDriversOK == false and
// LastSeenAt == nil) we have no driver information at all — the node row
// was just created and the edge hasn't had time to push its first
// telemetry. Blocking deploy in that window with "install docker" is
// misleading: the edge may well have docker installed, we just haven't
// heard from it yet. Let the deploy proceed to the real dial (which will
// surface the honest "edge not connected via WSS tunnel" or "edge
// unreachable" error) instead of a false driver-missing banner. The same
// logic applies when HwDriversOK is false after a collector failure — we
// couldn't determine driver availability, so we shouldn't block.
func driverMissingOn(node models.Node, kind string) string {
	// No driver info yet (never heartbeated or collector failed) — allow
	// the deploy to reach the edge and fail with the real dial error.
	if !node.HwDriversOK && node.LastSeenAt == nil {
		return ""
	}
	if !node.HwDriversOK {
		return ""
	}
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "docker":
		if !node.DriverDocker {
			return "docker (or podman)"
		}
	case "kvm":
		if !node.DriverKVM {
			return "libvirt/virsh"
		}
	case "multipass":
		if !node.DriverMultipass {
			return "multipass"
		}
	case "lxd":
		if !node.DriverLXD {
			return "lxd (lxc)"
		}
	}
	return ""
}

// substituteInstanceName replaces the %INSTANCE_NAME% sentinel with the
// deployed instance's name inside the spec's `mounts` entries. The walk is
// shallow and only touches string fields that contain the sentinel; numbers
// and other shapes are left alone. We intentionally operate on `cfg` directly
// (the same map the edge will receive) so a template that hard-codes the
// placeholder becomes unique-per-deploy without the operator having to know.
func substituteInstanceName(cfg map[string]any, name string) {
	replace := func(s string) string {
		if strings.Contains(s, "%INSTANCE_NAME%") {
			return strings.ReplaceAll(s, "%INSTANCE_NAME%", name)
		}
		return s
	}
	switch m := cfg["mounts"].(type) {
	case []any:
		for _, it := range m {
			if mp, ok := it.(map[string]any); ok {
				for k, v := range mp {
					if s, ok := v.(string); ok {
						mp[k] = replace(s)
					}
				}
			}
			if s, ok := it.(string); ok {
				_ = s // strings handled below via volumes block too
			}
		}
	}
	switch v := cfg["volumes"].(type) {
	case []any:
		for i, it := range v {
			if s, ok := it.(string); ok {
				v[i] = replace(s)
			}
		}
	case map[string]any:
		out := map[string]any{}
		for k, val := range v {
			out[replace(k)] = val
		}
		cfg["volumes"] = out
	}
}

// substituteEnvVars walks the config map and replaces {{KEY}} placeholders
// in all string values with the corresponding values from envVars.
// This allows templates to use {{KEY}} in command, image, mounts, volumes,
// labels, devices, advanced settings, etc. — not just in install steps.
func substituteEnvVars(cfg map[string]any, envVars map[string]string) {
	if envVars == nil || len(envVars) == 0 {
		return
	}
	substitute := func(s string) string {
		for k, v := range envVars {
			s = strings.ReplaceAll(s, "{{"+k+"}}", v)
		}
		return s
	}

	var walk func(any) any
	walk = func(v any) any {
		switch x := v.(type) {
		case string:
			return substitute(x)
		case map[string]any:
			out := make(map[string]any, len(x))
			for k, val := range x {
				out[substitute(k)] = walk(val)
			}
			return out
		case []any:
			out := make([]any, len(x))
			for i, val := range x {
				out[i] = walk(val)
			}
			return out
		default:
			return v
		}
	}

	for k, v := range cfg {
		cfg[k] = walk(v)
	}
}

// InvokeActionHandler runs a template-defined "action" against an instance.
// URL: POST /api/instances/{id}/actions/{actionId}/invoke
//
// The flow deliberately reuses the edge's install workflow engine — the same
// `/api/edge/install` ReadThat PleX-style "sequential shell steps inside a
// container" engine — to run the action's `steps[]`. This gives every action
// structured progress tracking (the InstallBanner already understands), the
// retry-on-not-running semantics of the install handler, and a single code
// path on the edge; we never had to invent a second RPC.
//
// Lifecycle orchestration panel-side:
//  1. Load the instance row + the template that produced it.
//  2. Parse the template's spec JSON, find the action by `id`.
//  3. Refuse if the install workflow is still in flight
//     (install_state="running"); actions must not race with an install.
//  4. If `auto_start_instance` is set and the instance isn't yet running,
//     send `lifecycle{action:"start"}` to the edge first. Wait briefly.
//  5. Send InstallStart with the action's steps (freshly re-keyed as
//     edge.InstallStep). The edge overwrites the existing install record
//     for this container — always OK because step 3 rejected the race.
//  6. Mark `instance.install_state="running"` + `install_steps_json=<steps>`
//     so the home-page InstallBanner can show action progress, and set
//     `instance.status="running"` so the instance card flips to "running".
//  7. installSweepLoop already watches install_state="running"; on `done`
//     it (a) calls `Lifecycle{action:"stop"}` when the action has
//     `auto_stop_on_exit: true` (so a long_running java step that died
//     naturally tears down the container), and (b) sets `instance.status`
//     back to "stopped" or "running" accordingly.
//
// Because the auto_stop_on_exit teardown lives in the sweep loop, this
// handler stays synchronous & tiny — it just kicks the edge and returns.
// The "long_running" main process lives in the EDGE's install-record goroutine
// (the install handler's wait-on-Wait blocks until the exec exits), so the
// panel can return 200 to the SPA the moment the edge accepts the workflow.
func InvokeActionHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	actionID := chi.URLParam(r, "actionId")
	if actionID == "" {
		http.Error(w, "invalid action id", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	tmplRepo := repository.NewTemplateRepository(con)
	nodeRepo := repository.NewNodeRepository(con)

	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope for invoke: Own → must own the instance.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only manage own instances", http.StatusForbidden)
			return
		}
	}
	if suspended, until, _ := instRepo.IsInstanceSuspended(id); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}
	if inst.InstallState == "running" {
		// Refuse to overlap an in-flight install workflow (or another action
		// already in progress). Both share the same edge install record key
		// <kind>:<name>, so a concurrent POST would shell into a container
		// that already has a `docker exec` running and the per-step
		// `isContainerNotRunningErr` retry path would misbehave.
		http.Error(w, "install or action already in progress on this instance", http.StatusConflict)
		return
	}

	tmpl, err := tmplRepo.Get(inst.TemplateID)
	if err != nil {
		http.Error(w, "owning template not found (deleted?)", http.StatusBadRequest)
		return
	}

	// Parse instance config to extract env vars for action step substitution.
	// The instance's Config field contains the merged config from deploy time,
	// including all env vars (secrets and non-secrets).
	var actionEnvVars map[string]string
	if inst.Config != "" {
		var cfgMap map[string]any
		if err := json.Unmarshal([]byte(inst.Config), &cfgMap); err == nil {
			if envMap, ok := cfgMap["env"].(map[string]any); ok {
				actionEnvVars = make(map[string]string, len(envMap))
				for k, v := range envMap {
					if s, ok := v.(string); ok {
						actionEnvVars[k] = s
					}
				}
			}
		}
	}

	// Parse the spec JSON, find the action by id.
	var spec struct {
		Actions []templateActionSpec `json:"actions"`
	}
	if err := json.Unmarshal([]byte(tmpl.Spec), &spec); err != nil {
		http.Error(w, "template spec is not valid JSON", http.StatusInternalServerError)
		return
	}

	var action *templateActionSpec
	for i := range spec.Actions {
		if spec.Actions[i].ID == actionID {
			action = &spec.Actions[i]
			break
		}
	}
	if action == nil {
		http.Error(w, "action not found in template: "+actionID, http.StatusNotFound)
		return
	}
	if len(action.Steps) == 0 {
		http.Error(w, "action has no steps to run", http.StatusBadRequest)
		return
	}

	// Edge connection setup (mirrors instanceAction's pattern).
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		http.Error(w, "owning node not found", http.StatusBadRequest)
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	ec := edge.NewWithTimeout(*node, token, 60*time.Second)

	// Auto-start: when the action declares it brings up a stopped instance,
	// issue lifecycle{start} before exec-ing into it. We accept the edge's
	// reported status ("running") and mirror into our row so the card flips
	// state immediately, before the action's first step even starts.
	if action.AutoStart && inst.Status != "running" && inst.Status != "installing" {
		var startResp edge.LifecycleResponse
		var startErr error
		for i := 0; i < 3; i++ {
			startResp, startErr = ec.Lifecycle(edge.LifecycleRequest{
				Action: "start",
				Kind:   inst.Kind,
				Name:   inst.Name,
			})
			if startErr == nil {
				if i > 0 {
					log.Printf("InvokeActionHandler: auto-start succeeded on attempt %d for instance %d", i+1, id)
				}
				break
			}
			log.Printf("InvokeActionHandler: auto-start failed on attempt %d for instance %d: %v", i+1, id, startErr)
			if i < 2 {
				time.Sleep(time.Second)
			}
		}
		if startErr != nil {
			_ = instRepo.SetStatus(id, "errored", inst.ExternalID, "auto-start failed: "+startErr.Error())
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "edge rejected auto-start: " + startErr.Error(),
			})
			return
		}
		st := startResp.Status
		if st == "" {
			st = "running"
		}
		_ = instRepo.SetStatus(id, st, inst.ExternalID, "")
	}

	// Build edge.InstallStep slice from the action's steps and POST to the
	// edge's install workflow engine. The edge will exec each step in order
	// inside the container; stdout/stderr are captured by the per-step
	// transcript that the panel polls via /api/edge/install GET.
	edgeSteps := make([]edge.InstallStep, len(action.Steps))
	for i, s := range action.Steps {
		edgeSteps[i] = edge.InstallStep{
			Action:       s.Action,
			Command:      s.Command,
			URL:          s.URL,
			Filename:     s.Filename,
			Archive:      s.Archive,
			Dest:         s.Dest,
			From:         s.From,
			To:           s.To,
			Path:         s.Path,
			Content:      s.Content,
			Branch:       s.Branch,
			Retries:      s.Retries,
			IgnoreErrors: s.IgnoreErrors,
		}
	}

	// Persist install_state + steps_json BEFORE the InstallStart call so
	// the InstallBanner on the home page paints progress the moment the
	// poller sees the workflow's first step. Also persist install_kind=
	// 'action' + install_auto_stop so the install sweep loop on "done"
	// knows this was an action invocation, not the template's install
	// workflow, and decides whether to stop the container based on the
	// action's auto_stop_on_exit flag.
	installID := inst.Kind + ":" + inst.Name
	stepsJSON, _ := json.Marshal(edgeSteps)
	_ = instRepo.UpdateInstallStatus(id, "running", installID, -1, "", string(stepsJSON))
	autoStop := 0
	if action.AutoStopOnExit {
		autoStop = 1
	}
	_ = instRepo.SetInstallKind(id, "action", autoStop)
	_ = instRepo.SetInstallActionID(id, actionID)

	// Try to start the action with retries in case the edge is temporarily
	// unresponsive.
	//
	// Workflow budget: the TemplateForm's per-action "Max runtime (s)"
	// (max_runtime_s). Empty/"0" is documented in the form as NO limit — and
	// long_running actions (e.g. booting a Minecraft server) are meant to
	// keep the container alive for days until the operator clicks Stop — so
	// we send -1 (edge: no deadline) unless a positive value is set. Before
	// this field was wired, every action inherited the edge's hidden 30-minute
	// cap and died with the panel mislabelling it "install_failed".
	timeoutSec := timeoutSecFromSpec(action.MaxRuntimeS)
	if timeoutSec == 0 {
		timeoutSec = -1
	}
	var resp edge.InstallStartResponse
	var loopErr error
	for i := 0; i < 3; i++ {
		resp, loopErr = ec.InstallStart(edge.InstallStartRequest{
			Token:      token,
			Kind:       inst.Kind,
			Name:       inst.Name,
			Steps:      edgeSteps,
			EnvVars:    actionEnvVars,
			KeepStdin:  action.StopMode == "same",
			TimeoutSec: timeoutSec,
		})
		if loopErr == nil {
			if i > 0 {
				log.Printf("InvokeActionHandler: edge install start succeeded on attempt %d for instance %d (actionID=%q stopMode=%q)", i+1, id, actionID, action.StopMode)
			}
			err = nil
			break
		}
		log.Printf("InvokeActionHandler: edge install start failed on attempt %d for instance %d (actionID=%q stopMode=%q): %v", i+1, id, actionID, action.StopMode, loopErr)
		// If this isn't the last attempt, wait a bit before retrying
		if i < 2 {
			time.Sleep(time.Second)
		}
	}
	if loopErr != nil {
		err = loopErr
	}
	if err != nil {
		_ = instRepo.UpdateInstallStatus(id, "failed", installID, 0, "edge install start failed: "+err.Error(), string(stepsJSON))
		_ = instRepo.SetInstallKind(id, "", 0)
		_ = instRepo.SetInstallActionID(id, "")
		_ = instRepo.SetStatus(id, "errored", inst.ExternalID, "action invoke failed: "+err.Error())
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge rejected action invoke: " + err.Error(),
		})
		return
	}
	_ = resp // InstallStartResponse carries install_id; we already built our own.

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "invoke_action",
		TargetID:    &id,
		TargetLabel: inst.Name,
		Message:     fmt.Sprintf("invoked action %q on instance %q (%s)", actionID, inst.Name, inst.Kind),
	})

	writeJSON(w, map[string]any{
		"id":            id,
		"action_id":     actionID,
		"action_name":   action.Name,
		"install_state": "running",
		"status":        "running",
	})
}

// StopActionHandler cancels the currently-running action workflow on this
// instance and (when the template action defines a stop_command) runs that
// command once inside the container. It is the panel half of the instance
// home-page "Stop" button: the ActionsCard morphs the running action's button
// from "invoke" to "Stop" when install_state='running' + install_action_id
// matches the action; clicking Stop POSTs /actions/{actionId}/stop here.
//
// Flow:
//  1. Load the instance; refuse if no workflow is running
//     (install_state!='running') OR a different action is running than the
//     one Stop was clicked on — install_action_id gates this so the
//     operator can only stop the exact action the banner says is in flight.
//  2. Resolve the owning template + action (same lookup InvokeActionHandler
//     does) to read the action's optional stop_command.
//  3. POST /api/edge/install/stop to the edge with Kind+Name (the workflow
//     record key) + the stop_command. The edge cancels the running workflow's
//     context — install.Run observes the cancellation between/within steps
//     and aborts the in-flight exec — then execs stop_command once.
//  4. The edge returns the prior workflow state ('running' = was cancelled,
//     'done'/'failed' = already resolved, 'unknown' = no record) plus the
//     stop_command's captured I/O. We surface that to the SPA.
//
// We DON'T touch install_state here: installSweepLoop's next tick will see the
// edge's 'done'/'failed'/'cancelled' state and apply the normal completion
// policy (stop the container if install_auto_stop is set, else mark running).
// Stopping an action is "tell the edge to abort + clean up"; the row's
// lifecycle transition is the sweep loop's job, exactly as it is for an
// action that finishes naturally. The single exception is install_action_id:
// we clear it immediately so the home-page button morphs back from "Stop" to
// its invoke label the moment Stop resolves (the operator should see the
// button flip back, not wait for the sweep loop's ~2s tick).
func StopActionHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	clickedActionID := chi.URLParam(r, "actionId")
	if clickedActionID == "" {
		http.Error(w, "invalid action id", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	instRepo := repository.NewInstanceRepository(con)
	tmplRepo := repository.NewTemplateRepository(con)
	nodeRepo := repository.NewNodeRepository(con)

	inst, err := instRepo.Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope for stop: Own → must own the instance.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only manage own instances", http.StatusForbidden)
			return
		}
	}
	// Treat any state where the install workflow is no longer actionable as
	// "already resolved" — return 200 with edge_state="already_done" so the
	// ActionsCard morphs the button back to its invoke label without a 502
	// (which previously leaked through when the installSweepLoop finished
	// the workflow between the page render and the click, leaving the row
	// in install_state='done'/'failed'/'unknown'/'install_failed' while
	// the operator's UI still showed the red Stop button). The original
	// 409 here made the operator think the panel was broken — the
	// installSweepLoop is the source of truth for workflow state, so any
	// state it has finalised deserves a clean 200 from us, not an error.
	if inst.InstallState != "running" {
		// Clear install_action_id regardless so the home-page button
		// morphs back to its invoke label.
		_ = instRepo.SetInstallActionID(id, "")
		writeJSON(w, map[string]any{
			"id":           id,
			"action_id":    clickedActionID,
			"edge_state":   "already_done",
			"exit_code":    0,
			"stdout":       "",
			"stderr":       "",
			"stop_command": "",
		})
		return
	}
	// install_action_id gates Stop to the exact action the banner reports in
	// flight. A mismatch means the operator clicked Stop on an action whose
	// workflow is no longer the one running — we used to 409 here, but the
	// same stale-UI problem as above applies: the operator sees a red Stop
	// button, clicks it, and gets an opaque 409. Two safe fall-throughs:
	//
	//   1. install_kind='' and install_action_id='' — the installSweepLoop
	//      has just cleared them as part of normal completion (the row is
	//      briefly in this snapshot mid-write because the three UPDATEs are
	//      not in a transaction, even after the re-ordering fix in
	//      installSweepLoop). Fall through to the edge call — the edge's
	//      /install/stop is idempotent (200 with state=done/failed/unknown
	//      is treated as success by InstallStop).
	//   2. install_kind='action' but install_action_id points at a DIFFERENT
	//      action — the operator clicked Stop on a stale UI after the panel
	//      had already started a different action. Return 200 with
	//      edge_state="already_done" so the ActionsCard cleans up; do NOT
	//      forward to the edge, that would cancel the OTHER action's
	//      workflow. (This is the one case where the UI's stop button
	//      really shouldn't have been clickable; treating it as a no-op
	//      keeps the operator out of trouble.)
	if inst.InstallKind == "action" && inst.InstallActionID != clickedActionID {
		// Wrong-action click: clean no-op, don't touch the other workflow.
		_ = instRepo.SetInstallActionID(id, "")
		writeJSON(w, map[string]any{
			"id":           id,
			"action_id":    clickedActionID,
			"edge_state":   "already_done",
			"exit_code":    0,
			"stdout":       "",
			"stderr":       "",
			"stop_command": "",
		})
		return
	}

	// Resolve the template + action to read the optional stop_command and stop_mode. The
	// action must exist (we set install_action_id from spec.actions[].id at
	// invoke time, so a missing action here means the template was edited/
	// the action removed mid-run — proceed with empty values so the cancel still fires).
	var stopCommand string
	var stopMode string
	tmpl, err := tmplRepo.Get(inst.TemplateID)
	if err == nil {
		var spec struct {
			Actions []templateActionSpec `json:"actions"`
		}
		if json.Unmarshal([]byte(tmpl.Spec), &spec) == nil {
			for i := range spec.Actions {
				if spec.Actions[i].ID == clickedActionID {
					stopCommand = spec.Actions[i].StopCommand
					stopMode = spec.Actions[i].StopMode
					break
				}
			}
		}
	}

	// Default stop mode to "different" (existing behavior)
	if stopMode == "" {
		stopMode = "different"
	}

	// Edge connection (same setup as invoke/auto-start). 30s is plenty — the
	// edge's stop RPC returns the moment the cancel is fired; the
	// stop_command, if any, runs up to its own 5-min edge budget.
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		http.Error(w, "owning node not found", http.StatusBadRequest)
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	ec := edge.NewWithTimeout(*node, token, 60*time.Second)

	// Try to stop the action with retries in case the edge is temporarily
	// unresponsive (e.g., still setting up the workflow after invoke).
	var resp edge.InstallStopResponse
	var loopErr error
	for i := 0; i < 3; i++ {
		resp, loopErr = ec.InstallStop(edge.InstallStopRequest{
			Token:       token,
			Kind:        inst.Kind,
			Name:        inst.Name,
			StopCommand: stopCommand,
			StopMode:    stopMode,
		})
		if loopErr == nil {
			if i > 0 {
				log.Printf("StopActionHandler: edge install stop succeeded on attempt %d for instance %d (stopCommand=%q stopMode=%q)", i+1, id, stopCommand, stopMode)
			}
			break
		}
		log.Printf("StopActionHandler: edge install stop failed on attempt %d for instance %d (stopCommand=%q stopMode=%q): %v", i+1, id, stopCommand, stopMode, loopErr)
		// If this isn't the last attempt, wait a bit before retrying
		if i < 2 {
			time.Sleep(time.Second)
		}
	}
	if loopErr != nil {
		// Don't surface a 502 to the operator for an action Stop — the
		// edge's install/stop is best-effort cleanup (the workflow may
		// already have finished, the container may already be torn down,
		// or the edge may be temporarily unreachable). The operator's
		// goal is "make this action stop running"; whether the edge
		// confirmed the cancel cleanly or we just gave up and cleared the
		// row state, the user-visible outcome is the same: the ActionsCard
		// button flips back to its invoke label on the next reload.
		//
		// Log the underlying edge error for ops visibility, but answer the
		// SPA with a 200 carrying edge_state="edge_unreachable" so the
		// UI doesn't pop a red "Action failed: Request failed with status
		// code 502" banner for what is functionally a successful stop.
		log.Printf("StopActionHandler: edge install stop unreachable for instance %d after 3 retries (treat as success): %v", id, loopErr)
		_ = instRepo.SetInstallActionID(id, "")
		writeJSON(w, map[string]any{
			"id":           id,
			"action_id":    clickedActionID,
			"edge_state":   "edge_unreachable",
			"exit_code":    -1,
			"stdout":       "",
			"stderr":       loopErr.Error(),
			"stop_command": stopCommand,
			"warning":      "edge did not confirm stop after 3 retries: " + loopErr.Error(),
		})
		return
	}

	// Clear install_action_id immediately so the home-page button morphs
	// back to its invoke label without waiting on the sweep loop's tick.
	// install_state stays 'running' until the sweep loop sees the edge's
	// done/cancelled state and applies the completion policy — same as a
	// naturally-finishing action.
	_ = instRepo.SetInstallActionID(id, "")

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryInstance,
		Action:      "stop_action",
		TargetID:    &id,
		TargetLabel: inst.Name,
		Message:     fmt.Sprintf("stopped action %q on instance %q (%s)", clickedActionID, inst.Name, inst.Kind),
	})

	writeJSON(w, map[string]any{
		"id":           id,
		"action_id":    clickedActionID,
		"edge_state":   resp.State,
		"exit_code":    resp.ExitCode,
		"stdout":       resp.Stdout,
		"stderr":       resp.Stderr,
		"stop_command": stopCommand,
	})
}
