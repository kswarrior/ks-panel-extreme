package install

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/example/ksedge/internal/drivers"
)

// Handler returns an http.Handler that exposes the install workflow RPC.
// Two methods share one path /api/edge/install:
//
//	POST /api/edge/install     → kick off an install workflow (async)
//	GET  /api/edge/install     → poll an in-progress workflow's state
//
// Auth is the same shared-token pattern used by /api/edge/lifecycle: the
// panel presents the edge's own heartbeat token in the body (POST) or in
// the ?token= query (GET — browsers can't set headers on EventSource/fetch
// behind proxies, mirroring the exec endpoint's approach). A token that
// doesn't constant-time-match the configured secret returns a 401.
//
// State is kept in an in-process map keyed by "<kind>:<name>". ksedge is
// single-host per process; a workflow that almost finishes then crashes the
// edge loses its in-progress record, which is fine — the panel's poll loop
// sees the workflow disappear (404) and marks the instance 'install_failed'
// with a clear "edge lost install state" message rather than hanging. In
// practice a ksedge crash mid-install is the rare case, and the operator
// can re-deploy to restart the workflow cleanly.
func Handler(token string) http.Handler {
	store := newStore()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/edge/install", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			handleInstallStart(w, r, token, store)
		case http.MethodGet:
			handleInstallStatus(w, r, token, store)
		default:
			writeInstallErr(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	})
	// /api/edge/install/stop cancels the running workflow for a <kind>:<name>
	// key and (optionally) execs a `stop_command` inside the container. This
	// is the edge half of the operator's "Stop" button on the instance home
	// page: a running template action can be torn down mid-flight, and the
	// template author's stop_command runs once to clean up whatever the
	// action left half-started (e.g. `pkill -f java` after a "Start Java"
	// action was cancelled). The stop_command is best-effort — its exit code
	// is surfaced to the panel but a failure there doesn't un-cancel the
	// workflow; the workflow is already torn down by the time stop_command
	// runs.
	mux.HandleFunc("/api/edge/install/stop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeInstallErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		handleInstallStop(w, r, token, store)
	})
	return mux
}

// record is the install-run state the panel polls back. State gets one of
// the State* constants; once State != StateRunning the record stays resident
// (no TTL sweep) so a panel poll arriving a few seconds after completion
// still gets the final transcript. The store is bounded by #instances on the
// host, which is small enough that we don't bother evicting.
//
// cancel, when non-nil, is the CancelFunc of the context the running workflow
// goroutine was launched with. The panel's /api/edge/install/stop RPC calls
// store.Stop to fire it — install.Run checks the context between + within
// steps (the per-step select + the ExecFn's ctx propagation into
// drivers.Exec), so a cancel aborts the in-flight exec promptly. The
// goroutine then writes the final "failed (cancelled)" transcript, which the
// next poll reads back so the operator sees the rationale verbatim.
//
// stdinWriter, when non-nil, is the io.WriteCloser of the currently running
// step's stdin pipe. This is set by RunWithStdin when KeepStdin+SessionExec
// are active (same-terminal stop mode). The stop handler can write to this
// to inject commands (e.g. "stop\n") directly into the running process's
// console instead of exec'ing a separate shell.
type record struct {
	mu          sync.RWMutex
	state       string // running | done | failed
	steps       []StepStatus
	err         string
	start       time.Time
	end         time.Time
	cancel      context.CancelFunc
	stdinWriter io.WriteCloser
}

// store maps "<kind>:<name>" → *record. Writes guarded by the map mutex;
// per-record mutability uses the record's own RWMutex so a poll reader and
// the running goroutine never step on each other's transcript.
type store struct {
	mu sync.Mutex
	m  map[string]*record
}

func newStore() *store { return &store{m: make(map[string]*record)} }

func (s *store) getOrCreate(key string) *record {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.m[key]; ok {
		return rec
	}
	rec := &record{state: StateRunning, start: time.Now()}
	s.m[key] = rec
	return rec
}

func (s *store) get(key string) (*record, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.m[key]
	return rec, ok
}

// setCancel attaches the workflow goroutine's CancelFunc to the record so a
// later Stop call for the same key can abort it. Called by handleInstallStart
// immediately after launching the goroutine.
func (s *store) setCancel(key string, cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.m[key]; ok {
		rec.mu.Lock()
		rec.cancel = cancel
		rec.mu.Unlock()
	}
}

// setStdinWriter stores the current step's stdin writer so the stop handler
// can write to it (same-terminal stop mode). Called by the RunWithStdin
// callback.
func (s *store) setStdinWriter(key string, w io.WriteCloser) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.m[key]; ok {
		rec.mu.Lock()
		rec.stdinWriter = w
		rec.mu.Unlock()
	}
}

// getStdinWriter retrieves the current stdin writer for same-terminal stop.
func (s *store) getStdinWriter(key string) io.WriteCloser {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.m[key]; ok {
		rec.mu.RLock()
		w := rec.stdinWriter
		rec.mu.RUnlock()
		return w
	}
	return nil
}

// clearStdinWriter clears the stdin writer when the step completes.
func (s *store) clearStdinWriter(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.m[key]; ok {
		rec.mu.Lock()
		rec.stdinWriter = nil
		rec.mu.Unlock()
	}
}

// Stop marks the record as cancelled (the running goroutine observes the
// context's Done signal through install.Run's select + the ExecFn's ctx
// propagation) and returns the record's existing state. If no workflow is
// running for the key (already done/failed/never started) the call is a
// no-op and reports the current state so the panel can render the right
// banner without a separate status poll.
func (s *store) Stop(key string) string {
	s.mu.Lock()
	rec, ok := s.m[key]
	if !ok {
		s.mu.Unlock()
		return "unknown"
	}
	s.mu.Unlock()
	rec.mu.Lock()
	defer rec.mu.Unlock()
	if rec.state == StateRunning && rec.cancel != nil {
		rec.cancel()
	}
	return rec.state
}

// handleInstallStart kicks off a workflow. The workflow must NOT already be
// running for the same key — a re-deploy with the same instance name will
// have the panel's destroy run first (which removes the container) before the
// deploy runs again, so a stale record from the previous install is fine to
// overwrite. We log when we overwrite to keep the audit trail honest.
func handleInstallStart(w http.ResponseWriter, r *http.Request, token string, store *store) {
	if r.Body == nil {
		writeInstallErr(w, http.StatusBadRequest, "empty body")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeInstallErr(w, http.StatusBadRequest, "read body: "+err.Error())
		return
	}
	var in Input
	if err := json.Unmarshal(raw, &in); err != nil {
		writeInstallErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
		return
	}
	if token == "" || subtle.ConstantTimeCompare([]byte(in.Token), []byte(token)) != 1 {
		writeInstallErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	if in.Name == "" {
		writeInstallErr(w, http.StatusBadRequest, "instance name is required")
		return
	}
	drv, ok := drivers.Registry[in.Kind]
	if !ok {
		writeInstallErr(w, http.StatusBadRequest, fmt.Sprintf("unknown driver kind: %s", in.Kind))
		return
	}
	key := in.Kind + ":" + in.Name

	// Build the ExecFn from the driver. We use a non-tty exec (tty=false)
	// because install steps are scripts, not interactive; the driver's pipe
	// plumbing routes stdout/stderr/exit back here.
	//
	// CRITICAL: stdout and stderr must be drained CONCURRENTLY. Reading them
	// sequentially is a textbook pipe deadlock: the child writes to stdout,
	// fills the 64KB pipe buffer, blocks trying to write more, then writes
	// to stderr. Meanwhile our goroutine is blocked on io.ReadAll(stdout)
	// waiting for EOF. Neither side can make progress. This was a production
	// regression that hung the install poller until the process was killed
	// externally. Reading both pipes in parallel + closing the read side on
	// exit (via cmd.Wait) breaks the cycle.
	//
	// Retry semantics: the install RPC fires immediately after the deploy
	// RPC returns, but the deploy RPC returns the moment `docker run -d`
	// exits — which is BEFORE the container's main process has had a chance
	// to fully initialise. On a cold-cache image pull the container can be
	// in "created" / "restarting" state for a few hundred ms while docker
	// schedules the entrypoint. A `docker exec` against a container in that
	// state returns "is not running" (exit 1) and the workflow bails on
	// step #0 before running anything. We bound a short retry (up to 30s
	// total, ~1s backoff) that ONLY retries on "container is not running"
	// errors — real exec failures (bad command, missing binary inside the
	// image, OOM) still surface immediately so the operator sees the real
	// problem. We intentionally don't wrap the tty=true Exec (terminal
	// path): operators want immediate failure there, not a 30s spinner.
	//
	// buildExecFn is shared with handleInstallStop so the stop_command path
	// gets the identical pipe-deadlock-safe + container-not-running-retry
	// plumbing the install path already battle-tested.
	execFn := buildExecFn(drv, in.Name)

	// SessionExecFn wraps the driver's Exec to return the engine's ExecSession
	// type (with stdin/stdout/stderr/wait/close) so RunWithStdin can drain
	// output while keeping stdin open for same-terminal stop.
	var sessionExecFn SessionExecFn
	if in.KeepStdin {
		sessionExecFn = func(ctx context.Context, command []string) (*ExecSession, error) {
			sess, err := drv.Exec(ctx, in.Name, false, 0, 0, command)
			if err != nil {
				return nil, err
			}
			return &ExecSession{
				Stdin:  sess.Stdin,
				Stdout: sess.Stdout,
				Stderr: sess.Stderr,
				Wait:   sess.Wait,
				Close:  sess.Close,
			}, nil
		}
		in.SessionExec = sessionExecFn
	}

	// If a previous workflow exists for the same name and is still running,
	// we REFUSE the kick-off — a second deploy on the same name mid-install
	// would race on the same container's exec. The panel always destroys
	// before re-deploying, so this only triggers on operator mistake.
	if existing, ok := store.get(key); ok {
		existing.mu.RLock()
		st := existing.state
		existing.mu.RUnlock()
		if st == StateRunning {
			writeInstallErr(w, http.StatusConflict, "install already running for "+key)
			return
		}
		log.Printf("install: overwriting previous install record for %s (state=%s)", key, st)
	}

	rec := store.getOrCreate(key)
	rec.mu.Lock()
	// Reset transcript for a fresh deploy of the same name.
	rec.state = StateRunning
	rec.steps = make([]StepStatus, len(in.Steps))
	for i, s := range in.Steps {
		rec.steps[i] = StepStatus{Index: i, Action: s.Action, Status: "pending"}
	}
	rec.err = ""
	rec.start = time.Now()
	rec.end = time.Time{}
	rec.mu.Unlock()

	// Run asynchronously so the RPC returns immediately. The workflow budget
	// is chosen from Input.TimeoutSec (sent by the panel):
	//   > 0 → operator-configured cap (template action max_runtime_s or the
	//         template's install_timeout_sec) — a big apt install can blow
	//         the legacy default comfortably, so the panel decides;
	//   < 0 → NO deadline: long-running actions ("Start Java") are supposed
	//         to keep the container alive for days until the operator clicks
	//         Stop — the old unconditional 30-minute cap silently killed them
	//         and the panel mislabelled the corpse "install_failed";
	//   = 0 → legacy 30-minute default so older panels keep the safety net.
	// We hand the panel a per-instance install_id and let it poll, exactly
	// like the deploy→install split the codebase comment block warns about
	// for the Cloudflare 15s window.
	var ctx context.Context
	var cancel context.CancelFunc
	if in.TimeoutSec < 0 {
		ctx, cancel = context.WithCancel(context.Background())
	} else if in.TimeoutSec > 0 {
		ctx, cancel = context.WithTimeout(context.Background(), time.Duration(in.TimeoutSec)*time.Second)
	} else {
		ctx, cancel = context.WithTimeout(context.Background(), 30*time.Minute)
	}
	store.setCancel(key, cancel)

	// If KeepStdin is requested, we need a SessionExecFn that returns the
	// driver's ExecSession so the engine can keep stdin open.
	var runFn func(ctx context.Context, in Input, exec ExecFn, onStdin func(io.WriteCloser)) (string, []StepStatus) = Run
	if in.KeepStdin {
		runFn = RunWithStdin
	}

	go func() {
		defer cancel()
		// Snapshot rec locally for the goroutine; store's map still owns
		// the canonical pointer (getOrCreate returned the same *record we
		// reset above, so mutate-by-reference is safe).
		state, steps := runFn(ctx, in, execFn, func(w io.WriteCloser) {
			store.setStdinWriter(key, w)
		})
		// Clear stdin writer when workflow finishes
		store.clearStdinWriter(key)
		rec.mu.Lock()
		rec.state = state
		rec.steps = steps
		rec.end = time.Now()
		if state == StateFailed {
			// find the failing step's stderr as a short, line-1 message so
			// the panel can surface it without decoding the whole transcript.
			for _, s := range steps {
				if s.Status == "failed" {
					if s.Stderr != "" {
						rec.err = fmt.Sprintf("step #%d (%s) failed: %s", s.Index, s.Action, firstLine(s.Stderr))
					} else {
						rec.err = fmt.Sprintf("step #%d (%s) failed (exit %d)", s.Index, s.Action, s.ExitCode)
					}
					break
				}
			}
		}
		rec.mu.Unlock()
		log.Printf("install: workflow %s finished state=%s", key, state)
	}()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":         true,
		"install_id": key,
	})
}

// handleInstallStatus returns the polled state. Kept pure-read against the
// store so concurrent polls don't mutex-block the running goroutine.
func handleInstallStatus(w http.ResponseWriter, r *http.Request, token string, store *store) {
	tok := r.URL.Query().Get("token")
	if token == "" || subtle.ConstantTimeCompare([]byte(tok), []byte(token)) != 1 {
		writeInstallErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	if kind == "" || name == "" {
		writeInstallErr(w, http.StatusBadRequest, "kind and name are required")
		return
	}
	rec, ok := store.get(kind + ":" + name)
	if !ok {
		// No record means the workflow hasn't started (panel polled before
		// kick-off finished?) or ksedge restarted mid-install. Either way
		// we hand back a synthesised 'unknown' state so the panel can
		// distinguish "still no answer" from "edge dropped it".
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":    true,
			"state": "unknown",
		})
		return
	}
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":         true,
		"state":      rec.state,
		"steps":      rec.steps,
		"error":      rec.err,
		"started_at": rec.start,
		"ended_at":   rec.end,
	})
}

func writeInstallErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": msg})
}

// StopInput is the body of POST /api/edge/install/stop. Kind+Name resolve the
// workflow record key (same <kind>:<name> the install start used);
// StopCommand is an optional shell command run INSIDE the workload after the
// cancel signal fires — the operator's template-level "stop_command" field.
// We run it through the same driver.Exec the install engine uses (tty=false,
// /bin/sh -lc) so it rides the existing piped stdout/stderr capture and the
// isContainerNotRunningErr retry path, just stripped to one shot.
//
// StopMode controls how the stop_command is delivered:
//   - "different" (default): exec a new shell with the stop_command (existing behavior)
//   - "same": write stop_command + newline to the running step's stdin pipe,
//     letting the live process read it (e.g. Minecraft server reads "stop" from console).
type StopInput struct {
	Token       string `json:"token"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	StopCommand string `json:"stop_command,omitempty"`
	StopMode    string `json:"stop_mode,omitempty"` // "same" | "different" (default)
}

// handleInstallStop cancels a running workflow for the request's kind+name and,
// when supplied, runs the stop_command once inside the container. The cancel
// is best-effort and idempotent (the workflow goroutine ignores a repeated
// cancel), and the stop_command's exit code is returned to the panel so the
// operator can see whether their cleanup ran cleanly.
//
// Errors: 401 on token mismatch, 400 on missing name/kind, 404 when the edge
// has no workflow record at all (nothing is running — the panel then treats
// the stop success as "workflow already resolved"). The 404 keeps the
// operator's stop button responsive when a workflow finished between the page
// render and the click; the panel maps unknown→no-op on its end too.
func handleInstallStop(w http.ResponseWriter, r *http.Request, token string, store *store) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeInstallErr(w, http.StatusBadRequest, "read body: "+err.Error())
		return
	}
	var in StopInput
	if err := json.Unmarshal(raw, &in); err != nil {
		writeInstallErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
		return
	}
	if token == "" || subtle.ConstantTimeCompare([]byte(in.Token), []byte(token)) != 1 {
		writeInstallErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	if in.Kind == "" || in.Name == "" {
		writeInstallErr(w, http.StatusBadRequest, "kind and name are required")
		return
	}
	key := in.Kind + ":" + in.Name

	// Default stop mode to "different" (existing behavior: exec a separate shell)
	stopMode := in.StopMode
	if stopMode == "" {
		stopMode = "different"
	}
	// Same-terminal delivery writes the stop_command into the running step's
	// stdin — without a command there is nothing to inject, so "same"
	// degenerates to a plain cancel. Falling through (instead of answering
	// state:"") matters because the panel's StopActionHandler always sends a
	// StopMode even for actions with no stop_command; skipping store.Stop
	// here left those workflows running forever while the UI showed stopped.
	if stopMode == "same" && strings.TrimSpace(in.StopCommand) == "" {
		stopMode = "different"
	}

	// For "same" terminal mode: write stop_command to the running step's stdin
	// instead of exec'ing a new shell. We do NOT call store.Stop (which fires
	// the context cancel) because we want the process to read "stop\n" from
	// its console and exit naturally. The install engine will see the exit and
	// complete the step normally.
	var prev string
	var stopStdout, stopStderr string
	var stopCode int
	var stopErr string

	if stopMode == "same" && strings.TrimSpace(in.StopCommand) != "" {
		// Same-terminal: write to the running step's stdin pipe
		stdin := store.getStdinWriter(key)
		if stdin != nil {
			// Write stop command + newline to the process's stdin
			_, err := stdin.Write([]byte(in.StopCommand + "\n"))
			if err != nil {
				stopErr = "write to stdin failed: " + err.Error()
			} else {
				// Don't cancel - let the process read "stop" and exit naturally
				// The engine will capture the exit and complete the workflow
				prev = "running" // workflow still running, will complete shortly
			}
		} else {
			// Fallback: no stdin writer available, fall back to different mode
			stopMode = "different"
		}
	}

	if stopMode == "different" {
		// Different-terminal: cancel workflow + exec stop_command as separate shell
		prev = store.Stop(key)

		// Run the optional stop_command inside the container. We reuse the
		// install handler's execFn shape (drain stdout+stderr concurrently,
		// isContainerNotRunningErr one-shot retry) so the behavior matches a
		// single-step `shell` install action. A missing driver kind or empty
		// stop_command silently skips the exec — the panel already marked the
		// workflow cancelled.
		if strings.TrimSpace(in.StopCommand) != "" {
			// If the workflow has already finalised (state=done/failed),
			// the container is most likely torn down or in transition —
			// running stop_command would burn the full 5-minute execFn
			// budget on a doomed `docker exec` against a stopped container
			// and time out at the panel's 60s HTTP client. The panel's
			// StopActionHandler treats the response the same way whether
			// or not we run stop_command when prev is already finalised,
			// so skip the exec and just hand back the prior state. The
			// installSweepLoop's lifecycle{stop} has already (or will
			// shortly) torn down the container anyway.
			if prev != StateRunning {
				stopErr = "workflow already finalised (state=" + prev + "); skipping stop_command"
			} else {
				drv, ok := drivers.Registry[in.Kind]
				if !ok {
					writeJSONInstallStop(w, prev, stopCode, "", fmt.Sprintf("unknown driver kind: %s", in.Kind), "")
					return
				}
				execFn := buildExecFn(drv, in.Name)
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
				stopStdout, stopStderr, stopCode, err = execFn(ctx, []string{"/bin/sh", "-lc", in.StopCommand})
				cancel()
			}
		}
		if err != nil {
			stopErr = err.Error()
		}
	}

	writeJSONInstallStop(w, prev, stopCode, stopStdout, stopErr, stopStderr)
}

func writeJSONInstallStop(w http.ResponseWriter, state string, code int, stdout, errStr, stderr string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":        true,
		"state":     state,
		"exit_code": code,
		"stdout":    stdout,
		"stderr":    stderr,
		"error":     errStr,
	})
}

// buildExecFn constructs the same ExecFn handleInstallStart uses (concurrent
// stdout/stderr drain + the isContainerNotRunningErr retry that absorbs the
// post-deploy "container not scheduled yet" window). Factored out so the stop
// handler gets the identical pipe-deadlock-safe plumbing the install path has
// already battle-tested.
func buildExecFn(drv drivers.Driver, name string) func(ctx context.Context, command []string) (string, string, int, error) {
	return func(ctx context.Context, command []string) (string, string, int, error) {
		driverExec := func() (*drivers.ExecSession, error) {
			return drv.Exec(ctx, name, false, 0, 0, command)
		}
		var sess *drivers.ExecSession
		var err error
		const maxAttempts = 30
		for attempt := 0; attempt < maxAttempts; attempt++ {
			sess, err = driverExec()
			if err == nil {
				break
			}
			if !isContainerNotRunningErr(err) {
				return "", "", -1, err
			}
			select {
			case <-ctx.Done():
				return "", "", -1, ctx.Err()
			case <-time.After(time.Second):
			}
		}
		if err != nil {
			return "", "", -1, fmt.Errorf("container did not become ready within %ds: %w", maxAttempts, err)
		}
		defer sess.Close()
		stdoutCh := make(chan []byte, 1)
		stderrCh := make(chan []byte, 1)
		go func() { b, _ := io.ReadAll(sess.Stdout); stdoutCh <- b }()
		go func() { b, _ := io.ReadAll(sess.Stderr); stderrCh <- b }()
		stdout := <-stdoutCh
		stderr := <-stderrCh
		code, _ := sess.Wait()
		return string(stdout), string(stderr), code, nil
	}
}

// firstLine returns the first non-empty line of s. Used to extract a short,
// panel-friendly failure reason out of a verbose stderr transcript.
func firstLine(s string) string {
	for _, ln := range strings.Split(s, "\n") {
		if ln = strings.TrimSpace(ln); ln != "" {
			return ln
		}
	}
	return s
}

// isContainerNotRunningErr reports whether `err` looks like the docker
// daemon saying the target container isn't running. This is the failure
// mode the install workflow hits when the deploy RPC just returned and the
// container's main process hasn't been scheduled yet (cold-cache image
// pull, transient "created" / "restarting" window). We match against the
// docker daemon's two known phrasings — modern (Engine 20.10+):
// "container <id> is not running"; older: "Container <id> is not running".
// Anything else (bad command, missing binary inside the image, OOM, etc.)
// is treated as a real failure and surfaced immediately so the operator
// isn't waiting 30s on a script that will never succeed.
func isContainerNotRunningErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "is not running") && strings.Contains(msg, "container")
}
