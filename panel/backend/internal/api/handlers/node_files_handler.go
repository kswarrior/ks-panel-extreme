// NodeFilesHandler proxies the NodeDetail → Files tab to the owning
// edge's /api/edge/hostfiles endpoint — a read-only browser jailed to the
// daemon's instance-files directory (instances_dir), which is the
// filesystem root the SPA sees. Operators can inspect per-instance data
// without ever addressing anything else on the edge host.
//
// Route exposed:
//
//	GET /api/nodes/{id}/files?op=list&path=/
//	    → forwards to edge ?op=list, returns {"entries":[…],"path":…,"root":…}
//	GET /api/nodes/{id}/files?op=stat&path=/mc-1
//	    → forwards to edge ?op=stat, returns one entry object.
//	GET /api/nodes/{id}/files?op=read&path=/mc-1/server.jar
//	    → forwards to edge ?op=read, streams raw bytes back with
//	      Content-Disposition so downloads land with the right filename.
//
// View-level gate (like probe/heartbeats/update-info) plus the own-scope
// node check: anyone who may view the node may browse its instance files.
// There are no mutating ops — the edge endpoint only implements GET.
package handlers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/tunnel"
)

// supportedNodeFileOps is the read-only op set the edge hostfiles endpoint
// implements. Anything else is a typo — 400 instead of a silent no-op.
var supportedNodeFileOps = map[string]bool{
	"list": true, "stat": true, "read": true,
}

// NodeFilesHandler proxies ?op=… queries to the edge hostfiles endpoint.
// Bound at GET /api/nodes/{id}/files (see server.go).
func NodeFilesHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	qs := r.URL.Query()
	op := qs.Get("op")
	if op == "" {
		op = "list"
	}
	if !supportedNodeFileOps[op] {
		http.Error(w, "unsupported op "+op, http.StatusBadRequest)
		return
	}
	// Content-Type must reflect the OP: list/stat answer structured JSON,
	// read streams raw bytes with the edge's own Content-Type pair.
	ct := ""
	if op == "list" || op == "stat" {
		ct = "application/json"
	}
	proxyNodeToEdgeHostFiles(w, r, nd, token, op, qs.Get("path"), ct)
}

// proxyNodeToEdgeHostFiles dials the edge's /api/edge/hostfiles endpoint
// for one node. It mirrors the tunnel-aware dispatch in proxyToEdge
// (files_handler.go) — tunnel first for JSON ops on tunnel modes, direct
// HTTP otherwise — but stays read-only: there is no request body to
// forward, and binary downloads (op=read) always go over HTTP because the
// WSS tunnel cannot carry binary payloads.
func proxyNodeToEdgeHostFiles(w http.ResponseWriter, r *http.Request, node *models.Node, token, op, path, contentType string) {
	q := url.Values{}
	q.Set("op", op)
	q.Set("path", path)
	q.Set("token", token)
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	target := scheme + "://" + node.Address + "/api/edge/hostfiles?" + q.Encode()

	mode := strings.ToLower(strings.TrimSpace(node.ConnectionMode))
	isTunnelMode := mode == "reverse_tunnel" || mode == "local_wss" || mode == "both" || mode == "local_both"
	connected := tunnel.Global().IsConnected(node.ID)
	filesRoute := edge.DecideRoute(mode, edge.TaskFiles, edge.LoadChannels(node.ID), connected)
	useTunnelFirst := false
	switch mode {
	case "reverse_tunnel":
		useTunnelFirst = true
	case "local_wss":
		useTunnelFirst = connected
	case "both", "local_both":
		useTunnelFirst = filesRoute.PreferTunnel && connected
		// Binary payloads cannot ride the tunnel — dual modes always have
		// a dialable address, so downloads go over HTTP (port).
		if op == "read" {
			useTunnelFirst = false
		}
	}
	// local_wss downloads skip the tunnel and fall through to direct HTTP
	// below: the edge listens on 127.0.0.1:<port> on the same host.
	isLocalWSSBinary := mode == "local_wss" && op == "read"
	if isTunnelMode && connected && useTunnelFirst && !isLocalWSSBinary {
		tunnelPath := "/api/edge/hostfiles?" + q.Encode()
		if op == "read" {
			writeJSONStatus(w, http.StatusNotImplemented, map[string]any{
				"error": "file download via WSS tunnel not yet supported for binary files",
				"hint":  "use direct or local_port mode for binary downloads",
				"edge":  node.Address,
			})
			return
		}
		status, respBody, err := tunnel.Global().Send(node.ID, http.MethodGet, tunnelPath, nil, 5*time.Minute)
		if err != nil {
			if (mode == "both" || mode == "local_both") && filesRoute.Fallback {
				goto httpFallback
			}
			safeErr := strings.ReplaceAll(err.Error(), token, "[redacted]")
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "tunnel send failed: " + safeErr,
				"edge":  node.Address,
			})
			return
		}
		if status == http.StatusNotFound && contentType != "" {
			if strings.Contains(string(respBody), "404 page not found") {
				writeJSONStatus(w, http.StatusBadGateway, map[string]any{
					"error": "this edge node does not expose the host files endpoint",
					"hint":  "the running ksedge binary is older than the panel's host files route; rebuild and restart ksedge",
					"edge":  node.Address,
				})
				return
			}
		}
		if status >= 400 {
			if !json.Valid(respBody) {
				writeJSONStatus(w, status, map[string]any{
					"error": strings.TrimSpace(string(respBody)),
					"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
					"edge":  node.Address,
				})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_, _ = w.Write(respBody)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(status)
		_, _ = w.Write(respBody)
		return
	}
httpFallback:
	if mode == "reverse_tunnel" && !connected {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge not connected via WSS tunnel (reverse_tunnel mode requires edge to be online)",
			"hint":  "ensure ksedge is running with panel_url and token, and that it can reach the panel via WSS",
			"edge":  node.Address,
		})
		return
	}
	if (mode == "both" || mode == "local_both") && !connected && filesRoute.Strict && filesRoute.Transport == edge.TransportWSS {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge not connected via WSS tunnel (files task prefers WSS with fallback disabled)",
			"hint":  "start ksedge so the tunnel connects, or enable emergency fallback on the files channel",
			"edge":  node.Address,
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, "build edge request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	resp, err := httpClientForNode(node).Do(req)
	if err != nil {
		// Dual-mode emergency: a port-preferred files task whose HTTP dial
		// failed retries idempotent JSON ops over the tunnel when fallback
		// is on and the tunnel is up. Downloads skip the retry (no safe
		// binary replay over the tunnel).
		if (mode == "both" || mode == "local_both") && filesRoute.Fallback &&
			tunnel.Global().IsConnected(node.ID) && op != "read" {
			tunnelPath := "/api/edge/hostfiles?" + q.Encode()
			if status, respBody, terr := tunnel.Global().Send(node.ID, http.MethodGet, tunnelPath, nil, 5*time.Minute); terr == nil {
				if status < 400 {
					w.Header().Set("Content-Type", contentType)
					w.WriteHeader(status)
					_, _ = w.Write(respBody)
					return
				}
			}
		}
		safeErr := strings.ReplaceAll(err.Error(), token, "[redacted]")
		log.Printf("proxyNodeToEdgeHostFiles: dial edge failed: %v", safeErr)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge unreachable: " + safeErr,
		})
		return
	}
	defer resp.Body.Close()

	// A mux-default plain-text 404 means the running ksedge predates the
	// /api/edge/hostfiles route — surface a structured hint instead.
	if resp.StatusCode == http.StatusNotFound && contentType != "" && resp.Header.Get("Content-Type") != "" &&
		strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/plain") {
		body, _ := io.ReadAll(resp.Body)
		if strings.Contains(string(body), "404 page not found") {
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "this edge node does not expose the host files endpoint",
				"hint":  "the running ksedge binary is older than the panel's host files route; rebuild and restart ksedge",
				"edge":  node.Address,
			})
			return
		}
		writeJSONStatus(w, resp.StatusCode, map[string]any{
			"error": strings.TrimSpace(string(body)),
			"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
			"edge":  node.Address,
		})
		return
	}

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if !json.Valid(bodyBytes) {
			writeJSONStatus(w, resp.StatusCode, map[string]any{
				"error": strings.TrimSpace(string(bodyBytes)),
				"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
				"edge":  node.Address,
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(bodyBytes)
		return
	}

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	} else if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		w.Header().Set("Content-Disposition", cd)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
