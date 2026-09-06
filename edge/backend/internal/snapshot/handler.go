// Package snapshot handles snapshot-related RPCs from the panel.
package snapshot

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
		if req.Location != "" {
			if err := validateLocation(req.Location); err != nil {
				writeErr(w, http.StatusBadRequest, err.Error())
				return
			}
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

// validateLocation fails closed on hostile snapshot locations. The driver
// writes a tar file under Location (docker save / lxc export), so a
// compromised panel must not turn the edge into an arbitrary host-file
// writer (e.g. Location=/etc/). Require an absolute path, reject NUL and
// system paths using the same denylist as the file manager.
func validateLocation(loc string) error {
	if len(loc) > 512 {
		return fmt.Errorf("invalid snapshot location (too long)")
	}
	if strings.Contains(loc, "\x00") {
		return fmt.Errorf("invalid snapshot location")
	}
	clean := filepath.Clean(loc)
	if !filepath.IsAbs(clean) {
		return fmt.Errorf("invalid snapshot location (must be absolute)")
	}
	if isDangerousLocation(clean) {
		return fmt.Errorf("invalid snapshot location (system path)")
	}
	if resolvedLocationBlocked(clean) {
		return fmt.Errorf("invalid snapshot location (system path)")
	}
	// The driver writes a tar file under Location: it must already be a
	// directory so a typo (or a planted non-dir path) cannot turn the
	// edge into an arbitrary host-file writer (fail closed).
	info, err := os.Stat(clean)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("invalid snapshot location (must be an existing directory)")
	}
	return nil
}

// isDangerousLocation mirrors files.isDangerousPath plus the
// files.destBlocked extras (/var cron spool, /opt, /srv, /home, /run) so
// the two surfaces can never drift: snapshot tars must never land in
// system dirs. /tmp stays allowed: it is the documented staging area
// (see SnapshotRequest.Location) and destBlocked allows it too.
func isDangerousLocation(p string) bool {
	p = filepath.Clean(p)
	if p == "/" {
		return true
	}
	for _, d := range []string{"/bin", "/sbin", "/usr", "/etc", "/proc", "/sys", "/dev", "/boot", "/lib", "/lib64", "/root", "/var", "/opt", "/srv", "/home", "/run"} {
		if p == d || strings.HasPrefix(p, d+"/") {
			return true
		}
	}
	return false
}

// resolvedLocationBlocked mirrors files.resolvedBlocked against the
// snapshot denylist: a Location whose symlink chain resolves into a
// system dir (e.g. /data/link -> /etc with Location=/data/link) is
// rejected even though the literal path looks benign. For not-yet-visible
// targets it resolves the deepest existing ancestor and re-attaches the
// remainder so a planted symlink is still caught.
func resolvedLocationBlocked(clean string) bool {
	if rp, err := filepath.EvalSymlinks(clean); err == nil {
		return isDangerousLocation(filepath.Clean(rp))
	}
	rel := []string{}
	cur := clean
	for {
		if rp, err := filepath.EvalSymlinks(cur); err == nil {
			resolved := filepath.Clean(rp)
			for i := len(rel) - 1; i >= 0; i-- {
				resolved = filepath.Join(resolved, rel[i])
			}
			return isDangerousLocation(filepath.Clean(resolved))
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return false
		}
		rel = append(rel, filepath.Base(cur))
		cur = parent
	}
}

// writeErr emits Response{OK:false, Error: msg} with the chosen HTTP status.
func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(SnapshotResponse{OK: false, Error: msg})
}