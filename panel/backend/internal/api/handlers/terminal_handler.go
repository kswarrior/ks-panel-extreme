// Package terminal implements the panel's WebSocket bridge between the
// browser and the edge's /api/edge/exec endpoint.
//
// The panel OWNS the auth — it sits between the browser (which only knows
// its HttpOnly panel session cookie) and the edge (which only accepts the
// per-node edge token). The route is gated by VIEW_INSTANCES like the rest
// of the per-instance endpoints, then:
//
//  1. Read instance id from URL, load the row.
//  2. Resolve {node address, edge token}.
//  3. Upgrade the panel-side browser connection.
//  4. Open a server-side WebSocket to ksedge /api/edge/exec?kind=…&name=…&token=….
//  5. Pump frames between the two connections until either side closes,
//     preserving order so as not to interleave stdout/stderr/stdin.
//
// Frame protocol: same JSON shape as documented in
// ksedge/internal/exec/handler.go (stdin/stdout/stderr/resize/exit/ready/error).
package handlers

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/tunnel"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// proxyDialer is the gorilla dialer we use to connect PANEL → EDGE. The
// per-node variant honours SkipTLSVerify (self-signed edges) so the probe
// and lifecycle clients stay consistent: an edge with SkipTLSVerify=true
// skips verification, otherwise the dial validates.
var proxyDialer = websocket.Dialer{
	HandshakeTimeout: 10 * time.Second,
	TLSClientConfig:  &tls.Config{InsecureSkipVerify: true},
}

func dialerForNode(node *models.Node) *websocket.Dialer {
	if node != nil && !node.SkipTLSVerify {
		return &websocket.Dialer{
			HandshakeTimeout: 10 * time.Second,
			TLSClientConfig:  &tls.Config{},
		}
	}
	return &proxyDialer
}

// upgrader for the browser-side WebSocket. We accept any origin because
// the panel may be exposed via localtunnel-like hosts that rotate the
// hostname; auth is anchored on the session cookie instead.
var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// Handler is the chi handler bound at /api/instances/{id}/terminal.
// The auth + permission middleware run BEFORE this is invoked (the route
// is registered with r.With(requirePermission("VIEW_INSTANCES")) in
// server.go).
func TerminalHandler(w http.ResponseWriter, r *http.Request) {
	// Enforce the template-page whitelist: the Terminal tab is only reachable
	// when the instance's template added "terminal" (or a renamed variant)
	// to spec.pages. Done BEFORE the WebSocket upgrade so a denial returns a
	// plain 403 JSON instead of an aborted WS handshake.
	if !guardInstancePage(w, r, "terminal") {
		return
	}
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
	// driver's Exec routes correctly. Fall back to the panel's logical
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
	tty := 1
	if qs := r.URL.Query().Get("tty"); qs == "0" || qs == "false" {
		tty = 0
	}

	// Tunnel-aware guard: reverse_tunnel edges have no dialable address;
	// they must be online via WSS. Terminal over WSS tunnel is not yet
	// implemented (requires WS-over-WS multiplexing), so we return a
	// structured HTTP error the browser can render as a banner instead of
	// a generic dial failure to 127.0.0.1:4040. We return the error BEFORE
	// upgrading so the frontend sees a proper HTTP status (502/501) rather
	// than a 101 followed by a WS error frame that some clients miss.
	mode := strings.ToLower(strings.TrimSpace(node.ConnectionMode))
	// Defensive: legacy rows may carry address=="tunnel" with an empty or
	// unexpected mode — treat them as reverse_tunnel so they fail closed
	// with the tunnel error below instead of dialing hostname "tunnel".
	if strings.TrimSpace(node.Address) == "tunnel" || node.Address == "" {
		if mode == "" || mode == "direct" {
			mode = "reverse_tunnel"
		}
	}
	if mode == "reverse_tunnel" {
		if !tunnel.Global().IsConnected(node.ID) {
			http.Error(w, "edge not connected via WSS tunnel (reverse_tunnel terminal requires edge to be online)", http.StatusBadGateway)
			return
		}
		// Tunnel-connected reverse_tunnel: terminal not yet tunnelled via WSS.
		// Return a clear 501 so the UI can show a banner without needing a
		// WebSocket upgrade. The previous path upgraded to WS then sent a
		// JSON error frame, which required the browser to have already
		// completed the WS handshake — some pollers and curl probes never see
		// that frame and only see a silent close.
		http.Error(w, "terminal over WSS tunnel not yet implemented for reverse_tunnel; use direct or local_port mode for shell access", http.StatusNotImplemented)
		return
	}
	// Dual-transport both/local_both always keep a dialable address, so the
	// terminal falls through to the direct dial below (port path) regardless
	// of tunnel state — the emergency path for shell access — unless the
	// instance task is pinned to strict WSS with fallback disabled. In that
	// case dialing the port would violate the operator's explicit routing,
	// so fail closed like edge.Client.tryTunnel does.
	// local_wss with active tunnel could also dial via tunnel, but the
	// loopback HTTP dial still works (edge listens on 127.0.0.1), so we
	// keep the direct path for now and only guard the disconnected case
	// where fallback is unavailable. The direct dial below will attempt
	// 127.0.0.1:<port> which succeeds when the edge is on the same host.
	if mode == "both" || mode == "local_both" {
		if !tunnel.Global().IsConnected(node.ID) {
			route := edge.DecideRoute(mode, edge.TaskInstance, edge.LoadChannels(node.ID), false)
			if route.Strict && route.Transport == edge.TransportWSS {
				http.Error(w, "edge not connected via WSS tunnel (terminal task prefers WSS with fallback disabled)", http.StatusBadGateway)
				return
			}
		}
	}

	// Edge WS URL. Token, kind and name are query-escaped so a future token
	// format that includes special characters does not break the URL or leak
	// into logs unescaped. Kind/name are similarly escaped so names with
	// spaces or encoded characters survive the round-trip.
	target := fmt.Sprintf("%s://%s/api/edge/exec?kind=%s&name=%s&tty=%d&token=%s",
		scheme, node.Address, url.QueryEscape(inst.Kind), url.QueryEscape(name), tty, url.QueryEscape(token))

	// Upgrade the browser side first. The gorilla dialer speaks WS on a
	// already-upgraded connection; the browser side needs the standard
	// Upgrade dance.
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
		// Tell the browser the bridge couldn't reach the edge; the JS
		// side shows a "couldn't connect to node" banner instead of a
		// generic WS-failed popup. The dial error's URL contains the raw
		// edge token, so redact it before sending anything to the browser.
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
	// instead of leaking one goroutine per terminal tab. The deferred
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

// pumpBoth copies frames read from src to dst until either side closes,
// preserving the original frame type (text vs binary) so the JSON wire
// format (e.g. resize{"cols":N}) passes through untouched.
// It never closes either conn itself: the caller owns the lifetime and
// closes both ends after the first pump exits, which unblocks the peer
// pump's ReadMessage. (Closing dst here would race the peer pump's
// concurrent WriteMessage on the same conn — gorilla forbids concurrent
// close/write.)
func pumpBoth(src, dst *websocket.Conn, errCh chan<- error) {
	for {
		mt, payload, err := src.ReadMessage()
		if err != nil {
			errCh <- err
			return
		}
		if err := dst.WriteMessage(mt, payload); err != nil {
			errCh <- err
			return
		}
	}
}
