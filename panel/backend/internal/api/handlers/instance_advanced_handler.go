// Package handlers: instance_advanced_handler.go owns the per-instance
// Secrets, Automation, Snapshots, Processes, Metrics, Ports and Audit
// endpoints. All routes are gated by VIEW_INSTANCES (set in server.go) so
// any user that can see an instance can manage its env/automation.

package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/example/kspanel/internal/cron"
	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ---------------- shared helpers -------------------------------------------

// loadInstNode returns the instance row + owned edge client + the workload
// name the edge knows. Errors are surfaced as the same structured JSON the
// deploy handler emits so the SPA banner is consistent. Returns ok=false
// (and writes) on failure.
func loadInstNode(w http.ResponseWriter, r *http.Request) (inst *models.Instance, ec *edge.Client, workloadName string, ok bool) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"error": "invalid instance id"})
		return nil, nil, "", false
	}
	con, err := repository.OpenDB()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{"error": "server error"})
		return nil, nil, "", false
	}
	defer con.Close()
	instRepo := repository.NewInstanceRepository(con)
	nodeRepo := repository.NewNodeRepository(con)
	inst, err = instRepo.Get(id)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]any{"error": "instance not found"})
		return nil, nil, "", false
	}
	// Ownership scope: Own without All may only reach own instances.
	// Fail closed on checker errors so a DB blip never opens another owner's instance.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, serr := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if serr != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]any{"error": "forbidden"})
			return nil, nil, "", false
		}
		if !hasAll && hasOwn && inst.OwnerID != uid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]any{"error": "forbidden"})
			return nil, nil, "", false
		}
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]any{"error": "owner node not found"})
		return nil, nil, "", false
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]any{"error": "node has no usable edge token", "hint": "rotate the token first"})
		return nil, nil, "", false
	}
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	return inst, edge.New(*node, token), name, true
}

// auditInst writes a per-instance audit row + a global activity row. Used by
// every mutating instance_advanced endpoint so the per-instance Audit page
// mirrors the global feed.
func auditInst(r *http.Request, instanceID int64, action, detail string) {
	con, err := repository.OpenDB()
	if err != nil {
		return
	}
	defer con.Close()
	repository.NewInstanceAuditRepository(con).Append(repository.AuditInput{
		InstanceID: instanceID, Actor: auditActor(r), Action: action, Detail: detail,
	})
	_ = auditActor
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: action,
		TargetID: &instanceID, Message: detail,
	})
}

// auditActor resolves the calling user's username for the per-instance audit
// row. Falls back to "system" when none can be resolved (e.g. a scheduled
// run).
func auditActor(r *http.Request) string {
	if u, _, ok := currentUserFromContext(r.Context()); ok && u != nil {
		return u.Username
	}
	uid, err := UserIDFromContext(r)
	if err != nil || uid == 0 {
		return "system"
	}
	name, _, _ := loadActorUser(r, uid)
	if name == "" {
		return "system"
	}
	return name
}

// ============================================================================
// SECRETS / ENV
// ============================================================================

func ListSecretsHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "env") {
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
	secs, err := repository.NewSecretRepository(con).ListByInstance(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, secs)
}

type secretUpsertRequest struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsSecret    bool   `json:"is_secret"`
	Description string `json:"description"`
}

func SetSecretHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "env") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var req secretUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if _, err := repository.NewSecretRepository(con).Set(id, req.Key, req.Value, req.IsSecret, req.Description); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	auditInst(r, id, "secret.set", fmt.Sprintf("set %q (%s)", req.Key, secretType(req.IsSecret)))
	writeJSONStatus(w, http.StatusOK, map[string]any{"ok": true})
}

func RevealSecretHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "env") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	key := chi.URLParam(r, "key")
	if key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	val, err := repository.NewSecretRepository(con).Reveal(id, key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	auditInst(r, id, "secret.reveal", fmt.Sprintf("revealed %q", key))
	writeJSON(w, map[string]any{"key": key, "value": val})
}

type secretDeleteResponse struct{}

func DeleteSecretHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "env") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	key := chi.URLParam(r, "key")
	if key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if err := repository.NewSecretRepository(con).Delete(id, key); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	auditInst(r, id, "secret.delete", fmt.Sprintf("deleted %q", key))
	w.WriteHeader(http.StatusNoContent)
}

// secretType is a tiny label helper for audit messages.
func secretType(isSecret bool) string {
	if isSecret {
		return "secret"
	}
	return "env"
}

// ============================================================================
// AUTOMATION
// ============================================================================
// Automation is a self-sufficient builtin like Files / Terminal / Ports: no
// spec.pages whitelist gate (auth + permission gates at registration still
// apply). Visibility + read-only mode are enforced by the SPA's Instance
// Controls shortcut (floating menu + native page).

func ListAutomationHandler(w http.ResponseWriter, r *http.Request) {
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
	jobs, err := repository.NewAutomationRepository(con).ListByInstance(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, jobs)
}

type automationStepRequest struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Command    string `json:"command"`
	Payload    string `json:"payload"`
	If         string `json:"if"`
	TimeoutSec int    `json:"timeout_sec"`
}

type automationUpsertRequest struct {
	Name       string                  `json:"name"`
	Command    string                  `json:"command"`
	Kind       string                  `json:"kind"`
	Payload    string                  `json:"payload"`
	Schedule   string                  `json:"schedule"`
	Enabled    bool                    `json:"enabled"`
	SecretRefs []string                `json:"secret_refs"`
	TimeoutSec int                     `json:"timeout_sec"`
	Steps      []automationStepRequest `json:"steps"`
}

// validateAutomationUpsert enforces the per-kind payload shape and the
// instance's automation kind toggles (shortcuts.automation allow_shell /
// allow_power / allow_actions, allow-all default). Action jobs additionally
// resolve their action ID against the owning template so a typo fails fast
// at write time instead of when the scheduler fires. The template timeout
// ceiling (shortcuts.automation.max_timeout_sec, default 1800) caps both
// the job timeout and every step timeout: config >= user passes, config <
// user is rejected. Enabling a job counts against the template's
// max_active_jobs cap (0 = unlimited). Steps are validated with the same
// per-kind rules. excludeJobID skips one job in the active count (the row
// being updated, so re-saving an enabled job at the cap still passes).
// Returns the normalized kind + instance row, or an HTTP status + message
// for the caller to write.
func validateAutomationUpsert(con *sql.DB, instanceID int64, req automationUpsertRequest, excludeJobID int64) (string, int, string) {
	kind := models.NormalizeAutomationKind(req.Kind)
	hasSteps := len(req.Steps) > 0
	switch kind {
	case models.AutomationKindPower:
		// With steps the plan carries the ops (top payload is display
		// fallback); without steps a valid op is required.
		if req.Payload == "" && !hasSteps {
			return "", http.StatusBadRequest, "invalid power op (want start|stop|restart|kill)"
		}
		if req.Payload != "" && !models.IsAutomationPowerOp(req.Payload) {
			return "", http.StatusBadRequest, "invalid power op (want start|stop|restart|kill)"
		}
	case models.AutomationKindAction:
		if req.Payload == "" && !hasSteps {
			return "", http.StatusBadRequest, "action id is required for action jobs"
		}
	default:
		if req.Command == "" && !hasSteps {
			return "", http.StatusBadRequest, "command is required for shell jobs"
		}
	}
	inst, err := repository.NewInstanceRepository(con).Get(instanceID)
	if err != nil {
		return "", http.StatusNotFound, "instance not found"
	}
	if !automationKindAllowed(inst.Config, kind) {
		return "", http.StatusForbidden, "template disallows automation " + kind + " jobs for this instance"
	}
	maxTimeout := automationMaxTimeoutSec(inst.Config)
	if req.TimeoutSec > maxTimeout {
		return "", http.StatusBadRequest, fmt.Sprintf("timeout %ds exceeds template maximum %ds", req.TimeoutSec, maxTimeout)
	}
	// Active-jobs gate: an enabled job owns its schedule timer, so enabling
	// past the template's max_active_jobs cap is rejected. Re-saving an
	// already-enabled job (or saving disabled) never trips it.
	if req.Enabled {
		if maxActive := AutomationMaxActiveJobs(inst.Config); maxActive > 0 {
			jobs, lerr := repository.NewAutomationRepository(con).ListByInstance(instanceID)
			if lerr != nil {
				return "", http.StatusInternalServerError, "server error"
			}
			active := 0
			for i := range jobs {
				if jobs[i].Enabled && jobs[i].ID != excludeJobID {
					active++
				}
			}
			if active >= maxActive {
				return "", http.StatusBadRequest, fmt.Sprintf("too many active jobs (template maximum %d)", maxActive)
			}
		}
	}
	// Steps: normalise + per-step kind/toggle/timeout/shape checks.
	if len(req.Steps) > repository.MaxAutomationSteps {
		return "", http.StatusBadRequest, fmt.Sprintf("too many steps (max %d)", repository.MaxAutomationSteps)
	}
	var actionIDs []string
	if kind == models.AutomationKindAction && req.Payload != "" {
		actionIDs = append(actionIDs, req.Payload)
	}
	for i := range req.Steps {
		st := &req.Steps[i]
		sk := models.NormalizeAutomationKind(st.Kind)
		st.Kind = sk
		st.If = models.NormalizeAutomationIf(st.If)
		if !automationKindAllowed(inst.Config, sk) {
			return "", http.StatusForbidden, fmt.Sprintf("template disallows automation %s jobs for this instance (step %d)", sk, i+1)
		}
		switch sk {
		case models.AutomationKindPower:
			if !models.IsAutomationPowerOp(st.Payload) {
				return "", http.StatusBadRequest, fmt.Sprintf("step %d: invalid power op (want start|stop|restart|kill)", i+1)
			}
		case models.AutomationKindAction:
			if st.Payload == "" {
				return "", http.StatusBadRequest, fmt.Sprintf("step %d: action id is required for action steps", i+1)
			}
			actionIDs = append(actionIDs, st.Payload)
		default:
			if st.Command == "" {
				return "", http.StatusBadRequest, fmt.Sprintf("step %d: command is required for shell steps", i+1)
			}
		}
		if st.TimeoutSec > maxTimeout {
			return "", http.StatusBadRequest, fmt.Sprintf("step %d: timeout %ds exceeds template maximum %ds", i+1, st.TimeoutSec, maxTimeout)
		}
	}
	if kind == models.AutomationKindAction || len(actionIDs) > 0 {
		tmpl, err := repository.NewTemplateRepository(con).Get(inst.TemplateID)
		if err != nil {
			return "", http.StatusBadRequest, "owning template not found (deleted?)"
		}
		var spec struct {
			Actions []templateActionSpec `json:"actions"`
		}
		if err := json.Unmarshal([]byte(tmpl.Spec), &spec); err != nil {
			return "", http.StatusInternalServerError, "template spec is not valid JSON"
		}
		valid := map[string]bool{}
		for i := range spec.Actions {
			if len(spec.Actions[i].Steps) > 0 {
				valid[spec.Actions[i].ID] = true
			}
		}
		if kind == models.AutomationKindAction && req.Payload != "" && !valid[req.Payload] {
			return "", http.StatusBadRequest, "action not found in template: " + req.Payload
		}
		for _, aid := range actionIDs {
			if kind == models.AutomationKindAction && aid == req.Payload {
				continue
			}
			if !valid[aid] {
				return "", http.StatusBadRequest, "action not found in template: " + aid
			}
		}
	}
	return kind, 0, ""
}

func automationStepsToModel(in []automationStepRequest) []models.AutomationStep {
	if len(in) == 0 {
		return nil
	}
	out := make([]models.AutomationStep, 0, len(in))
	for _, st := range in {
		out = append(out, models.AutomationStep{
			Name:       st.Name,
			Kind:       models.NormalizeAutomationKind(st.Kind),
			Command:    st.Command,
			Payload:    st.Payload,
			If:         models.NormalizeAutomationIf(st.If),
			TimeoutSec: st.TimeoutSec,
		})
	}
	return out
}

func CreateAutomationHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var req automationUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	// Validate cron expression up front — a bad schedule would silently never
	// fire. Empty schedule (on-demand) is allowed.
	if req.Schedule != "" {
		if _, err := cron.Parse(req.Schedule); err != nil {
			http.Error(w, "invalid schedule: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// Per-kind payload shape + automation kind toggles (+ template action
	// resolution for action jobs). New rows exclude nothing (0).
	kind, st, msg := validateAutomationUpsert(con, id, req, 0)
	if st != 0 {
		http.Error(w, msg, st)
		return
	}
	repo := repository.NewAutomationRepository(con)
	jobID, err := repo.Create(repository.AutomationUpsertInput{
		InstanceID: id, Name: req.Name, Command: req.Command, Kind: kind, Payload: req.Payload,
		Schedule: req.Schedule, Enabled: req.Enabled, SecretRefs: req.SecretRefs, TimeoutSec: req.TimeoutSec,
		Steps: automationStepsToModel(req.Steps),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Pre-arm next_run_at so the scheduler picks it up on the next minute.
	if req.Schedule != "" && req.Enabled {
		next := cronNext(req.Schedule, time.Now())
		_ = repo.ScheduleNext(jobID, next)
	}
	auditInst(r, id, "automation.create", fmt.Sprintf("created %s job %q (%s)", kind, req.Name, scheduleLabel(req.Schedule)))
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": jobID})
}

func UpdateAutomationHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	jobID, err := strconv.ParseInt(chi.URLParam(r, "job_id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}
	var req automationUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Schedule != "" {
		if _, err := cron.Parse(req.Schedule); err != nil {
			http.Error(w, "invalid schedule: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewAutomationRepository(con)
	// Bind the job to the URL instance: without this an operator with
	// access to instance A could overwrite a job on instance B by guessing
	// its job_id (the scheduler would then run attacker-controlled command
	// on the victim workload).
	if existing, gerr := repo.Get(jobID); gerr != nil || existing.InstanceID != id {
		http.Error(w, "automation not found", http.StatusNotFound)
		return
	}
	// Per-kind payload shape + automation kind toggles (+ template action
	// resolution for action jobs). The job itself is excluded from the
	// active-jobs count so re-saving an enabled job at the cap passes.
	kind, st, msg := validateAutomationUpsert(con, id, req, jobID)
	if st != 0 {
		http.Error(w, msg, st)
		return
	}
	if err := repo.Update(jobID, repository.AutomationUpsertInput{
		InstanceID: id, Name: req.Name, Command: req.Command, Kind: kind, Payload: req.Payload,
		Schedule: req.Schedule, Enabled: req.Enabled, SecretRefs: req.SecretRefs, TimeoutSec: req.TimeoutSec,
		Steps: automationStepsToModel(req.Steps),
	}); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Schedule != "" && req.Enabled {
		_ = repo.ScheduleNext(jobID, cronNext(req.Schedule, time.Now()))
	}
	auditInst(r, id, "automation.update", fmt.Sprintf("updated %s job %q", kind, req.Name))
	w.WriteHeader(http.StatusNoContent)
}

func DeleteAutomationHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	jobID, err := strconv.ParseInt(chi.URLParam(r, "job_id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repoDel := repository.NewAutomationRepository(con)
	if existing, gerr := repoDel.Get(jobID); gerr != nil || existing.InstanceID != id {
		http.Error(w, "automation not found", http.StatusNotFound)
		return
	}
	if err := repoDel.Delete(jobID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	auditInst(r, id, "automation.delete", fmt.Sprintf("deleted job #%d", jobID))
	w.WriteHeader(http.StatusNoContent)
}

func ListAutomationRunsHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	dbCon, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer dbCon.Close()
	repo := repository.NewAutomationRepository(dbCon)
	runs, err := repo.ListRunsByInstance(id, limit)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, runs)
}

// TriggerRunHandler fires a job on demand and returns the captured run.
func TriggerRunHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	jobID, err := strconv.ParseInt(chi.URLParam(r, "job_id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewAutomationRepository(con)
	job, err := repo.Get(jobID)
	if err != nil || job.InstanceID != id {
		http.Error(w, "automation not found", http.StatusNotFound)
		return
	}
	if suspended, until, _ := repository.NewInstanceRepository(con).IsInstanceSuspended(id); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}
	inst, _, _, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	nodeRepo := repository.NewNodeRepository(con)
	node, nerr := nodeRepo.GetNode(inst.NodeID)
	if nerr != nil {
		http.Error(w, "owner node not found", http.StatusBadGateway)
		return
	}
	token, terr := nodeRepo.PlainToken(inst.NodeID)
	if terr != nil || token == "" {
		http.Error(w, "node has no usable edge token", http.StatusBadGateway)
		return
	}
	// Dispatch per job kind through the shared executor (same semantics as
	// the scheduler sweep: shell runs to completion, power issues a
	// lifecycle op, action invokes the template workflow).
	res, derr := FireAutomationJob(AutomationFireCtx{
		Ctx: r.Context(), Con: con, Inst: inst, Node: node, Token: token, Job: *job, Actor: auditActor(r),
	})
	if derr != nil {
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": derr.Error()})
		return
	}
	runID, _ := repo.RecordRun(repository.AutomationRunInput{
		JobID: job.ID, InstanceID: id, Trigger: string(models.AutomationTriggerManual),
		Command: res.RunCommand, Stdout: res.Stdout, Stderr: res.Stderr, ExitCode: res.ExitCode,
		DurationMS: res.DurationMS, Error: res.Error,
		StartedAt: time.Now(), FinishedAt: time.Now(),
	})
	auditInst(r, id, "automation.run", fmt.Sprintf("manually fired %q (exit=%d)", job.Name, res.ExitCode))
	writeJSON(w, map[string]any{
		"run_id":      runID,
		"exit_code":   res.ExitCode,
		"duration_ms": res.DurationMS,
		"stdout":      res.Stdout,
		"stderr":      res.Stderr,
		"error":       res.Error,
	})
}

// cronNext returns the next due time for an expression. Empty schedule is
// on-demand (zero-time → next_run_at NULL). Parse failure or a schedule
// that never occurs (e.g. Feb 30) parks far in the future instead of zero
// — MarkRan/ScheduleNext persist zero as year-1, which Due matches on
// every tick (per-minute refire loop). Mirrors scheduler.nextRun.
func cronNext(schedule string, from time.Time) time.Time {
	if schedule == "" {
		return time.Time{}
	}
	s, err := cron.Parse(schedule)
	if err != nil {
		return from.AddDate(100, 0, 0)
	}
	if n := s.Next(from); !n.IsZero() {
		return n
	}
	return from.AddDate(100, 0, 0)
}

// scheduleLabel renders a friendly readout of a cron expression for audit
// messages.
func scheduleLabel(s string) string {
	if s == "" {
		return "on-demand"
	}
	return "cron " + s
}

// guard against accidental import drop.
var _ = models.AutomationTriggerManual
