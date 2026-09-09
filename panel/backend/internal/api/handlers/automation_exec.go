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
// Resolution (instance/node/token/suspension) and recording (run rows,
// audit, next_run_at re-arm) stay with the callers, whose contracts do not
// change here: only the execution itself is shared.

// automationFireCtx bundles the resolved pieces fireAutomationJob needs.
// Inst must be the fresh row (status + install_state drive guards).
type automationFireCtx struct {
	Ctx   context.Context
	Con   *sql.DB
	Inst  *models.Instance
	Node  *models.Node
	Token string
	Job   models.Automation
	Actor string
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

// powerControlKey maps a power op to its instance-controls gate, mirroring
// instanceAction (start/stop/kill) and RestartInstanceHandler (restart).
func powerControlKey(op string) string {
	switch op {
	case "start":
		return "allow_start"
	case "stop":
		return "allow_stop"
	case "restart":
		return "allow_restart"
	case "kill":
		return "allow_kill"
	default:
		return ""
	}
}

// fireAutomationJob executes one job fire per its kind. Shell and power run
// to completion; action jobs invoke the template workflow (async — the run
// row is the invocation receipt, progress is tracked via install_state).
func fireAutomationJob(fctx automationFireCtx) (AutomationFireResult, error) {
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
		return fireShellJob(fctx)
	}
}

// fireShellJob is the original automation behaviour: exec Command on the
// owning edge with the job's secret env.
func fireShellJob(fctx automationFireCtx) (AutomationFireResult, error) {
	job, inst := fctx.Job, fctx.Inst
	keys, vals, _ := repository.NewSecretRepository(fctx.Con).ResolvedEnv(job.InstanceID, job.SecretRefs)
	env := map[string]string{}
	for i := range keys {
		env[keys[i]] = vals[i]
	}
	timeout := job.TimeoutSec
	if timeout <= 0 {
		timeout = 300
	}
	ec := edge.NewWithTimeout(*fctx.Node, fctx.Token, time.Duration(timeout+10)*time.Second)
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	started := time.Now()
	callCtx, cancel := context.WithTimeout(fctx.Ctx, time.Duration(timeout+10)*time.Second)
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

// firePowerJob issues a lifecycle op on the instance itself, mirroring
// instanceAction (start/stop/kill: 3x retry, edge-status mirroring, SFTP
// heal on start, post hook) and RestartInstanceHandler (restart = stop then
// start; transitional creating/installing rows refuse). Pre-mod hooks are
// skipped: there is no request to veto with on the scheduler path, and the
// manual path goes through the same executor.
func firePowerJob(fctx automationFireCtx, op string) (AutomationFireResult, error) {
	inst := fctx.Inst
	instRepo := repository.NewInstanceRepository(fctx.Con)
	if !models.IsAutomationPowerOp(op) {
		return AutomationFireResult{}, automationDenied{fmt.Sprintf("forbidden: unknown power op %q", op)}
	}
	// Template allow-list for the op itself (same keys the power buttons
	// enforce, so a job can never do what its own menu forbids).
	if key := powerControlKey(op); key != "" && !instanceControlsAllow(inst.Config, key) {
		return AutomationFireResult{}, automationDenied{fmt.Sprintf("forbidden: template disallows %s for this instance", op)}
	}
	// A deploy in flight owns the row — power ops over creating/installing
	// race it (same rule RestartInstanceHandler enforces for restart).
	if inst.Status == "creating" || inst.Status == "installing" {
		return AutomationFireResult{
			RunCommand: "power:" + op,
			ExitCode:   -1,
			Error:      fmt.Sprintf("instance is %q — wait for the deploy to finish", inst.Status),
		}, nil
	}
	ec := edge.NewWithTimeout(*fctx.Node, fctx.Token, 60*time.Second)
	lifecycle := func(action string) (edge.LifecycleResponse, error) {
		var resp edge.LifecycleResponse
		var lastErr error
		for i := 0; i < 3; i++ {
			resp, lastErr = ec.Lifecycle(edge.LifecycleRequest{
				Action: action,
				Kind:   inst.Kind,
				Name:   inst.Name,
			})
			if lastErr == nil {
				break
			}
			log.Printf("firePowerJob: edge lifecycle %s failed on attempt %d for instance %d: %v", action, i+1, inst.ID, lastErr)
			if i < 2 {
				time.Sleep(time.Second)
			}
		}
		return resp, lastErr
	}
	started := time.Now()
	finish := func(status string, errMsg string) (AutomationFireResult, error) {
		finished := time.Now()
		exitCode := 0
		if errMsg != "" {
			exitCode = -1
		}
		return AutomationFireResult{
			RunCommand: "power:" + op,
			Stdout:     status,
			ExitCode:   exitCode,
			DurationMS: finished.Sub(started).Milliseconds(),
			Error:      errMsg,
		}, nil
	}
	if op == "restart" {
		if _, err := lifecycle("stop"); err != nil {
			_ = instRepo.SetStatus(inst.ID, "errored", inst.ExternalID, err.Error())
			return finish("", "edge rejected restart/stop: "+err.Error())
		}
		resp, err := lifecycle("start")
		if err != nil {
			_ = instRepo.SetStatus(inst.ID, "errored", inst.ExternalID, err.Error())
			return finish("", "edge rejected restart/start: "+err.Error())
		}
		status := resp.Status
		if status == "" {
			status = "running"
		}
		_ = instRepo.SetStatus(inst.ID, status, inst.ExternalID, "")
		emitInstancePost("restart", inst.ID, inst)
		return finish(status, "")
	}
	resp, err := lifecycle(op)
	if err != nil {
		_ = instRepo.SetStatus(inst.ID, "errored", inst.ExternalID, err.Error())
		return finish("", "edge rejected "+op+": "+err.Error())
	}
	status := resp.Status
	if status == "" {
		status = op + "ed" // "started" / "stopped" — best-effort fallback
	}
	_ = instRepo.SetStatus(inst.ID, status, inst.ExternalID, "")
	// A start heals SFTP after an edge restart (same best-effort re-push
	// instanceAction performs).
	if op == "start" {
		if fresh, gerr := instRepo.Get(inst.ID); gerr == nil && fresh != nil {
			_ = ProvisionSFTPForInstance(fctx.Con, fresh)
		}
	}
	emitInstancePost(op, inst.ID, inst)
	return finish(status, "")
}

// fireActionJob invokes a template action by ID through the same core the
// Actions UI uses. Invocation is async: the edge workflow keeps running
// after InstallStart returns, so the run row is the invocation receipt
// (progress is tracked via install_state, not by polling here).
func fireActionJob(fctx automationFireCtx, actionID string) (AutomationFireResult, error) {
	inst := fctx.Inst
	if !instanceControlsAllow(inst.Config, "allow_template_actions") {
		return AutomationFireResult{}, automationDenied{"forbidden: template disallows template actions for this instance"}
	}
	// Never overlap an in-flight install workflow (same rule
	// InvokeActionHandler enforces with 409).
	if inst.InstallState == "running" {
		return AutomationFireResult{
			RunCommand: "action:" + actionID,
			ExitCode:   -1,
			Error:      "install or action already in progress on this instance",
		}, nil
	}
	started := time.Now()
	actionName, serr := startTemplateAction(fctx.Con, inst, actionID)
	finished := time.Now()
	res := AutomationFireResult{
		RunCommand: "action:" + actionID,
		DurationMS: finished.Sub(started).Milliseconds(),
	}
	if serr != nil {
		res.ExitCode = -1
		if ase, ok := serr.(actionStartError); ok {
			res.Error = ase.msg
		} else {
			res.Error = serr.Error()
		}
		return res, nil
	}
	res.Stdout = fmt.Sprintf("invoked action %q (workflow running, track via install_state)", actionName)
	return res, nil
}
