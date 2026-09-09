package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// automation_exec.go owns the per-kind execution of automation jobs. Shell
// jobs exec a command on the owning edge; power jobs issue lifecycle ops on
// the instance itself; action jobs invoke a template action by ID. Both fire
// paths — the scheduler sweep (trigger schedule) and TriggerRunHandler
// (trigger manual) — dispatch through fireAutomationJob so the kind
// semantics and the template-controls gating stay identical everywhere.
//
// Recording (run rows, audit, next_run_at re-arm) stays with the callers:
// the scheduler truncates output and the manual endpoint echoes it back, and
// neither contract changes here.

// automationFireCtx bundles everything fireAutomationJob needs. Node + Token
// are resolved by the caller (both already dial the edge for shell jobs);
// Inst must be the fresh row (status + install_state drive guards).
type automationFireCtx struct {
	Con     *sql.DB
	Inst    *models.Instance
	Node    interface{} // unused; kept for forward-compat (node travels via NodeVal)
	NodeVal repository.NodeRow
	Token   string
	Job     models.Automation
	Actor   string
}

// AutomationFireResult is the outcome of one job fire. Error is empty on
// success; a non-empty Error still yields a recorded run row (only
// automationDenied skips recording).
type AutomationFireResult struct {
	RunCommand string
	Stdout     string
	Stderr     string
	ExitCode   int
	DurationMS int64
	Error      string
}

// automationDenied means the fire was refused by the instance's template
// controls (kind toggle or op/action allow-list). Callers must NOT record a
// run row: the scheduler re-arms silently (like a suspended instance) and
// the manual endpoint answers 403.
type automationDenied struct{ msg string }

func (e automationDenied) Error() string { return e.msg }

// automationKindAllowed reports whether the instance's controls snapshot
// permits jobs of this kind. Absent/garbled blocks allow all (backward
// compatible with pre-toggle snapshots, mirroring resolveInstanceControls).
func automationKindAllowed(configJSON, kind string) bool {
	key := map[string]string{
		models.AutomationKindPower:  "allow_power",
		models.AutomationKindAction: "allow_actions",
	}[kind]
	if key == "" {
		key = "allow_shell"
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(configJSON), &root); err != nil {
		return true
	}
	ic, _ := root["instance_controls"].(map[string]any)
	shortcuts, _ := ic["shortcuts"].(map[string]any)
	auto, _ := shortcuts["automation"].(map[string]any)
	if auto == nil {
		return true
	}
	if v, ok := auto[key].(bool); ok {
		return v
	}
	return true
}

// fireAutomationJob executes one job fire per its kind. Shell and power run
// to completion; action jobs invoke the template workflow (async — the run
// row is the invocation receipt, progress is tracked via install_state).
func fireAutomationJob(ctx context.Context, fctx automationFireCtx) (AutomationFireResult, error) {
	job := models.Automation{
		ID: jobIDOf(fctx), InstanceID: fctx.Inst.ID, Name: fctx.Job.Name,
		Command: fctx.Job.Command, Kind: fctx.Job.Kind, Payload: fctx.Job.Payload,
		Schedule: fctx.Job.Schedule, Enabled: fctx.Job.Enabled,
		SecretRefs: fctx.Job.SecretRefs, TimeoutSec: fctx.Job.TimeoutSec,
	}
	_ = job
	return fireAutomationJobInner(ctx, fctx)
}

func jobIDOf(fctx automationFireCtx) int64 { return fctx.Job.ID }

// fireAutomationJobInner holds the dispatch so the wrapper above stays a
// readable contract point.
func fireAutomationJobInner(ctx context.Context, fctx automationFireCtx) (AutomationFireResult, error) {
	job := fctx.Job
	kind := models.NormalizeAutomationKind(job.Kind)
	if !automationKindAllowed(fctx.Inst.Config, kind) {
		return AutomationFireResult{}, automationDenied{fmt.Sprintf("forbidden: template disallows automation %s jobs for this instance", kind)}
	}
	switch kind {
	case models.AutomationKindPower:
		return firePowerJob(fctx, job.Payload)
	case models.AutomationKindAction:
		return fireActionJob(fctx, job.Payload)
	default:
		return fireShellJob(ctx, fctx)
	}
}

// fireShellJob is the original automation behaviour: exec Command on the
// owning edge with the job's secret env.
func fireShellJob(ctx context.Context, fctx automationFireCtx) (AutomationFireResult, error) {
	job, inst := fctx.Job, fctx.Inst
	con := fctx.Con
	keys, vals, _ := repository.NewSecretRepository(con).ResolvedEnv(job.InstanceID, job.SecretRefs)
	env := map[string]string{}
	for i := range keys {
		env[keys[i]] = vals[i]
	}
	timeout := job.TimeoutSec
	if timeout <= 0 {
		timeout = 300
	}
	nodeRepo := repository.NewNodeRepository(con)
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		return AutomationFireResult{}, fmt.Errorf("owner node not found: %w", err)
	}
	ec := edge.NewWithTimeout(*node, fctx.Token, time.Duration(timeout+10)*time.Second)
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	started := time.Now()
	callCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout+10)*time.Second)
	defer cancel()
	resp, execErr := ec.ExecCtx(callCtx, edge.ExecRequest{
		Kind: inst.Kind, Name: name, Command: job.Command, Env: env, TimeoutSec: job.TimeoutSec,
	})
	finished := time.Now()
	res := AutomationFireResult{
		RunCommand: job.Command,
		Stdout:     resp.Stdout,
		Stderr:     resp.Stderr,
		ExitCode:   resp.ExitCode,
		DurationMS: finished.Sub(started).Milliseconds(),
	}
	if execErr != nil {
		res.Error = execErr.Error()
		res.ExitCode = -1
	}
	return res, nil
}
