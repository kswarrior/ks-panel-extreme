// Package hostexec exposes the one-shot host-level exec endpoint on ksedge
// that the panel calls when an application run targets the HOST itself
// rather than a container/VM workload. It is the host-filesystem sibling of
// internal/execrpc: same token gate, same JSON envelope, same timeout
// clamps — but the /bin/sh -c program runs directly on the edge host as the
// ksedge process user, with the request's script files staged into a fresh
// temp dir (via internal/execstage) that is removed when the command ends.
//
// The panel only reaches this path for explicit "host" exec-mode runs, so
// an operator pressing Run on the panel host or on a node's host gets the
// script executed in that machine's own namespace.
package hostexec

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"time"

	"github.com/example/ksedge/internal/execstage"
)

// Request matches the wire format the panel's edge.HostExecRequest emits.
type Request struct {
	Token      string            `json:"token"`
	Command    string            `json:"command"`
	Env        map[string]string `json:"env,omitempty"`
	Files      []execstage.File  `json:"files,omitempty"`
	TimeoutSec int               `json:"timeout_sec,omitempty"`
}

// Response carries the captured process I/O. The shape mirrors execrpc's
// Response so the panel decode path stays uniform.
type Response struct {
	OK       bool   `json:"ok"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error,omitempty"`
}

// Timeout budget identical to execrpc: five minutes by default, thirty at
// the ceiling so a typo can't pin a goroutine for an hour.
const (
	defaultTimeout = 5 * time.Minute
	maxTimeout     = 30 * time.Minute
)

// Handler returns an http.HandlerFunc authenticated by the given edge token,
// mirroring the lifecycle/execrpc handlers exactly: POST-only, JSON body,
// structured {ok,error} responses.
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
		if len(req.Command) == 0 || len(req.Command) > 64<<10 {
			writeErr(w, http.StatusBadRequest, "command is required (max 64 KiB)")
			return
		}

		script, serr := execstage.Script(req.Env, req.Files, req.Command)
		if serr != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: serr.Error()})
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

		cmd := exec.CommandContext(ctx, "/bin/sh", "-c", script)
		stdout, perr := cmd.StdoutPipe()
		if perr != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: perr.Error()})
			return
		}
		stderr, perr := cmd.StderrPipe()
		if perr != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: perr.Error()})
			return
		}
		if err := cmd.Start(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: err.Error()})
			return
		}

		// Drain both pipes CONCURRENTLY — the same pipe-deadlock avoidance
		// execrpc documents (a full stderr buffer wedges stdout otherwise).
		type readResult struct {
			b   []byte
			err error
		}
		stdoutCh := make(chan readResult, 1)
		stderrCh := make(chan readResult, 1)
		go func() {
			b, err := io.ReadAll(stdout)
			stdoutCh <- readResult{b, err}
		}()
		go func() {
			b, err := io.ReadAll(stderr)
			stderrCh <- readResult{b, err}
		}()
		stdoutRes := <-stdoutCh
		stderrRes := <-stderrCh

		exitCode := 0
		if werr := cmd.Wait(); werr != nil {
			if ee, ok := werr.(*exec.ExitError); ok && ee.ExitCode() >= 0 {
				exitCode = ee.ExitCode()
			} else if ctx.Err() != nil {
				// Timed out or the client went away — report it explicitly
				// instead of surfacing a bare "signal: killed".
				stderrRes.b = append(stderrRes.b, []byte("\nrun exceeded the timeout and was killed")...)
				exitCode = 124 // conventional timeout exit code
			} else {
				stderrRes.b = append(stderrRes.b, []byte("\n"+werr.Error())...)
				exitCode = -1
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

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status,
// uniform with every other edge RPC so one panel decode path covers all.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
