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
	"github.com/example/kspanel/internal/specyaml"
)

// automation_exec.go owns the per-kind execution of automation jobs. Shell
// jobs exec a command on the owning edge; power jobs issue lifecycle ops on
// the instance itself; action jobs invoke a template action by ID. Both fire
// paths — the scheduler sweep (trigger schedule) and TriggerRunHandler
// (trigger manual) — dispatch through FireAutomationJob so the kind
// semantics and the template-controls gating stay identical everywhere.
//
// Resolution (instance/node/token/suspension) and recording (run rows,
// audit, next_run_at re-arm) stay with the callers, whose contracts do not
// change here: only the execution itself is shared.

// AutomationFireCtx bundles the resolved pieces FireAutomationJob needs.
// Inst must be the fresh row (status + install_state drive guards).
type AutomationFireCtx struct {
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
// AutomationDenied skips recording).
type AutomationFireResult struct {
	RunCommand string
	Stdout     string
	Stderr     string
	ExitCode   int
	DurationMS int64
	Error      string
}

// AutomationDenied means the fire was refused by the instance's template
// controls (kind toggle or op/action allow-list). Callers must NOT record a
// run row: the scheduler re-arms silently (like a suspended instance) and
// the manual endpoint answers 403.
type AutomationDenied struct{ msg string }

func (e AutomationDenied) Error() string { return e.msg }

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
	// Configs are stored as canonical YAML (legacy JSON parses identically).
	root, err := specyaml.Parse(configJSON)
	if err != nil {
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

// DefaultAutomationMaxTimeoutSec is the ceiling applied when the
// instance's controls snapshot carries no usable max (missing/garbled =
// allow-all, mirroring automationKindAllowed). It matches the frontend
// New-job picker cap (1800s).
const DefaultAutomationMaxTimeoutSec = 1800

// automationMaxTimeoutSec reads shortcuts.automation.max_timeout_sec from
// the instance's controls snapshot. Missing/garbled/<=0 means the default
// ceiling; the value is clamped to 1..1800 so a hostile template can't
// force a zero/negative budget or an overflow-scale edge dial.
func automationMaxTimeoutSec(configJSON string) int {
	// Configs are stored as canonical YAML (legacy JSON parses identically).
	root, err := specyaml.Parse(configJSON)
	if err != nil {
		return DefaultAutomationMaxTimeoutSec
	}
	ic, _ := root["instance_controls"].(map[string]any)
	shortcuts, _ := ic["shortcuts"].(map[string]any)
	auto, _ := shortcuts["automation"].(map[string]any)
	if auto == nil {
		return DefaultAutomationMaxTimeoutSec
	}
	raw, ok := auto["max_timeout_sec"]
	if !ok {
		return DefaultAutomationMaxTimeoutSec
	}
	n := 0
	switch t := raw.(type) {
	case float64:
		n = int(t)
	case int:
		n = t
	case int64:
		n = int(t)
	case string:
		var p int
		if _, err := fmt.Sscanf(t, "%d", &p); err == nil {
			n = p
		}
	}
	if n <= 0 {
		return DefaultAutomationMaxTimeoutSec
	}
	if n > DefaultAutomationMaxTimeoutSec {
		return DefaultAutomationMaxTimeoutSec
	}
	return n
}

// automationNumberField reads one numeric key from
// shortcuts.automation in the instance's controls snapshot. Missing,
// garbled or <=0 yields 0 (caller decides the default); positive values
// are clamped to 1..cap so a hostile template can't force absurd budgets.
func automationNumberField(configJSON, key string, cap int) int {
	// Configs are stored as canonical YAML (legacy JSON parses identically).
	root, err := specyaml.Parse(configJSON)
	if err != nil {
		return 0
	}
	ic, _ := root["instance_controls"].(map[string]any)
	shortcuts, _ := ic["shortcuts"].(map[string]any)
	auto, _ := shortcuts["automation"].(map[string]any)
	if auto == nil {
		return 0
	}
	raw, ok := auto[key]
	if !ok {
		return 0
	}
	n := 0
	switch t := raw.(type) {
	case float64:
		n = int(t)
	case int:
		n = t
	case int64:
		n = int(t)
	case string:
		var p int
		if _, err := fmt.Sscanf(t, "%d", &p); err == nil {
			n = p
		}
	}
	if n <= 0 {
		return 0
	}
	if n > cap {
		return cap
	}
	return n
}

// MaxAutomationConcurrentRuns bounds the run-together gate so one
// instance's burst can't park an unbounded number of edge RPCs.
const MaxAutomationConcurrentRuns = 64

// AutomationConcurrentLimit reads shortcuts.automation.max_concurrent_runs
// (how many of this instance's jobs may run at the same time). 0 means no
// extra cap beyond the scheduler's global limit (allow-all default for
// pre-cap snapshots). Exported for the scheduler sweep.
func AutomationConcurrentLimit(configJSON string) int {
	return automationNumberField(configJSON, "max_concurrent_runs", MaxAutomationConcurrentRuns)
}

// MaxAutomationActiveJobs bounds the active-jobs gate (count check only,
// never a semaphore size).
const MaxAutomationActiveJobs = 1000

// AutomationMaxActiveJobs reads shortcuts.automation.max_active_jobs (how
// many jobs of this instance may be enabled at once — an enabled job owns
// its schedule timer and fires). 0 means unlimited (allow-all default).
// Exported for the write-path gate.
func AutomationMaxActiveJobs(configJSON string) int {
	return automationNumberField(configJSON, "max_active_jobs", MaxAutomationActiveJobs)
}

// effectiveAutomationTimeout caps the operator's per-job timeout by the
// template ceiling: effective = min(jobTimeout or 300 default, configMax).
// A user value above the ceiling never reaches the edge — the write path
// rejects it (validateAutomationUpsert) and the fire path clamps it, so
// config >= user passes through while config < user is cut to config.
func effectiveAutomationTimeout(jobTimeoutSec int, configJSON string) int {
	to := jobTimeoutSec
	if to <= 0 {
		to = 300
	}
	max := automationMaxTimeoutSec(configJSON)
	if to > max {
		to = max
	}
	if to < 1 {
		to = 1
	}
	return to
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

// FireAutomationJob executes one job fire per its kind. Shell and power run
// to completion; action jobs invoke the template workflow (async — the run
// row is the invocation receipt, progress is tracked via install_state).
// Jobs with non-empty Steps run multi-step mode: each step fires in order
// gated by its if condition (success|failure|always, GitHub-Actions
// style); the aggregated result carries the combined output and the
// failing exit (0 when no executed step failed). Skipped steps leave no
// output but are named in stdout so the run reads honestly.
func FireAutomationJob(fctx AutomationFireCtx) (AutomationFireResult, error) {
	job := fctx.Job
	kind := models.NormalizeAutomationKind(job.Kind)
	if !automationKindAllowed(fctx.Inst.Config, kind) {
		return AutomationFireResult{}, AutomationDenied{fmt.Sprintf("forbidden: template disallows automation %s jobs for this instance", kind)}
	}
	if len(job.Steps) > 0 {
		// Pre-check every step kind before running any: a job can never
		// partially run what its own template forbids.
		for i := range job.Steps {
			sk := models.NormalizeAutomationKind(job.Steps[i].Kind)
			if !automationKindAllowed(fctx.Inst.Config, sk) {
				return AutomationFireResult{}, AutomationDenied{fmt.Sprintf("forbidden: template disallows automation %s jobs for this instance (step %d)", sk, i+1)}
			}
		}
		return fireStepsJob(fctx)
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

// fireStepsJob runs the job's Steps sequentially with if gating. hasFailed
// tracks whether any executed step failed (non-zero exit or error); success
// steps run only when !hasFailed, failure steps only when hasFailed, always
// steps always run. A step failure does not abort the job — later
// failure/always steps still fire (GitHub semantics); the job exit is the
// last failure's exit (0 when clean).
func fireStepsJob(fctx AutomationFireCtx) (AutomationFireResult, error) {
	job := fctx.Job
	jobTimeout := effectiveAutomationTimeout(job.TimeoutSec, fctx.Inst.Config)
	var outStd, outErr, outErrs []string
	runCmd := fmt.Sprintf("steps:%d", len(job.Steps))
	exitCode := 0
	hasFailed := false
	started := time.Now()
	for i := range job.Steps {
		st := job.Steps[i]
		cond := models.NormalizeAutomationIf(st.If)
		if cond == models.AutomationIfSuccess && hasFailed {
			outStd = append(outStd, fmt.Sprintf("== step %d: %s (skipped: previous step failed, if: success) ==", i+1, st.Name))
			continue
		}
		if cond == models.AutomationIfFailure && !hasFailed {
			outStd = append(outStd, fmt.Sprintf("== step %d: %s (skipped: no previous failure, if: failure) ==", i+1, st.Name))
			continue
		}
		stepTimeout := st.TimeoutSec
		if stepTimeout <= 0 {
			stepTimeout = jobTimeout
		}
		if stepTimeout > jobTimeout {
			stepTimeout = jobTimeout
		}
		var res AutomationFireResult
		sk := models.NormalizeAutomationKind(st.Kind)
		switch sk {
		case models.AutomationKindPower:
			res, _ = firePowerJob(fctx, st.Payload)
		case models.AutomationKindAction:
			res, _ = fireActionJob(fctx, st.Payload)
		default:
			res, _ = fireShellCommand(fctx, st.Command, stepTimeout)
		}
		// firePower/fireAction return Denied only for unknown op shapes
		// (validated at write time); surface as a step failure, not a job
		// refusal — the steps already passed the kind pre-check above.
		header := fmt.Sprintf("== step %d: %s [%s, if: %s] ==", i+1, st.Name, sk, cond)
		outStd = append(outStd, header)
		if res.Stdout != "" {
			outStd = append(outStd, res.Stdout)
		}
		if res.Stderr != "" {
			outErr = append(outErr, fmt.Sprintf("[step %d] %s", i+1, res.Stderr))
		}
		stepFailed := res.ExitCode != 0 || res.Error != ""
		if stepFailed {
			hasFailed = true
			exitCode = res.ExitCode
			if exitCode == 0 {
				exitCode = -1
			}
			msg := res.Error
			if msg == "" {
				msg = fmt.Sprintf("step %d %q failed (exit=%d)", i+1, st.Name, res.ExitCode)
			}
			outErrs = append(outErrs, fmt.Sprintf("[step %d %s] %s", i+1, st.Name, msg))
		}
		_ = res.RunCommand
	}
	finished := time.Now()
	join := func(parts []string) string {
		s := ""
		for i, p := range parts {
			if i > 0 {
				s += "\n"
			}
			s += p
		}
		return s
	}
	errStr := ""
	for i, e := range outErrs {
		if i > 0 {
			errStr += "; "
		}
		errStr += e
	}
	return AutomationFireResult{
		RunCommand: runCmd,
		Stdout:     join(outStd),
		Stderr:     join(outErr),
		ExitCode:   exitCode,
		DurationMS: finished.Sub(started).Milliseconds(),
		Error:      errStr,
	}, nil
}

// fireShellJob is the original automation behaviour: exec Command on the
// owning edge with the job's secret env. The timeout is the effective
// budget (job value capped by the template ceiling) so config < user is
// cut to config at fire time even if a row predates the write-path check.
func fireShellJob(fctx AutomationFireCtx) (AutomationFireResult, error) {
	job := fctx.Job
	timeout := effectiveAutomationTimeout(job.TimeoutSec, fctx.Inst.Config)
	return fireShellCommand(fctx, job.Command, timeout)
}

// fireShellCommand execs an arbitrary command with an explicit timeout.
// Shared by the single-shot shell path and every shell step.
func fireShellCommand(fctx AutomationFireCtx, command string, timeout int) (AutomationFireResult, error) {
	job, inst := fctx.Job, fctx.Inst
	keys, vals, _ := repository.NewSecretRepository(fctx.Con).ResolvedEnv(job.InstanceID, job.SecretRefs)
	env := map[string]string{}
	for i := range keys {
		env[keys[i]] = vals[i]
	}
	if timeout <= 0 {
		timeout = effectiveAutomationTimeout(job.TimeoutSec, fctx.Inst.Config)
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
		Kind: inst.Kind, Name: name, Command: command, Env: env, TimeoutSec: timeout,
	})
	finished := time.Now()
	res := AutomationFireResult{
		RunCommand: command,
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
func firePowerJob(fctx AutomationFireCtx, op string) (AutomationFireResult, error) {
	inst := fctx.Inst
	instRepo := repository.NewInstanceRepository(fctx.Con)
	if !models.IsAutomationPowerOp(op) {
		return AutomationFireResult{}, AutomationDenied{fmt.Sprintf("forbidden: unknown power op %q", op)}
	}
	// Template allow-list for the op itself (same keys the power buttons
	// enforce, so a job can never do what its own menu forbids).
	if key := powerControlKey(op); key != "" && !instanceControlsAllow(inst.Config, key) {
		return AutomationFireResult{}, AutomationDenied{fmt.Sprintf("forbidden: template disallows %s for this instance", op)}
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
func fireActionJob(fctx AutomationFireCtx, actionID string) (AutomationFireResult, error) {
	inst := fctx.Inst
	if !instanceControlsAllow(inst.Config, "allow_template_actions") {
		return AutomationFireResult{}, AutomationDenied{"forbidden: template disallows template actions for this instance"}
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
