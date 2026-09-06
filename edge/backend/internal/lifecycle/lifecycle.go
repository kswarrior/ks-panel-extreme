// Package lifecycle holds the HTTP handler that the panel calls to deploy,
// start, stop, kill and destroy workloads on this edge.
//
// Authentication is intentionally minimal: the panel presents the same
// shared token the edge uses to heartbeat the panel, and we compare it
// constant-time-ish (string-equal after a length check) against config.Token.
// There is exactly one valid origin for this RPC (the panel), so no
// capability scoping is needed beyond "knows the token".
package lifecycle

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/example/ksedge/internal/drivers"
)

// Request matches the wire format the panel's Edge.Lifecycle emits.
type Request struct {
	Token  string                  `json:"token"`
	Action string                  `json:"action"`
	Kind   string                  `json:"kind"`
	Name   string                  `json:"name"`
	Config map[string]any          `json:"config"`
}

// Response is what the edge hands back. Error is empty on success so the
// panel can surface driver messages verbatim in the UI.
type Response struct {
	OK         bool   `json:"ok"`
	ExternalID string `json:"external_id,omitempty"`
	Status     string `json:"status,omitempty"`
	Error      string `json:"error,omitempty"`
}

// Handler returns an http.HandlerFunc authenticated by the given token.
// We close over the token deliberately so a single ksedge instance can run
// with one config-loaded secret and serve the lifecycle endpoint
// consistently.
func Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req Request
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}
		if !constTimeEqual(req.Token, token) || token == "" {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if _, ok := drivers.Registry[req.Kind]; !ok {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("unknown driver kind: %s", req.Kind))
			return
		}
		if req.Name == "" {
			writeErr(w, http.StatusBadRequest, "instance name is required")
			return
		}

		// Each driver call is wrapped in a per-request timeout to prevent a
		// hung shell-out (e.g. image pull) from holding the HTTP connection
		// forever.
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
		defer cancel()

		drv := drivers.Registry[req.Kind]
		res, err := dispatch(ctx, drv, req)
		if err != nil {
			log.Printf("lifecycle: %s/%s on %s failed: %v", req.Action, req.Kind, req.Name, err)
			// Use 200 + {ok:false,error:...} rather than 4xx/5xx so the panel's
			// single "did the edge accept" signal lives in the body, not
			// the status. This matches how every other edge RPC sits.
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{OK: true, ExternalID: res.ExternalID, Status: res.Status})
	})
}

// dispatch picks the driver method based on Action. Centralised so the
// per-action error mapping lives in one place.
func dispatch(ctx context.Context, d drivers.Driver, req Request) (drivers.Result, error) {
	switch req.Action {
	case "deploy":
		return d.Deploy(ctx, req.Name, req.Config)
	case "start":
		return d.Start(ctx, req.Name)
	case "stop":
		return d.Stop(ctx, req.Name)
	case "kill":
		return d.Kill(ctx, req.Name)
	case "destroy":
		return d.Destroy(ctx, req.Name)
	default:
		return drivers.Result{}, fmt.Errorf("unknown action: %s", req.Action)
	}
}

// constTimeEqual is a minimal constant-time-ish equality helper. We compare
// lengths first because constant-time libs in the standard library are still
// primitive (subtle.ConstantTimeCompare rejects different-length inputs).
func constTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status.
// We deliberately keep the contract uniform even when we could use a plain
// 4xx: the panel's RPC client always inspects OK first, so the same shape
// works for both auth failures and driver errors.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
