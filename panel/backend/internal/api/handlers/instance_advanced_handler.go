// Package handlers: instance_advanced_handler.go owns the per-instance
// Secrets, Automation, Snapshots, Processes, Metrics, Ports and Audit
// endpoints. All routes are gated by VIEW_INSTANCES (set in server.go) so
// any user that can see an instance can manage its env/automation.

package handlers

import (
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
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
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

func ListAutomationHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "automation") {
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
	jobs, err := repository.NewAutomationRepository(con).ListByInstance(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, jobs)
}

type automationUpsertRequest struct {
	Name       string   `json:"name"`
	Command    string   `json:"command"`
	Schedule   string   `json:"schedule"`
	Enabled    bool     `json:"enabled"`
	SecretRefs []string `json:"secret_refs"`
	TimeoutSec int      `json:"timeout_sec"`
}

func CreateAutomationHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "automation") {
		return
	}
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
	if req.Name == "" || req.Command == "" {
		http.Error(w, "name and command are required", http.StatusBadRequest)
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
	repo := repository.NewAutomationRepository(con)
	jobID, err := repo.Create(repository.AutomationUpsertInput{
		InstanceID: id, Name: req.Name, Command: req.Command, Schedule: req.Schedule,
		Enabled: req.Enabled, SecretRefs: req.SecretRefs, TimeoutSec: req.TimeoutSec,
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
	auditInst(r, id, "automation.create", fmt.Sprintf("created job %q (%s)", req.Name, scheduleLabel(req.Schedule)))
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": jobID})
}

func UpdateAutomationHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "automation") {
		return
	}
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
	if req.Name == "" || req.Command == "" {
		http.Error(w, "name and command are required", http.StatusBadRequest)
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
	if err := repo.Update(jobID, repository.AutomationUpsertInput{
		InstanceID: id, Name: req.Name, Command: req.Command, Schedule: req.Schedule,
		Enabled: req.Enabled, SecretRefs: req.SecretRefs, TimeoutSec: req.TimeoutSec,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Schedule != "" && req.Enabled {
		_ = repo.ScheduleNext(jobID, cronNext(req.Schedule, time.Now()))
	}
	auditInst(r, id, "automation.update", fmt.Sprintf("updated job %q", req.Name))
	w.WriteHeader(http.StatusNoContent)
}

func DeleteAutomationHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "automation") {
		return
	}
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
	if err := repository.NewAutomationRepository(con).Delete(jobID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	auditInst(r, id, "automation.delete", fmt.Sprintf("deleted job #%d", jobID))
	w.WriteHeader(http.StatusNoContent)
}

func ListAutomationRunsHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "automation") {
		return
	}
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
	if !guardInstancePage(w, r, "automation") {
		return
	}
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
	inst, _, name, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	// Resolve secrets.
	keys, vals, _ := repository.NewSecretRepository(con).ResolvedEnv(id, job.SecretRefs)
	env := map[string]string{}
	for i := range keys {
		env[keys[i]] = vals[i]
	}
	// Use a timeout-aware client so long-running jobs (up to 30 min) don't get
	// cut off by the default 30 s panel dial timeout.
	timeout := job.TimeoutSec
	if timeout <= 0 {
		timeout = 300
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
	ec2 := edge.NewWithTimeout(*node, token, time.Duration(timeout+10)*time.Second)
	started := time.Now()
	resp, execErr := ec2.Exec(edge.ExecRequest{
		Kind: inst.Kind, Name: name, Command: job.Command, Env: env, TimeoutSec: job.TimeoutSec,
	})
	finished := time.Now()
	exitCode := resp.ExitCode
	errMsg := ""
	stdout := resp.Stdout
	stderr := resp.Stderr
	if execErr != nil {
		errMsg = execErr.Error()
		exitCode = -1
	}
	runID, _ := repo.RecordRun(repository.AutomationRunInput{
		JobID: job.ID, InstanceID: id, Trigger: string(models.AutomationTriggerManual),
		Command: job.Command, Stdout: stdout, Stderr: stderr, ExitCode: exitCode,
		DurationMS: finished.Sub(started).Milliseconds(), Error: errMsg,
		StartedAt: started, FinishedAt: finished,
	})
	auditInst(r, id, "automation.run", fmt.Sprintf("manually fired %q (exit=%d)", job.Name, exitCode))
	writeJSON(w, map[string]any{
		"run_id":      runID,
		"exit_code":   exitCode,
		"duration_ms": finished.Sub(started).Milliseconds(),
		"stdout":      stdout,
		"stderr":      stderr,
		"error":       errMsg,
	})
}

// cronNext returns the next due time for an expression, or zero-time on parse
// failure (the panel then leaves next_run_at NULL → on-demand only).
func cronNext(schedule string, from time.Time) time.Time {
	s, err := cron.Parse(schedule)
	if err != nil {
		return time.Time{}
	}
	return s.Next(from)
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
