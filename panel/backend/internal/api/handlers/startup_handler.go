package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/tunnel"
	"github.com/go-chi/chi/v5"
)

// StartupHandler is the chi handler bound at
// /api/instances/{id}/startup. It bridges the browser to the instance's
// MAIN process stdio (the template's startup command, e.g. a Minecraft
// server) through ksedge /api/edge/attach — the startup-terminal twin of
// TerminalHandler (which bridges to a side shell via /api/edge/exec).
//
// Auth + permission middleware run BEFORE this is invoked (the route is
// registered with the same VIEW_INSTANCES gate as the terminal bridge).
// The terminal-ID binding itself is enforced panel-side by the SPA (the
// pane only dials this endpoint when its ID matches the template's
// advanced.startup_terminal_id); the bridge dials only the instance's
// own edge.
func StartupHandler(w http.ResponseWriter, r *http.Request) {
	// No spec.pages whitelist gate (same self-sufficient-builtin rule as
	// the terminal bridge): auth + VIEW permission already ran in
	// middleware, and the bridge dials only the instance's own edge.
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	// Use external_id (the container/VM/lxc name ksedge reported) so the
	// driver's Attach routes correctly. Fall back to the panel's logical
	// name when external_id is missing (e.g. legacy rows).
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	node, err := repository.NewNodeRepository(con).GetNode(inst.NodeID)
	if err != nil {
		http.Error(w, "owner node not found", http.StatusNotFound)
		return
	}
	token, err := repository.NewNodeRepository(con).PlainToken(inst.NodeID)
	if err != nil || token == "" {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "node has no usable edge token (rotate it first)",
		})
		return
	}

	scheme := "ws"
	if node.UseTLS {
		scheme = "wss"
	}

	// Same tunnel guards as the terminal bridge: reverse_tunnel edges
	// have no dialable address, so fail closed with a structured HTTP
	// error BEFORE upgrading (see TerminalHandler for the full rationale).
	mode := strings.ToLower(strings.TrimSpace(node.ConnectionMode))
	if strings.TrimSpace(node.Address) == "tunnel" || node.Address == "" {
		if mode == "" || mode == "direct" {
			mode = "reverse_tunnel"
		}
	}
	if mode == "reverse_tunnel" {
		if !tunnel.Global().IsConnected(node.ID) {
			http.Error(w, "edge not connected via WSS tunnel (reverse_tunnel startup terminal requires edge to be online)", http.StatusBadGateway)
			return
		}
		http.Error(w, "startup terminal over WSS tunnel not yet implemented for reverse_tunnel; use direct or local_port mode for terminal access", http.StatusNotImplemented)
		return
	}
	if mode == "both" || mode == "local_both" {
		if !tunnel.Global().IsConnected(node.ID) {
			route := edge.DecideRoute(mode, edge.TaskInstance, edge.LoadChannels(node.ID), false)
			if route.Strict && route.Transport == edge.TransportWSS {
				http.Error(w, "edge not connected via WSS tunnel (startup terminal task prefers WSS with fallback disabled)", http.StatusBadGateway)
				return
			}
		}
	}

	// Edge WS URL (attach takes kind/name/token only: the main process
	// owns its stdio already, so there is no tty geometry or timeout to
	// negotiate). Token/kind/name are query-escaped so special
	// characters never break the URL or leak into logs unescaped.
	target := fmt.Sprintf("%s://%s/api/edge/attach?kind=%s&name=%s&token=%s",
		scheme, node.Address, url.QueryEscape(inst.Kind), url.QueryEscape(name), url.QueryEscape(token))

	// Upgrade the browser side first (same dance as TerminalHandler).
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// upgrader.Upgrade already wrote an error response.
		return
	}
	defer clientConn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	dialer := dialerForNode(node)
	edgeConn, _, err := dialer.DialContext(ctx, target, nil)
	if err != nil {
		// Redact the raw edge token before telling the browser.
		safeMsg := strings.ReplaceAll(err.Error(), token, "[redacted]")
		_ = clientConn.WriteJSON(map[string]any{
			"type":    "error",
			"message": fmt.Sprintf("could not dial edge: %v", safeMsg),
		})
		time.Sleep(50 * time.Millisecond)
		return
	}
	defer edgeConn.Close()

	errCh := make(chan error, 2)

	go pumpBoth(clientConn, edgeConn, errCh)
	go pumpBoth(edgeConn, clientConn, errCh)

	// Wait for the first direction to fail, then unblock the peer by
	// closing both ends so the second pump's ReadMessage errors out
	// instead of leaking one goroutine per startup tab. The deferred
	// Close calls above make the extra closes idempotent.
	<-errCh
	_ = clientConn.Close()
	_ = edgeConn.Close()
	// Wait for the second pump, but bound it: a peer that ignores Close
	// must not park this handler goroutine forever.
	select {
	case <-errCh:
	case <-time.After(5 * time.Second):
	}
}
