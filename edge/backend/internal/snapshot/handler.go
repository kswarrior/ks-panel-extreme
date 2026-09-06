// Package snapshot handles snapshot-related RPCs from the panel.
package snapshot

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

// SnapshotRequest matches the wire format the panel's edge.Snapshot emits.
type SnapshotRequest struct {
	Token   string `json:"token"`
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	// "create" | "restore" | "delete".
	Action  string `json:"action"`
	SnapName string `json:"snap_name,omitempty"`
	Type    string `json:"type,omitempty"`    // e.g., "zip", "tar", "docker", "lxd"
	Location string `json:"location,omitempty"` // e.g., "/mc/", "/tmp/snapshots/"
}

// SnapshotResponse is what the edge hands back.
type SnapshotResponse struct {
	OK        bool   `json:"ok"`
	ExternalRef string `json:"external_ref,omitempty"`
	SizeBytes int64  `json:"size_bytes,omitempty"`
	Error     string `json:"error,omitempty"`
}

// Handler returns an http.HandlerFunc authenticated by the given edge token.
func Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req SnapshotRequest
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
		// Validate the snapshot action BEFORE we look up the driver. The
		// per-driver Snapshot switch already rejects unknown actions, but
		// every driver returns its own message for that case; validating
		// here at the edge API layer means every malformed panel→edge
		// snapshot RPC (a typo, a missing action field, a future-action
		// string the deployed driver hasn't shipped yet) fails at the
		// same stage and with the same shape the other RPCs use, so the
		// panel's snapshot decoder handles it through its single "edge
		// rejected: %s" path instead of needing per-driver translations.
		switch req.Action {
		case "create", "restore", "delete":
		default:
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid snapshot action: %q (must be create, restore, or delete)", req.Action))
			return
		}
		if req.SnapName == "" || len(req.SnapName) > 128 || containsPathSep(req.SnapName) {
			writeErr(w, http.StatusBadRequest, "invalid snapshot name (must be 1-128 chars without path separators)")
			return
		}

		drv := drivers.Registry[req.Kind]

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		externalRef, sizeBytes, err := drv.Snapshot(ctx, req.Name, req.Action, req.SnapName, req.Type, req.Location)
		if err != nil {
			// Use 200 + {ok:false,error:...} rather than 4xx/5xx so the panel's
			// single "did the edge accept" signal lives in the body, not
			// the status. This matches how every other edge RPC sits.
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(SnapshotResponse{OK: false, Error: err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(SnapshotResponse{
			OK:        true,
			ExternalRef: externalRef,
			SizeBytes: sizeBytes,
		})
	})
}

// constTimeEqual is a minimal constant‑time equality helper. This mirrors
// the inspect endpoint to keep auth parity across all edge RPCs.
func constTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// containsPathSep rejects snapshot names that could escape the driver's
// snapshot directory (fail closed on hostile input).
func containsPathSep(s string) bool {
	return strings.Contains(s, "/") || strings.Contains(s, "\\") || strings.Contains(s, "..")
}

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(SnapshotResponse{OK: false, Error: msg})
}