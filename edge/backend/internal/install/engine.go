// Package install implements the post-deploy "install workflow" that runs
// inside a freshly-deployed workload (a docker container today, lxd/kvm/
// multipass tomorrow via the same Driver.Exec contract).
//
// The panel captures the operator-authored spec.install[] workflow in the
// TemplateForm UI (download / extract / write / chmod / move / mkdir /
// git_clone / pip_install / npm_install / shell / http_check steps), ships
// it verbatim to the edge as part of the deploy-request sibling RPC, and the
// edge interprets it here. Before this package existed, the ONLY way to
// bootstrap a container was to cram everything into the single `command`
// field of the template spec — which produced the giant unreadable
// `sh -lc '<...everything...>'` blob of the canned Minecraft template and
// gave the operator no per-step status, no retries and no visibility into
// what actually failed.
//
// Design:
//
//   - The interpreter does NOT know about docker / lxd / kvm. It speaks
//     exclusively through drivers.Driver.Exec(name, tty=false, …), so the
//     same install pipeline works for a docker container or a KVM guest once
//     the matching driver ships a non-tty Exec implementation. That keeps the
//     install surface uniform across backends and avoids reintroducing the
//     shell-out layer the drivers already encapsulate.
//
//   - Every step compiles to a single `sh -lc '<script>'` invocation executed
//     inside the workload. That's deliberate: doing downloads/extracts/chmods
//     via the container's own /usr/bin/curl, tar, chmod means the install
//     only depends on tools already present in the image the operator
//     picked — we never reach for `os/exec` on the edge host outside the
//     container, and we never assume the edge has curl/tar/git portably
//     installed. The one exception is `http_check` which dials from the edge
//     host (to surface a "the workload's port came up" signal that does not
//     depend on curl being in the image).
//
//   - Failures degrade gracefully per the per-step flags the operator set in
//     the UI: `retries` re-runs the whole step up to N times with a backoff,
//     `ignore_errors` turns a non-zero exit into a "skipped-but-continued"
//     result rather than aborting the workflow. A step that fails without
//     ignore_errors aborts the whole workflow and the failure surfaces on the
//     instance row through the panel's install poller.
package install

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"
)

// Step is one entry of the spec.install[] array the panel forwards. The
// field names match the JSON the frontend TemplateForm serialises 1:1 so the
// edge can decode the panel's payload opaquely — we never re-type the spec
// on the panel side beyond "valid JSON". Not every field is used by every
// action; e.g. `url`+`filename` for download, `path`+`content` for write,
// `archive`+`dest` for extract, `command` for shell/chmod/pip/npm, `dest`
// and `branch` for git_clone. The interpreter ignores irrelevant fields for
// a given action so a misconfigured step degrades rather than crashing.
type Step struct {
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

// SessionExecFn is like ExecFn but returns the full ExecSession so the
// engine can drain stdout/stderr and keep the stdin writer for same-terminal
// stop mode. The caller must call sess.Close() when done.
type SessionExecFn func(ctx context.Context, command []string) (sess *ExecSession, err error)

// ExecSession mirrors the driver's ExecSession but without the driver
// dependency. The engine uses this for KeepStdin mode.
type ExecSession struct {
	Stdin  io.WriteCloser
	Stdout io.ReadCloser
	Stderr io.ReadCloser
	Wait   func() (int, error)
	Close  func() error
}

// Input is the body of the panel's POST /api/edge/install. Steps is the
// workflow, EnvVars carries the resolved KEY=VALUE pairs (with the operator's
// per-deploy prompts, env-var `rule` validation and append/prepend applied
// on the panel side already) so the interpreter can substitute {{KEY}}
// placeholders inside step strings — the same templating syntax the
// TemplateForm's placeholders hint at ({{RAM}}, {{WORLD}} …).
//
// When KeepStdin is true, the engine uses the optional SessionExecFn instead
// of ExecFn so the running step's stdin remains writable. The edge stores
// the current step's stdin writer in the workflow record, which the stop
// handler can later access to inject a stop command (e.g. "stop\n") into the
// live process's console instead of exec'ing a separate shell.
type Input struct {
	Token     string            `json:"token"`
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	Steps     []Step            `json:"steps"`
	EnvVars   map[string]string `json:"env_vars,omitempty"`
	KeepStdin bool              `json:"keep_stdin,omitempty"`
	// TimeoutSec caps the WHOLE workflow (all steps + retries), not just one
	// exec. The HTTP handler turns it into the workflow context deadline:
	//   > 0 → hard deadline of that many seconds,
	//   < 0 → no deadline at all (long-running template actions that keep a
	//         server alive until the operator clicks Stop),
	//   = 0 → the legacy 30-minute default so panels that don't send the
	//         field keep today's safety net.
	TimeoutSec int `json:"timeout_sec,omitempty"`
	// OnProgress, when non-nil, is called with a snapshot of the step
	// transcript every time a step's status changes (start / retry outcome /
	// completion). The HTTP handler uses it to publish LIVE per-step state
	// into the poll record — without it the record only carries the final
	// transcript when the whole workflow returns, and every mid-run poll
	// shows all steps stuck on "pending" (the panel's install_step stays -1
	// and no progress banner can render). The callback runs on the workflow
	// goroutine; implementors must make their store thread-safe.
	OnProgress  func([]StepStatus) `json:"-"`
	SessionExec SessionExecFn      `json:"-"`
}

// StepStatus is the per-step result the panel polls back. The shape mirrors
// the TemplateForm's UI rows so the frontend can render the schedule line
// for line without translation.
type StepStatus struct {
	Index     int       `json:"index"`
	Action    string    `json:"action"`
	Status    string    `json:"status"`
	Attempt   int       `json:"attempt"`
	ExitCode  int       `json:"exit_code"`
	Stdout    string    `json:"stdout"`
	Stderr    string    `json:"stderr"`
	StartedAt time.Time `json:"started_at"`
	EndedAt   time.Time `json:"ended_at,omitempty"`
}

// RunState is the workflow-level state surfaced to the panel.
const (
	StateRunning = "running"
	StateDone    = "done"
	StateFailed  = "failed"
)

// stepStatus values mirrored in StepStatus.Status.
const (
	stepPending  = "pending"
	stepRunning  = "running"
	stepDone     = "done"
	stepSkipped  = "skipped"
	stepFailed   = "failed"
	stepNonfatal = "nonfatal" // ignore_errors swallowed the failure
)

// ExecFn is the contract the engine uses to run a command inside the
// workload. Lifecycle / drivers wire their Driver.Exec into this shape; the
// engine stays driver-agnostic. Returning combined output + exit code keeps
// the interpreter responsible only for orchestration + retries, never for
// stream plumbing (the drivers already own that).
type ExecFn func(ctx context.Context, command []string) (stdout, stderr string, exitCode int, err error)

// Run executes the workflow synchronously and returns the final state + the
// per-step transcript. The HTTP layer wraps this in a goroutine so the RPC
// stays non-blocking; calling Run directly is also fine (tests do exactly
// that) since it has no external dependencies beyond the supplied ExecFn.
//
// ctx is propagated into every step so a caller that wants a hard cap
// (lifecycle's 5-minute envelope, the panel's install-poll timeout) can
// cancel mid-step and the running exec gets torn down through the driver's
// context plumbing.
//
// When in.KeepStdin is true and in.SessionExec is provided, the engine uses
// the session-aware exec path so the running step's stdin remains writable.
// The engine exposes the current step's stdin writer via the optional
// onStdin callback (if the caller wants to capture it for later stop writes).
func Run(ctx context.Context, in Input, exec ExecFn, onStdin func(io.WriteCloser)) (string, []StepStatus) {
	return runCore(ctx, in, exec, onStdin)
}

// RunWithStdin is like Run but accepts an optional onStdin callback that
// receives the current step's stdin writer when KeepStdin+SessionExec are
// active. The edge handler uses this to stash the writer in the workflow
// record so the stop handler can write to it (same-terminal stop mode).
func RunWithStdin(ctx context.Context, in Input, exec ExecFn, onStdin func(io.WriteCloser)) (string, []StepStatus) {
	return runCore(ctx, in, exec, onStdin)
}

func runCore(ctx context.Context, in Input, exec ExecFn, onStdin func(io.WriteCloser)) (string, []StepStatus) {
	steps := make([]StepStatus, len(in.Steps))
	for i := range in.Steps {
		steps[i] = StepStatus{Index: i, Action: in.Steps[i].Action, Status: stepPending}
	}
	// publish pushes a copy of the current transcript to the optional
	// OnProgress hook so mid-run polls see live per-step state instead of a
	// frozen "all pending" snapshot.
	publish := func() {
		if in.OnProgress == nil {
			return
		}
		snapshot := make([]StepStatus, len(steps))
		copy(snapshot, steps)
		in.OnProgress(snapshot)
	}

	for i, step := range in.Steps {
		select {
		case <-ctx.Done():
			steps[i].Status = stepFailed
			steps[i].Stderr = "install workflow cancelled: " + ctx.Err().Error()
			return StateFailed, steps
		default:
		}

		steps[i].Status = stepRunning
		steps[i].StartedAt = time.Now()
		publish()

		// Max retries defaults to 0 (one shot) unless the operator set it.
		// A non-numeric / negative value silently clamps to 0 so a typo
		// doesn't loop forever.
		retries := clampInt(step.Retries, 0)

		var res StepStatus
		// We re-run the WHOLE step on retry (not just the failing cmd)
		// because some steps are stateful (download then extract chained in
		// one script) and a half-applied attempt would poison the next.
		var attempt int
		for attempt = 0; attempt <= retries; attempt++ {
			steps[i].Attempt = attempt
			script, err := compileStep(step, in.EnvVars)
			if err != nil {
				// A compile error is a hard "the operator authored a bad
				// step" — re-running won't fix it. Don't waste the retry
				// budget; surface the message and break.
				res = StepStatus{Index: i, Action: step.Action, Status: stepFailed,
					Attempt: attempt, ExitCode: -1,
					Stderr:    "compile step: " + err.Error(),
					StartedAt: steps[i].StartedAt, EndedAt: time.Now()}
				steps[i] = res
				publish()
				break
			}

			var stdout, stderr string
			var code int
			var execErr error

			// If KeepStdin + SessionExec provided, use the session-aware path
			// which keeps the stdin writer open for the stop handler.
			if in.KeepStdin && in.SessionExec != nil {
				sess, sessErr := in.SessionExec(ctx, []string{"/bin/sh", "-lc", script})
				if sessErr != nil {
					execErr = sessErr
				} else {
					// Expose stdin to the handler (if callback provided)
					if onStdin != nil {
						onStdin(sess.Stdin)
					}
					// Drain stdout/stderr concurrently like buildExecFn does
					stdoutCh := make(chan string, 1)
					stderrCh := make(chan string, 1)
					go func() {
						b, _ := io.ReadAll(sess.Stdout)
						stdoutCh <- string(b)
					}()
					go func() {
						b, _ := io.ReadAll(sess.Stderr)
						stderrCh <- string(b)
					}()
					// Wait for process exit
					code, execErr = sess.Wait()
					stdout = <-stdoutCh
					stderr = <-stderrCh
					// Close session
					sess.Close()
				}
			} else {
				stdout, stderr, code, execErr = exec(ctx, []string{"/bin/sh", "-lc", script})
			}

			res = StepStatus{Index: i, Action: step.Action,
				Status: stepDone, Attempt: attempt, ExitCode: code,
				Stdout: stdout, Stderr: stderr,
				StartedAt: steps[i].StartedAt, EndedAt: time.Now()}
			if execErr == nil && code == 0 {
				res.Status = stepDone
				break
			}
			// Non-zero. Decide: retry, swallow, or fail.
			if attempt < retries {
				// Backoff between retries so a flaky download / briefly
				// unreachable registry has a chance to recover without
				// hammering it. 2<<attempt with attempt=0..9 yields
				// 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 512s — the
				// first attempts are short (operator is watching), later
				// ones back off exponentially (we're willing to wait).
				select {
				case <-ctx.Done():
					res = StepStatus{Index: i, Action: step.Action, Status: stepFailed,
						Attempt: attempt, ExitCode: -1,
						Stderr:    "install workflow cancelled: " + ctx.Err().Error(),
						StartedAt: steps[i].StartedAt, EndedAt: time.Now()}
					steps[i] = res
					publish()
					return StateFailed, steps
				case <-time.After(time.Duration(2<<attempt) * time.Second):
				}
				continue
			}
			if step.IgnoreErrors {
				res.Status = stepNonfatal
			} else {
				res.Status = stepFailed
			}
			if execErr != nil {
				res.Stderr = stderr + "\n" + execErr.Error()
			}
			steps[i] = res
			publish()
			break
		}
		// Persist the last attempt's transcript (retries>0 path overwrites
		// steps[i] in-loop; the success path needs the assignment here).
		if res.Status == stepDone {
			steps[i] = res
			publish()
		}

		if steps[i].Status == stepFailed {
			return StateFailed, steps
		}
		// stepNonfatal: continue to next step (the operator opted in via
		// ignore_errors).
	}
	return StateDone, steps
}

// compileStep turns one Step into the `sh -lc '<script>'` blob the engine
// runs inside the workload. Each action maps to a tiny, portable POSIX
// snippet — we deliberately use only tools that ship in the base images
// operators actually pick (curl/wget, tar, mkdir, chmod, cp/mv, git when
// present, pip when python is present). The compiler does NOT validate that
// those tools exist; the failing step's stderr will say so, which is the
// honest failure mode.
//
// We {{KEY}}-substitute env vars on every string field of the step so an
// operator can keep a single template that does e.g. `java -Xmx{{RAM}}M`
// without baking the value in.
func compileStep(s Step, env map[string]string) (string, error) {
	sub := func(v string) string { return substitute(v, env) }

	switch strings.ToLower(strings.TrimSpace(s.Action)) {
	case "shell":
		return sub(s.Command), nil

	case "download":
		if s.URL == "" || s.Filename == "" {
			return "", fmt.Errorf("download step requires both url and filename")
		}
		// Prefer curl; fall back to wget — the two cover every base image
		// the operator realistically picks (alpine ships wget; debian has
		// both). The `||` keeps the step succeeding on either.
		return strings.Join([]string{
			`set -e`,
			`if command -v curl >/dev/null 2>&1; then`,
			`  curl -fsSL --retry 3 --retry-delay 1 --connect-timeout 10 -o ` + shellQuote(sub(s.Filename)) + ` ` + shellQuote(sub(s.URL)),
			`else`,
			`  wget -q --tries=3 --timeout=10 -O ` + shellQuote(sub(s.Filename)) + ` ` + shellQuote(sub(s.URL)),
			`fi`,
		}, "\n"), nil

	case "extract":
		if s.Archive == "" || s.Dest == "" {
			return "", fmt.Errorf("extract step requires both archive and dest")
		}
		// -C dest with mkdir -p so a missing outdir doesn't fail the
		// extract. tar auto-detects gzip/bzip2/xz via -a (GNU) or -xf
		// (busybox); both honour `-C`.
		return strings.Join([]string{
			`set -e`,
			`mkdir -p ` + shellQuote(sub(s.Dest)),
			`tar -xf ` + shellQuote(sub(s.Archive)) + ` -C ` + shellQuote(sub(s.Dest)),
		}, "\n"), nil

	case "move":
		if s.From == "" || s.To == "" {
			return "", fmt.Errorf("move step requires both from and to")
		}
		// `mv -f` clobbers; `mkdir -p $(dirname)` so a deeply nested target
		// doesn't fail on missing path.
		return strings.Join([]string{
			`set -e`,
			`mkdir -p "$(dirname ` + shellQuote(sub(s.To)) + `)"`,
			`mv -f ` + shellQuote(sub(s.From)) + ` ` + shellQuote(sub(s.To)),
		}, "\n"), nil

	case "write":
		if s.Path == "" {
			return "", fmt.Errorf("write step requires path")
		}
		// Heredoc so multi-line content + quoting survive intact. We DON'T
		// evaluate $… in content — `<<'EOF'` (quoted) keeps the bytes
		// verbatim, which is what an operator writing a config file expects.
		// We still env-substitute BEFORE the heredoc so {{KEY}} placeholders
		// in the content pick up the per-deploy values. A content line equal
		// to the terminator would break out of the heredoc into shell
		// execution, so it's a compile error (same contract execstage uses).
		content := sub(s.Content)
		const marker = "KSEDGE_WRITE_EOF"
		if strings.Contains(content, "\n"+marker+"\n") ||
			strings.HasPrefix(content, marker+"\n") ||
			strings.HasSuffix(content, "\n"+marker) ||
			content == marker {
			return "", fmt.Errorf("write step for %q contains the heredoc terminator", s.Path)
		}
		return strings.Join([]string{
			`set -e`,
			`mkdir -p "$(dirname ` + shellQuote(sub(s.Path)) + `)"`,
			`cat > ` + shellQuote(sub(s.Path)) + ` <<'` + marker + `'`,
			content,
			marker,
		}, "\n"), nil

	case "chmod":
		if s.Path == "" || s.Command == "" {
			return "", fmt.Errorf("chmod step requires path and command (mode)")
		}
		mode := strings.TrimSpace(sub(s.Command))
		return strings.Join([]string{
			`set -e`,
			`chmod ` + shellQuote(mode) + ` ` + shellQuote(sub(s.Path)),
		}, "\n"), nil

	case "mkdir":
		if s.Path == "" {
			return "", fmt.Errorf("mkdir step requires path")
		}
		// Always -p: an operator flagging "Create Directory" in the form
		// expects the idempotent behaviour, not "already exists" failures.
		return strings.Join([]string{
			`set -e`,
			`mkdir -p ` + shellQuote(sub(s.Path)),
		}, "\n"), nil

	case "git_clone":
		if s.URL == "" || s.Dest == "" {
			return "", fmt.Errorf("git_clone step requires url and dest")
		}
		branch := sub(s.Branch)
		branchFlag := ""
		if strings.TrimSpace(branch) != "" {
			branchFlag = ` --branch ` + shellQuote(branch)
		}
		// --depth 1 keeps clones cheap on big repos (most install workflows
		// only need HEAD, not history). An operator who wants full history
		// can run a follow-up `shell` step with git fetch --unshallow.
		return strings.Join([]string{
			`set -e`,
			`git clone --depth 1` + branchFlag + ` ` + shellQuote(sub(s.URL)) + ` ` + shellQuote(sub(s.Dest)),
		}, "\n"), nil

	case "pip_install":
		if s.Command == "" {
			return "", fmt.Errorf("pip_install step requires command")
		}
		// `pip install` with --no-cache-dir keeps image layers small.
		return strings.Join([]string{
			`set -e`,
			`if command -v pip >/dev/null 2>&1; then pip install --no-cache-dir ` + sub(s.Command) + `;`,
			`elif command -v pip3 >/dev/null 2>&1; then pip3 install --no-cache-dir ` + sub(s.Command) + `;`,
			`else echo "pip not found in image" >&2; exit 127; fi`,
		}, "\n"), nil

	case "npm_install":
		// Empty command means "install from package.json" (the form prompt
		// says so). npm ci is preferred when package-lock is present.
		arg := strings.TrimSpace(sub(s.Command))
		if arg == "" {
			return strings.Join([]string{
				`set -e`,
				`if command -v npm >/dev/null 2>&1; then npm install;`,
				`else echo "npm not found in image" >&2; exit 127; fi`,
			}, "\n"), nil
		}
		return strings.Join([]string{
			`set -e`,
			`if command -v npm >/dev/null 2>&1; then npm install ` + arg + `;`,
			`else echo "npm not found in image" >&2; exit 127; fi`,
		}, "\n"), nil

	case "http_check":
		if s.URL == "" {
			return "", fmt.Errorf("http_check step requires url")
		}
		// This one runs INSIDE the container like the others so a server
		// that binds 127.0.0.1:8080 inside its namespace is reachable.
		// curl -fsI is enough for a HEAD probe; wget --spider is the alpine
		// fallback.
		return strings.Join([]string{
			`if command -v curl >/dev/null 2>&1; then curl -fsI --max-time 10 ` + shellQuote(sub(s.URL)) + ` >/dev/null;`,
			`else wget -q --spider --timeout=10 ` + shellQuote(sub(s.URL)) + `; fi`,
		}, "\n"), nil

	default:
		return "", fmt.Errorf("unknown install action: %q", s.Action)
	}
}

// substitute replaces every {{KEY}} occurrence on `v` with the matching
// entry from `env`. Unknown placeholders are left intact (not erased) so a
// typo in a template surfaces in the failing step's stderr rather than
// silently becoming an empty arg.
func substitute(v string, env map[string]string) string {
	if env == nil || !strings.Contains(v, "{{") {
		return v
	}
	for k, val := range env {
		v = strings.ReplaceAll(v, "{{"+k+"}}", val)
	}
	return v
}

// clampInt parses an operator-typed retry count from the spec. Negative or
// non-numeric values clamp to `def` (0 by default = one shot). Capped at 9 so
// a runaway typo (e.g. "100") doesn't loop an install for hours; retries are
// meant to absorb transient flakiness, not to mask a genuinely broken step.
func clampInt(s string, def int) int {
	n := def
	if s = strings.TrimSpace(s); s != "" {
		if v, err := parseIntLoose(s); err == nil {
			n = v
		}
	}
	if n < 0 {
		n = def
	}
	if n > 9 {
		n = 9
	}
	return n
}

// parseIntLoose accepts the JSON-decoded forms the frontend serialises.
// Numbers arrive as either a string ("3") or, occasionally, a true number —
// but Step.Retries is declared string so the panel passes it through verbatim.
func parseIntLoose(s string) (int, error) {
	var n int
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil {
		return 0, err
	}
	return n, nil
}

// shellQuote single-quotes a string so it survives the `sh -lc` exec без
// re-evaluation. Every embedded single quote gets the `'\”` escape.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
