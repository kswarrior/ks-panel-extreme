// Package inspect is the panel → ksedge client side of the /api/edge/inspect
// endpoint used by the panel’s live‑state cache for the per‑instance Processes,
// Metrics, Ports, Snapshots and Audit pages. Each read handler refreshes the
// cached live state from the edge; on edge failure it falls back to returning
// the previously cached state (if any) so the page still paints.

package inspect

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/example/ksedge/internal/drivers"
)

// Request matches the wire format the panel's edge.Inspect emits.
type Request struct {
	Token string `json:"token"`
	Kind  string `json:"kind"`
	Name  string `json:"name"`
}

// Response is what the edge hands back. Error is empty on success so the
// panel can surface driver messages verbatim in the UI.
type Response struct {
	OK        bool            `json:"ok"`
	Status    string          `json:"status,omitempty"`
	Metrics   json.RawMessage `json:"metrics,omitempty"`
	Processes json.RawMessage `json:"processes,omitempty"`
	Ports     json.RawMessage `json:"ports,omitempty"`
	Info      json.RawMessage `json:"info,omitempty"`
	Error     string          `json:"error,omitempty"`
}

// Handler returns an http.HandlerFunc authenticated by the given edge token.
// This matches the pattern used by the lifecycle/exec/files endpoints.
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

		// inspectTimeout bounds how long the edge lets a driver Runner()
		// gather live state. 5 minutes is far too long for a read-only
		// `/proc` snapshot — the panel's edge client already aborts at ~10s
		// (see edge.Client.NewWithTimeout) and serves the cached live state
		// rather than hanging the SPA. Letting the edge spend minutes per
		// inspect poll wedges the handler goroutine and stacks up leaked
		// `docker exec` children on a stuck daemon. 12s is comfortably above
		// the panel's 10s cutoff so a slow-but-healthy edge still returns
		// usable data, while a genuinely wedged driver aborts in seconds
		// instead of minutes.
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()

		drv := drivers.Registry[req.Kind]
		res, err := dispatch(ctx, drv, req)
		if err != nil {
			// Use 200 + {ok:false,error:...} rather than 4xx/5xx so the panel's
			// single "did the edge accept" signal lives in the body, not
			// the status. This matches how every other edge RPC sits.
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})
}

// dispatch picks the driver method based on the implicit "inspect" action.
// Drivers expose this via their Runner() method; the dispatcher validates
// the driver and calls it synchronously under the passed context.
func dispatch(ctx context.Context, d drivers.Driver, req Request) (Response, error) {
	// Infer driver-specific inspect runtime info: metrics, processes, ports, info.
	// The driver supplies a Runner for this purpose; it returns raw JSON blobs
	// the panel stores and renders in the UI. The panel does not use these for
	// lifecycle/start/stop; they are purely read‑only side‑channels.
	metrics, processes, ports, info, err := d.Runner(ctx, req.Name)
	if err != nil {
		return Response{OK: false, Error: err.Error()}, nil
	}
	return Response{
		OK:        true,
		Status:    getStatusFrom(metrics, processes),
		Metrics:   json.RawMessage(metrics),
		Processes: json.RawMessage(processes),
		Ports:     json.RawMessage(ports),
		Info:      json.RawMessage(info),
	}, nil
}

// getStatusFrom is a convenience to pick the primary status out of runner
// output when the panel needs a simple online/offline flag. Drivers implement
// Runner() and may include a "status" key in their metrics or info blob.
func getStatusFrom(metrics, processes string) string {
	// Try parsing the metrics blob for a top‑level status field.
	var obj map[string]any
	if err := json.Unmarshal([]byte(metrics), &obj); err == nil {
		if s, ok := obj["status"]; ok {
			if ss, ok := s.(string); ok {
				return ss
			}
		}
	}
	// Fallback to parsing processes JSON and looking for a root status.
	var procList []any
	if err := json.Unmarshal([]byte(processes), &procList); err == nil && len(procList) > 0 {
		if m, ok := procList[0].(map[string]any); ok {
			if s, ok := m["status"]; ok {
				if ss, ok := s.(string); ok {
					return ss
				}
			}
		}
	}
	// No status found.
	return ""
}

// constTimeEqual is a minimal constant‑time‑ish equality helper. This mirrors
// the lifecycle endpoint to keep auth parity across all edge RPCs.
func constTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status.
// Consistent with lifecycle; we embed ok into the body rather than using 4xx.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
