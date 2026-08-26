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
	"strconv"
	"time"

	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// proxyDialer is the gorilla dialer we use to connect PANEL → EDGE. We
// honour InsecureSkipVerify because edges on internal networks often sit
// behind self-signed certs; the same trade-off is made by edge.Client.
var proxyDialer = websocket.Dialer{
	HandshakeTimeout: 10 * time.Second,
	TLSClientConfig:  &tls.Config{InsecureSkipVerify: true},
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

	// Edge WS URL.
	target := fmt.Sprintf("%s://%s/api/edge/exec?kind=%s&name=%s&tty=%d&token=%s",
		scheme, node.Address, inst.Kind, name, tty, token)

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

	edgeConn, _, err := proxyDialer.DialContext(ctx, target, nil)
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

	<-errCh
}

// pumpBoth copies frames read from src to dst until either side closes.
// We keep the original WebSocket frame type (text vs binary) so the JSON
// wire format surrounding the binary payloads (e.g. resize{"cols":N}) is
// preserved untouched.
func pumpBoth(src, dst *websocket.Conn, errCh chan<- error) {
	defer func() { _ = dst.Close() }()
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
