package handlers

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// stack_remote.go — node-style remote pairing for stack apps.
//
// A stack app (dashboard/tool) may run on another host or the same host,
// like an edge node does. Pairing needs NO manual API key:
//
//	1. Panel mints a pairing token at stack create (returned once) or
//	   rotate (POST /api/stacks/{id}/rotate-token, also once).
//	2. The operator pastes panel_url + token + slug into the app's config
//	   (GET /api/stacks/{id}/pairing renders the snippet server-side so
//	   the frontend never reconstructs secrets).
//	3. The app pushes POST /api/stacks/heartbeat {token} on a loop — the
//	   panel flips status up/down + stamps last_seen_at (mirrors the edge
//	   heartbeat, minus telemetry: dashboards report liveness only).
//	4. The admin Verify button (POST /api/stacks/{id}/probe) actively dials
//	   the app's /health like ProbeNodeHandler does for edges.
//
// The heartbeat route is public + CSRF-exempt (token-in-body, mirrors
// POST /api/nodes/heartbeat). Everything else here is session-gated.

// stackHeartbeatRequest is the public pairing heartbeat body. Token-only
// by design: dashboards report liveness, not telemetry.
type stackHeartbeatRequest struct {
	Token string `json:"token"`
}

// StackHeartbeatHandler is the public endpoint a paired stack app calls on
// a loop. On a bad token we return 401; on success we ack with the stack
// id + slug so the app can confirm it is talking to the right panel row.
func StackHeartbeatHandler(w http.ResponseWriter, r *http.Request) {
	var req stackHeartbeatRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Token) == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.IngestStackHeartbeat(req.Token)
	if err != nil {
		// Never log the token. Never distinguish "unknown" from
		// "revoked" — both are just unauthorized.
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, map[string]any{"stack_id": s.ID, "slug": s.Slug, "status": "ok"})
}

// stackProbeResultJSON mirrors probeResultJSON (nodes): reachability is a
// tri-state string so the frontend renders without nullable-bool holes.
type stackProbeResultJSON struct {
	StackID   int64  `json:"stack_id"`
	Reachable string `json:"reachable"` // "yes" | "no"
	Note      string `json:"note,omitempty"`
}

// stackProbeHTTPClient returns a short-timeout client for the Verify dial.
// Self-signed remotes opt into the insecure transport per-stack (mirrors
// the probe package's clientFor for nodes).
func stackProbeHTTPClient(skipVerify bool) *http.Client {
	transport := &http.Transport{}
	if skipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	return &http.Client{Timeout: 4 * time.Second, Transport: transport}
}

// ProbeStackHandler actively dials the stack app's /health and returns the
// verdict for the Verify button (mirrors ProbeNodeHandler). Remote stacks
// are dialled at remote_address (http/https via remote_use_tls); same-host
// stacks at 127.0.0.1:proxy_port. Any 2xx counts as reachable — stack apps
// are arbitrary user programs, so unlike ksedge there is no service-name
// gate. The probe never mutates status: heartbeats own liveness.
func ProbeStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStack(id)
	if err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if stackOwnBlocked(r, s) {
		http.Error(w, "forbidden: own-scope may only verify stacks you uploaded", http.StatusForbidden)
		return
	}
	scheme, addr := s.StackDialTarget()
	if !s.IsRemoteStack() && s.ProxyPort == 0 {
		writeJSON(w, stackProbeResultJSON{StackID: id, Reachable: "no", Note: "no dial target configured (set a loopback port or a remote address)"})
		return
	}
	cl := stackProbeHTTPClient(s.RemoteSkipVerify)
	resp, derr := cl.Get(fmt.Sprintf("%s://%s/health", scheme, addr))
	if derr != nil {
		writeJSON(w, stackProbeResultJSON{StackID: id, Reachable: "no", Note: fmt.Sprintf("dial: %v", derr)})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeJSON(w, stackProbeResultJSON{StackID: id, Reachable: "no", Note: fmt.Sprintf("app returned HTTP %d", resp.StatusCode)})
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryStack,
		Action:      "probe",
		TargetID:    &id,
		TargetLabel: s.Name,
		Message:     fmt.Sprintf("verified stack app %q at %s (reachable=yes)", s.Name, addr),
	})
	writeJSON(w, stackProbeResultJSON{StackID: id, Reachable: "yes"})
}

// RotateStackTokenHandler reissues the pairing token and returns the
// plaintext once (mirrors RotateNodeTokenHandler). The old token stops
// working immediately.
func RotateStackTokenHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	var label string
	if s, gerr := repo.GetStack(id); gerr == nil && s != nil {
		label = s.Name
		if stackOwnBlocked(r, s) {
			http.Error(w, "forbidden: own-scope may only rotate stacks you uploaded", http.StatusForbidden)
			return
		}
	}
	token, err := repo.RotateStackToken(id)
	if err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("RotateStackToken error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryStack,
		Action:      "rotate_token",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("rotated pairing token for stack %q", label),
	})
	writeJSON(w, map[string]string{"token": token})
}

// stackPairingJSON is the config snippet the operator pastes into the stack
// app. panel_url is derived server-side from the request (mirrors the local
// node setup's scheme/host derivation) so the frontend never guesses it.
type stackPairingJSON struct {
	StackID int64  `json:"stack_id"`
	Slug    string `json:"slug"`
	PanelURL string `json:"panel_url"`
	Token   string `json:"token"`
	Config  string `json:"config"`
}

// StackPairingHandler serves the pairing snippet (EDIT-gated: it carries
// the raw token — mirrors the nodes PlainToken exposure for local setup).
func StackPairingHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStack(id)
	if err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if stackOwnBlocked(r, s) {
		http.Error(w, "forbidden: own-scope may only pair stacks you uploaded", http.StatusForbidden)
		return
	}
	token, err := repo.StackPlainToken(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if token == "" {
		http.Error(w, "no pairing token yet — rotate the token first", http.StatusBadRequest)
		return
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" || proto == "http" {
		scheme = proto
	}
	panelURL := scheme + "://" + r.Host
	cfg := fmt.Sprintf("panel_url: %s\ntoken: %s\nslug: %s\nheartbeat_interval: 60\n", panelURL, token, s.Slug)
	writeJSON(w, stackPairingJSON{
		StackID: s.ID, Slug: s.Slug, PanelURL: panelURL, Token: token, Config: cfg,
	})
}
