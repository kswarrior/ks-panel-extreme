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
)

// Request matches the wire format the panel's edge.ExecRequest emits.
// Command is a single shell string the edge runs through /bin/sh -c; Env is
// an optional map of variables to export at the top of that script so an
// automation job can reference vaulted secrets without hard-coding them.
// TimeoutSec caps the run; 0 means "use the edge default" (5 minutes), the
// same convention the panel's edge client documents.
type Request struct {
	Token      string            `json:"token"`
	Action     string            `json:"action"` // "exec" (kept for symmetry)
	Kind       string            `json:"kind"`
	Name       string            `json:"name"`
	Command    string            `json:"command"`
	Env        map[string]string `json:"env,omitempty"`
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

		// Fold the requested env into the shell script: exporting at the top
		// of the /bin/sh -c invocation keeps every driver on the same path
		// (no per-driver -e flag plumbing) and lets a job reference vaulted
		// secrets by name. Keys are restricted to shell-safe identifiers so a
		// hostile key can't terminate the export block early; values are
		// single-quoted with embedded quotes escaped.
		script := buildScript(req.Env, req.Command)

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

// buildScript returns a /bin/sh -c script that exports the requested env and
// then runs command. Keys are validated against the POSIX env-var identifier
// rule ([A-Za-z_][A-Za-z0-9_]*) so a malformed key can't inject shell markup;
// values are single-quoted, with embedded single quotes escaped as '\”
// (closing the quote, escaping the literal, reopening). The trailing newline
// guarantees the export block stays a separate statement from `command` even
// when command starts on the same logical line.
func buildScript(env map[string]string, command string) string {
	var b strings.Builder
	for k, v := range env {
		if !isEnvName(k) {
			continue
		}
		b.WriteString("export ")
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteByte('\'')
		b.WriteString(strings.ReplaceAll(v, "'", "'\\''"))
		b.WriteString("'\n")
	}
	b.WriteString(command)
	return b.String()
}

// isEnvName reports whether s is a valid POSIX env-var identifier. We accept
// the leading-underscore-but-not-digit rule so the export line can't be
// subverted by a key that the shell would re-tokenise.
func isEnvName(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r == '_' {
			continue
		}
		if r < 'A' || (r > 'Z' && r < 'a') || r > 'z' {
			if r < '0' || r > '9' || i == 0 {
				return false
			}
		}
	}
	return true
}

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status.
// Kept uniform with the lifecycle/inspect handlers so the panel's single
// decode path covers auth failures, bad input, and driver errors alike.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
