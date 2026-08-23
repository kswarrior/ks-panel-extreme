// Package execrpc exposes the one-shot HTTP exec endpoint on ksedge that the
// panel calls for automation jobs and process kills. It is distinct from the
// internal/exec WebSocket terminal bridge: where that package streams an
// interactive shell to the browser over WS, this one runs a single command
// inside a workload, captures its stdout/stderr/exit-code, and returns them
// as a single JSON envelope. The panel's edge.Client.Exec posts to it.
//
// The panel is the only caller and carries the same shared token every other
// edge RPC uses; we compare it constant-time so the wire path can't be
// probed for length-timing leaks. The command and any requested environment
// are injected into a fresh /bin/sh -c invocation via the driver's Exec
// (non-TTY pipe mode), so the same gathered-shell path the inspect helpers
// already use serves us. Env is exported at the top of the script because the
// Driver.Exec interface has no env hook (docker exec would need per-run -e
// flags; sh-level export keeps the code path identical across docker/lxd/
// multipass/kvm).
package execrpc

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/example/ksedge/internal/drivers"
	"github.com/example/ksedge/internal/execstage"
)

// Request matches the wire format the panel's edge.ExecRequest emits.
// Command is a single shell string the edge runs through /bin/sh -c; Env is
// an optional map of variables to export at the top of that script so an
// automation job can reference vaulted secrets without hard-coding them.
// Files optionally stages {path,content} entries into a fresh temp dir the
// command starts in (application runs). TimeoutSec caps the run; 0 means
// "use the edge default" (5 minutes), the same convention the panel's edge
// client documents.
type Request struct {
	Token      string            `json:"token"`
	Action     string            `json:"action"` // "exec" (kept for symmetry)
	Kind       string            `json:"kind"`
	Name       string            `json:"name"`
	Command    string            `json:"command"`
	Env        map[string]string `json:"env,omitempty"`
	Files      []execstage.File  `json:"files,omitempty"`
	TimeoutSec int               `json:"timeout_sec,omitempty"`
}

// Response carries the captured process I/O. The shape mirrors the panel's
// edge.ExecResponse field-for-field so the panel decode path is unchanged.
type Response struct {
	OK       bool   `json:"ok"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error,omitempty"`
}

// defaultTimeout caps how long the edge lets a one-shot exec run when the
// panel didn't supply one. Five minutes matches the lifecycle RPC budget and
// is comfortably longer than any reasonable backup/cron job while still
// bounding a wedged shell. The panel may send a larger value, which we clamp
// to maxTimeout so a typo can't pin a goroutine for an hour.
const (
	defaultTimeout = 5 * time.Minute
	maxTimeout     = 30 * time.Minute
)

// Handler returns an http.HandlerFunc authenticated by the given edge token.
// The model follows the lifecycle/inspect handlers exactly: POST-only, JSON
// body, 200 + {ok:false,error:...} on any failure so the panel's single
// "did the edge accept" signal lives in the body rather than the status.
func Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}
		if token == "" || subtle.ConstantTimeCompare([]byte(req.Token), []byte(token)) != 1 {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		drv, ok := drivers.Registry[req.Kind]
		if !ok {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("unknown driver kind: %s", req.Kind))
			return
		}
		if req.Name == "" {
			writeErr(w, http.StatusBadRequest, "instance name is required")
			return
		}
		if strings.TrimSpace(req.Command) == "" {
			writeErr(w, http.StatusBadRequest, "command is required")
			return
		}

		timeout := defaultTimeout
		if req.TimeoutSec > 0 {
			timeout = time.Duration(req.TimeoutSec) * time.Second
		}
		if timeout > maxTimeout {
			timeout = maxTimeout
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()

		// Build the /bin/sh program via the shared staging package: env
		// exports, optional file staging into a fresh temp dir, then the
		// command. Keys are restricted to shell-safe identifiers, values
		// are single-quote escaped and file contents travel inside quoted
		// heredocs so a hostile payload can't break out of the script.
		script, serr := execstage.Script(req.Env, req.Files, req.Command)
		if serr != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: serr.Error()})
			return
		}

		sess, err := drv.Exec(ctx, req.Name, false, 0, 0, []string{"/bin/sh", "-c", script})
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: err.Error()})
			return
		}
		defer sess.Close()
		// No stdin: close it so a readerless shell exits when its input
		// stream is probed instead of blocking on a read.
		if sess.Stdin != nil {
			_ = sess.Stdin.Close()
		}

		// Drain stdout and stderr CONCURRENTLY into separate buffers. Reading
		// them sequentially is the textbook pipe-deadlock the install package
		// hit in production (a 64KB stderr buffer fills, the child blocks
		// writing, never writes the rest of stdout, and io.ReadAll on stdout
		// parks forever). Fan both reads to goroutines and join them so
		// neither side can wedge the other; the panel records the two streams
		// into separate columns, so we keep them apart rather than merging.
		type readResult struct {
			b   []byte
			err error
		}
		stdoutCh := make(chan readResult, 1)
		stderrCh := make(chan readResult, 1)
		go func() {
			b, err := io.ReadAll(sess.Stdout)
			stdoutCh <- readResult{b, err}
		}()
		go func() {
			b, err := io.ReadAll(sess.Stderr)
			stderrCh <- readResult{b, err}
		}()
		stdoutRes := <-stdoutCh
		// Drain stderr before Wait(): the channel slot buffers it so the
		// child's stderr pipe never fills and wedges stdout.
		stderrRes := <-stderrCh
		exitCode := 0
		if code, werr := sess.Wait(); werr != nil {
			// A non-zero exit is a normal script outcome, not an edge error;
			// surface the code and append any wait-time error to stderr so the
			// panel's run row shows both the program's output and the fact the
			// process didn't exit cleanly.
			exitCode = code
			if stderrRes.err == nil && werr != io.EOF {
				stderrRes.b = append(stderrRes.b, []byte("\n"+werr.Error())...)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{
			OK:       true,
			Stdout:   string(stdoutRes.b),
			Stderr:   string(stderrRes.b),
			ExitCode: exitCode,
		})
	})
}

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status.
// Kept uniform with the lifecycle/inspect handlers so the panel's single
// decode path covers auth failures, bad input, and driver errors alike.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
