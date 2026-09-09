package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/stackstore"
	"github.com/go-chi/chi/v5"
)

// Stack operation jobs — async install / launch / reinstall runs with
// per-step progress and a live log tail. The detail page opens an operation
// console (sub-page modal) on start: closing it only dismisses the view
// (the job keeps running), while Stop cancels the job — remaining steps are
// skipped and the job lands in "cancelled".
//
// Jobs live in process memory (single-panel deployment); the registry keeps
// the latest runs per stack for polling and re-attach.

const (
	stackOpRunning   = "running"
	stackOpDone      = "done"
	stackOpError     = "error"
	stackOpCancelled = "cancelled"
)

type stackOpStep struct {
	Name   string `json:"name"`
	State  string `json:"state"` // pending|running|done|error|skipped
	Detail string `json:"detail,omitempty"`
}

type stackOpJob struct {
	mu        sync.Mutex
	cond      chan struct{} // closed on terminal state (lets waiters wake)
	JobID     string        `json:"job_id"`
	StackID   int64         `json:"stack_id"`
	Op        string        `json:"op"` // install|launch|reinstall
	Status    string        `json:"status"`
	Steps     []stackOpStep `json:"steps"`
	Logs      []string      `json:"logs"`
	Error     string        `json:"error,omitempty"`
	CreatedAt string        `json:"created_at"`
	UpdatedAt string        `json:"updated_at"`
	cancel    context.CancelFunc `json:"-"`
	// logLines/logTruncated bound memory on chatty commands.
	logLines     int  `json:"-"`
	logTruncated bool `json:"-"`
}

// stackOpMaxLogLines caps retained log lines per job; line length is capped
// separately by stackOpTruncateLine.
const stackOpMaxLogLines = 5000

func stackOpTruncateLine(s string) string {
	if len(s) > 2000 {
		return s[:2000] + "…[truncated]"
	}
	return s
}

var stackOpRegistry = struct {
	sync.Mutex
	jobs map[string]*stackOpJob
	// running tracks the single in-flight job per stack. Check + insert
	// happen under one lock hold so two simultaneous starts can't both
	// slip through (which would interleave e.g. reinstall's deactivate
	// with launch's activate).
	running map[int64]string
}{jobs: make(map[string]*stackOpJob), running: make(map[int64]string)}

var stackOpSeq uint64

func stackOpNow() string { return time.Now().UTC().Format(time.RFC3339) }

func stackOpLogLine(format string, args ...any) string {
	return fmt.Sprintf("[%s] %s", time.Now().UTC().Format("15:04:05"), fmt.Sprintf(format, args...))
}

func (j *stackOpJob) appendLog(line string) {
	j.mu.Lock()
	if j.logLines >= stackOpMaxLogLines {
		if !j.logTruncated {
			j.Logs = append(j.Logs, "[log truncated — tail dropped]")
			j.logTruncated = true
		}
		j.UpdatedAt = stackOpNow()
		j.mu.Unlock()
		return
	}
	j.Logs = append(j.Logs, line)
	j.logLines++
	j.UpdatedAt = stackOpNow()
	j.mu.Unlock()
}

func (j *stackOpJob) setStep(i int, state, detail string) {
	j.mu.Lock()
	if i >= 0 && i < len(j.Steps) {
		j.Steps[i].State = state
		j.Steps[i].Detail = detail
	}
	j.UpdatedAt = stackOpNow()
	j.mu.Unlock()
}

// stackOpSnapshot is the wire shape: same fields as the job, minus the
// lock/cond/cancel internals (a mutex must never be copied after use).
type stackOpSnapshot struct {
	JobID     string        `json:"job_id"`
	StackID   int64         `json:"stack_id"`
	Op        string        `json:"op"`
	Status    string        `json:"status"`
	Steps     []stackOpStep `json:"steps"`
	Logs      []string      `json:"logs"`
	Error     string        `json:"error,omitempty"`
	CreatedAt string        `json:"created_at"`
	UpdatedAt string        `json:"updated_at"`
}

// snapshot returns a copy safe to JSON-encode outside the lock.
func (j *stackOpJob) snapshot() stackOpSnapshot {
	j.mu.Lock()
	defer j.mu.Unlock()
	return stackOpSnapshot{
		JobID:     j.JobID,
		StackID:   j.StackID,
		Op:        j.Op,
		Status:    j.Status,
		Steps:     append([]stackOpStep(nil), j.Steps...),
		Logs:      append([]string(nil), j.Logs...),
		Error:     j.Error,
		CreatedAt: j.CreatedAt,
		UpdatedAt: j.UpdatedAt,
	}
}

func (j *stackOpJob) terminal(status, errMsg string) {
	j.mu.Lock()
	j.Status = status
	j.Error = errMsg
	j.UpdatedAt = stackOpNow()
	select {
	case <-j.cond:
	default:
		close(j.cond)
	}
	j.mu.Unlock()
}

// stackOpPruneLocked drops the oldest terminal jobs past the cap.
// Call with the registry lock held.
func stackOpPruneLocked() {
	if len(stackOpRegistry.jobs) <= 200 {
		return
	}
	var oldestID, oldestAt string
	for id, jb := range stackOpRegistry.jobs {
		jb.mu.Lock()
		st, at := jb.Status, jb.CreatedAt
		jb.mu.Unlock()
		if st == stackOpRunning {
			continue
		}
		if oldestID == "" || at < oldestAt {
			oldestID, oldestAt = id, at
		}
	}
	if oldestID != "" {
		delete(stackOpRegistry.jobs, oldestID)
	}
}

func stackOpGet(jobID string) *stackOpJob {
	stackOpRegistry.Lock()
	defer stackOpRegistry.Unlock()
	return stackOpRegistry.jobs[jobID]
}

func stackOpClearRunning(stackID int64, jobID string) {
	stackOpRegistry.Lock()
	if stackOpRegistry.running[stackID] == jobID {
		delete(stackOpRegistry.running, stackID)
	}
	stackOpRegistry.Unlock()
}

// stackOpStepDef is one executable unit of an operation.
type stackOpStepDef struct {
	name string
	run  func(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error)
}

// stackOpBuildDefs assembles an operation's steps. Install runs the
// manifest's installation workflow steps (the same list the Studio form
// edits) for real, in order, AFTER packaging: SavePackage invalidates the
// extracted workdir (next access re-extracts), so the workflow runs last
// and its files survive in the workdir.
func stackOpBuildDefs(op string, s *models.Stack) []stackOpStepDef {
	switch op {
	case "install":
		defs := []stackOpStepDef{
			{name: "Load stack", run: stackOpLoad},
			{name: "Build package", run: stackOpBuildPackage},
			{name: "Save package", run: stackOpSavePackage},
			{name: "Ensure workdir", run: stackOpEnsureWorkDir},
		}
		defs = append(defs, stackWorkflowStepDefs(s, stackManifestWorkflowSteps(s.Manifest))...)
		return append(defs,
			stackOpStepDef{name: "Ensure data dir", run: stackOpEnsureDataDir},
			stackOpStepDef{name: "Verify", run: stackOpVerifyInstall},
		)
	case "reinstall":
		return []stackOpStepDef{
			{name: "Load stack", run: stackOpLoad},
			{name: "Build package", run: stackOpBuildPackage},
			{name: "Deactivate", run: stackOpDeactivate},
			{name: "Reset grants", run: stackOpResetGrants},
			{name: "Save package", run: stackOpSavePackage},
			{name: "Ensure data dir", run: stackOpEnsureDataDir},
			{name: "Verify", run: stackOpVerifyFresh},
		}
	default: // launch
		// The manifest's launch workflow steps (the same list the Studio
		// form edits) run for real after the grant check, before Activate.
		defs := []stackOpStepDef{
			{name: "Load stack", run: stackOpLoad},
			{name: "Check engine", run: stackOpCheckEngine},
			{name: "Check grants", run: stackOpCheckGrants},
			{name: "Ensure workdir", run: stackOpEnsureWorkDir},
		}
		defs = append(defs, stackWorkflowStepDefs(s, stackManifestLaunchSteps(s.Manifest))...)
		return append(defs,
			stackOpStepDef{name: "Activate", run: stackOpActivate},
			stackOpStepDef{name: "Verify", run: stackOpVerifyActive},
		)
	}
}

// stackWorkflowStepDefs turns parsed manifest workflow steps into executable
// job steps (retries + ignore_errors honoured, commands killed on cancel).
func stackWorkflowStepDefs(s *models.Stack, wsteps []stackWorkflowStep) []stackOpStepDef {
	defs := make([]stackOpStepDef, 0, len(wsteps))
	for i, wst := range wsteps {
		i, wst := i, wst
		num, label := i+1, stackWorkflowStepLabel(wst, i+1)
		cmd, cerr := stackWorkflowShell(wst, num)
		retries := stackWorkflowRetries(wst.Retries)
		defs = append(defs, stackOpStepDef{name: label, run: func(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
			if cerr != nil {
				return "", cerr
			}
			wd, err := stackstore.EnsureWorkDir(s.Slug)
			if err != nil {
				return "", err
			}
			for attempt := 0; ; attempt++ {
				if ctx.Err() != nil {
					return "", ctx.Err()
				}
				job.appendLog(stackOpLogLine("run: %s", cmdSummary(cmd)))
				if err := runStackWorkflowStep(ctx, wd, cmd, job); err == nil {
					return "exit 0", nil
				} else if ctx.Err() != nil {
					return "", ctx.Err()
				} else if attempt < retries {
					job.appendLog(stackOpLogLine("failed, retrying (%d/%d) in 2s: %s", attempt+1, retries, err.Error()))
					select {
					case <-time.After(2 * time.Second):
					case <-ctx.Done():
						return "", ctx.Err()
					}
					continue
				} else if wst.IgnoreErrors {
					job.appendLog(stackOpLogLine("failed (ignored): %s", err.Error()))
					return "failed, ignored", nil
				} else {
					return "", err
				}
			}
		}})
	}
	return defs
}

// cmdSummary keeps the "run:" log line to one short line.
func cmdSummary(cmd string) string {
	one := strings.ReplaceAll(cmd, "\n", " ")
	if len(one) > 160 {
		return one[:160] + "…"
	}
	return one
}

// --- step implementations (each must be fast + idempotent) ---

func stackOpLoad(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	job.appendLog(stackOpLogLine("loaded stack %q (slug=%s, id=%d)", s.Name, s.Slug, s.ID))
	return fmt.Sprintf("id=%d slug=%s", s.ID, s.Slug), nil
}

func stackOpBuildPackage(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	pkg, err := stackstore.BuildPackageZip(s.Manifest, s.Spec, nil)
	if err != nil {
		return "", fmt.Errorf("build package: %w", err)
	}
	job.appendLog(stackOpLogLine("built .ksps package (%d bytes) from manifest", len(pkg)))
	// stash bytes for the save step within this job run (deleted when the
	// job terminates) so a reinstall doesn't build the zip twice.
	jobStackPkgCache.store(job.JobID, pkg)
	return fmt.Sprintf("%d bytes", len(pkg)), nil
}

// stackPkgCache carries built bytes from the build step to the save step
// within one job run (deleted when the job terminates).
type stackPkgCache struct {
	sync.Mutex
	m map[string][]byte
}

var jobStackPkgCache = stackPkgCache{m: make(map[string][]byte)}

func (c *stackPkgCache) store(id string, b []byte) {
	c.Lock()
	c.m[id] = b
	c.Unlock()
}

func (c *stackPkgCache) take(id string) []byte {
	c.Lock()
	b := c.m[id]
	delete(c.m, id)
	c.Unlock()
	return b
}

func stackOpSavePackage(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	pkg := jobStackPkgCache.take(job.JobID)
	if len(pkg) == 0 {
		var err error
		pkg, err = stackstore.BuildPackageZip(s.Manifest, s.Spec, nil)
		if err != nil {
			return "", fmt.Errorf("build package: %w", err)
		}
	}
	if err := stackstore.SavePackage(s.Slug, pkg); err != nil {
		return "", fmt.Errorf("save package: %w", err)
	}
	job.appendLog(stackOpLogLine("saved package for %q (%d bytes)", s.Slug, len(pkg)))
	return fmt.Sprintf("%d bytes", len(pkg)), nil
}

func stackOpEnsureWorkDir(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	wd, err := stackstore.EnsureWorkDir(s.Slug)
	if err != nil {
		return "", err
	}
	job.appendLog(stackOpLogLine("workdir ready: %s", wd))
	return wd, nil
}

func stackOpVerifyInstall(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	if !stackstore.PackageExists(s.Slug) {
		return "", fmt.Errorf("package missing after install")
	}
	job.appendLog(stackOpLogLine("verified package present"))
	return "package ok", nil
}

func stackOpEnsureDataDir(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	d, err := stackstore.EnsureDataDir(s.Slug)
	if err != nil {
		return "", err
	}
	job.appendLog(stackOpLogLine("data dir ready: %s", d))
	return d, nil
}

func stackOpDeactivate(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	if err := repo.Deactivate(s.ID); err != nil && !errors.Is(err, repository.ErrStackNotFound) {
		return "", err
	}
	job.appendLog(stackOpLogLine("deactivated stack #%d", s.ID))
	return "active=0", nil
}

func stackOpResetGrants(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	perms, err := repo.ListStackPermissions(s.ID)
	if err != nil {
		return "", err
	}
	if err := repo.ResetStackGrants(s.ID); err != nil {
		return "", err
	}
	job.appendLog(stackOpLogLine("reset %d grant(s) to pending", len(perms)))
	return fmt.Sprintf("%d pending", len(perms)), nil
}

func stackOpCheckEngine(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	if !repo.StacksEnabled() {
		return "", fmt.Errorf("stacks engine is disabled")
	}
	job.appendLog(stackOpLogLine("engine enabled"))
	return "enabled", nil
}

func stackOpCheckGrants(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	perms, err := repo.ListStackPermissions(s.ID)
	if err != nil {
		return "", err
	}
	pending := 0
	for _, p := range perms {
		if !p.Granted {
			pending++
		}
	}
	if pending > 0 {
		return "", fmt.Errorf("%d permission(s) pending — approve grants first", pending)
	}
	job.appendLog(stackOpLogLine("grants ok (%d approved)", len(perms)))
	return fmt.Sprintf("%d approved", len(perms)), nil
}

func stackOpActivate(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	if err := repo.Activate(s.ID); err != nil {
		if errors.Is(err, repository.ErrStackPermissionsNotGranted) {
			return "", fmt.Errorf("permissions went pending mid-launch — approve grants first")
		}
		return "", err
	}
	job.appendLog(stackOpLogLine("activated stack #%d", s.ID))
	return "active=1", nil
}

func stackOpVerifyActive(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	fresh, err := repo.GetStack(s.ID)
	if err != nil {
		return "", err
	}
	if !fresh.Active {
		return "", fmt.Errorf("verify failed: stack is not active")
	}
	job.appendLog(stackOpLogLine("verified active"))
	return "active=1", nil
}

func stackOpVerifyFresh(ctx context.Context, repo *repository.StackRepository, s *models.Stack, job *stackOpJob) (string, error) {
	perms, err := repo.ListStackPermissions(s.ID)
	if err != nil {
		return "", err
	}
	pending := 0
	for _, p := range perms {
		if !p.Granted {
			pending++
		}
	}
	fresh, err := repo.GetStack(s.ID)
	if err != nil {
		return "", err
	}
	job.appendLog(stackOpLogLine("verified fresh install: active=%v, %d pending grant(s)", fresh.Active, pending))
	return fmt.Sprintf("active=%v, %d pending", fresh.Active, pending), nil
}

// stackOpStopNote distinguishes a user Stop from a budget timeout once the
// context is dead (both surface as ctx.Err() inside steps).
func stackOpStopNote(ctx context.Context) string {
	if ctx.Err() == context.DeadlineExceeded {
		return "timed out"
	}
	return "stopped by user"
}

// runStackOpJob executes the steps sequentially. Stop (or the overall
// budget) cancels the context: the in-flight command is killed, remaining
// steps are marked skipped and the job lands in "cancelled" (partial
// effects stand and are reported in the log + final detail reload).
func runStackOpJob(job *stackOpJob, repo *repository.StackRepository, closeFn func(), s *models.Stack, op string, r *http.Request, ctx context.Context, defs []stackOpStepDef) {
	defer closeFn()
	defer jobStackPkgCache.take(job.JobID)
	if op == "install" && len(stackManifestWorkflowSteps(s.Manifest)) == 0 {
		job.appendLog(stackOpLogLine("no install workflow steps — package only"))
	}
	if op == "launch" && len(stackManifestLaunchSteps(s.Manifest)) == 0 {
		job.appendLog(stackOpLogLine("no launch workflow steps — activate only"))
	}
	outcome := stackOpDone
	errMsg := ""
	cancelJob := func(from int, note string) {
		for j := from; j < len(defs); j++ {
			job.setStep(j, "skipped", note)
		}
		job.appendLog(stackOpLogLine("%s — remaining steps skipped", note))
		outcome = stackOpCancelled
	}
	for i, d := range defs {
		if ctx.Err() != nil {
			cancelJob(i, stackOpStopNote(ctx))
			break
		}
		job.setStep(i, "running", "")
		job.appendLog(stackOpLogLine("step %d/%d: %s", i+1, len(defs), d.name))
		detail, err := d.run(ctx, repo, s, job)
		if ctx.Err() != nil {
			// Lost the race with Stop/timeout mid-step: the command is
			// already dead via CommandContext — report cancel, not failure.
			job.setStep(i, "skipped", stackOpStopNote(ctx))
			cancelJob(i+1, stackOpStopNote(ctx))
			break
		}
		if err != nil {
			job.setStep(i, "error", err.Error())
			job.appendLog(stackOpLogLine("step failed: %s — %s", d.name, err.Error()))
			outcome = stackOpError
			errMsg = err.Error()
			for j := i + 1; j < len(defs); j++ {
				job.setStep(j, "skipped", "previous step failed")
			}
			break
		}
		job.setStep(i, "done", detail)
	}
	if outcome == stackOpDone {
		job.appendLog(stackOpLogLine("%s finished", op))
	}
	job.terminal(outcome, errMsg)
	stackOpClearRunning(job.StackID, job.JobID)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryStack,
		Action:      op,
		TargetID:    &s.ID,
		TargetLabel: s.Name,
		Message:     fmt.Sprintf("stack %s %q: %s%s", op, s.Name, outcome, suffixIf(errMsg != "", ": "+errMsg)),
	})
}

func suffixIf(cond bool, s string) string {
	if cond {
		return s
	}
	return ""
}

// StartStackOpHandler launches an async install/launch/reinstall job.
// One running job per stack: a second start while one runs gets 409 with
// the running job_id so the UI can attach to it instead.
func StartStackOpHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	op := chi.URLParam(r, "op")
	if op != "install" && op != "launch" && op != "reinstall" {
		http.Error(w, "unknown operation (want install|launch|reinstall)", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	s, err := repo.GetStack(id)
	if err != nil {
		closeFn()
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("StartStackOp GetStack error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if stackOwnBlocked(r, s) {
		closeFn()
		http.Error(w, "forbidden: own-scope may only run stacks you uploaded", http.StatusForbidden)
		return
	}
	defs := stackOpBuildDefs(op, s)
	steps := make([]stackOpStep, 0, len(defs))
	for _, d := range defs {
		steps = append(steps, stackOpStep{Name: d.name, State: "pending"})
	}
	seq := atomic.AddUint64(&stackOpSeq, 1)
	job := &stackOpJob{
		cond:      make(chan struct{}),
		JobID:     fmt.Sprintf("%d-%d-%d", id, time.Now().UTC().Unix(), seq),
		StackID:   id,
		Op:        op,
		Status:    stackOpRunning,
		Steps:     steps,
		Logs:      []string{stackOpLogLine("started %s of stack %q (#%d)", op, s.Name, s.ID)},
		CreatedAt: stackOpNow(),
		UpdatedAt: stackOpNow(),
	}
	// Install and launch honour the manifest's whole-workflow budgets
	// (install_timeout_sec / launch_timeout_sec, default 30 min);
	// reinstall gets 10 minutes.
	timeout := 10 * time.Minute
	if op == "install" {
		timeout = stackOpTimeout(s.Manifest, "install_timeout_sec")
	} else if op == "launch" {
		timeout = stackOpTimeout(s.Manifest, "launch_timeout_sec")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	job.cancel = cancel
	// Claim the single running slot and insert atomically: two simultaneous
	// starts can't both slip through and interleave (e.g. reinstall's
	// deactivate racing launch's activate).
	stackOpRegistry.Lock()
	if rid, ok := stackOpRegistry.running[id]; ok {
		if jb, ok := stackOpRegistry.jobs[rid]; ok {
			jb.mu.Lock()
			stillRunning := jb.Status == stackOpRunning
			jb.mu.Unlock()
			if stillRunning {
				snap := jb.snapshot()
				stackOpRegistry.Unlock()
				cancel()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error":  "an operation is already running for this stack",
					"job_id": snap.JobID,
					"job":    snap,
				})
				return
			}
		}
		delete(stackOpRegistry.running, id)
	}
	stackOpRegistry.jobs[job.JobID] = job
	stackOpRegistry.running[id] = job.JobID
	stackOpPruneLocked()
	stackOpRegistry.Unlock()
	go runStackOpJob(job, repo, closeFn, s, op, r, ctx, defs)
	snap := job.snapshot()
	writeJSONStatus(w, http.StatusAccepted, snap)
}

// GetStackOpHandler returns one job (any state) for polling / re-attach.
func GetStackOpHandler(w http.ResponseWriter, r *http.Request) {
	job := stackOpGet(chi.URLParam(r, "job"))
	if job == nil || job.StackID != mustParseStackID(chi.URLParam(r, "id")) {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	snap := job.snapshot()
	writeJSON(w, snap)
}

// StopStackOpHandler cancels a running job. The in-flight step finishes;
// remaining steps are skipped. Safe to call on terminal jobs (no-op,
// returns the final snapshot).
func StopStackOpHandler(w http.ResponseWriter, r *http.Request) {
	job := stackOpGet(chi.URLParam(r, "job"))
	if job == nil || job.StackID != mustParseStackID(chi.URLParam(r, "id")) {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	job.mu.Lock()
	running := job.Status == stackOpRunning
	cancel := job.cancel
	job.mu.Unlock()
	if running && cancel != nil {
		cancel()
	}
	snap := job.snapshot()
	writeJSON(w, snap)
}

func mustParseStackID(raw string) int64 {
	id, _ := strconv.ParseInt(raw, 10, 64)
	return id
}
