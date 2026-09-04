// Package probe holds the panel's active liveness check against an edge
// node. The original panel was push-only: it never dialled the edge unless it
// was executing a lifecycle RPC, so a misconfigured port (two ksedge daemons
// sharing the same port, a panel pointed at the wrong host, a firewall
// dropping INBOUND to the edge) all looked identical — a red "down" card that
// never explained why.
//
// probe.Probe dials GET /health on the edge and interprets the enriched
// response ksedge now returns:
//   - dial error            -> unreachable (port closed / wrong host)
//   - 200 + service:"ksedge" -> reachable; the SeenName lets the panel flag a
//     row ↔ edge mismatch (port collision where some
//     OTHER panel's ksedge answers with a different
//     configured name)
//   - 200 + other payload    -> reachable but NOT a ksedge (raw webserver on
//     the same port); reported as not-ours so the
//     card shows "reachable but not an edge"
//   - non-2xx                -> reachable but the edge is unhealthy; treated
//     as not-reachable for the card's verdict but
//     the operator sees the upstream in the panel log
package probe

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/tunnel"
)

// Result is what the repo persists for the card and what the admin probe
// handler returns in bulk. Reachable is tri-state-ish in storage (nil ==
// unreachable / never probed) but here we use the explicit bool form so the
// caller can branch cleanly.
type Result struct {
	// Reachable true ONLY when the responder announced service:"ksedge".
	// A reachable non-ksedge still gets a Result back (with Reachable=false
	// and a populated SeenName when we could read it) so callers can
	// distinguish "port closed" from "webserver squatting the port".
	Reachable bool
	// SeenName is the edge's reported config.Name — blank when the
	// responder wasn't a ksedge or didn't include the field. The card uses
	// it to flash a "name mismatch" badge (probe said node-A but the row
	// expects node-B).
	SeenName string
	// Note carries a one-line human reason when Reachable is false: "dial
	// timeout", "not a ksedge", "edge returned 502", etc. Not stored on
	// the row, only returned by the bulk probe handler for the toast.
	Note string
}

// healthResponse mirrors ksedge/internal/health.Response. Kept local to the
// panel so changes to the edge's struct don't accidentally change the panel's
// decoding shape without an explicit review. We only read the four fields the
// card cares about; unknown fields are ignored.
type healthResponse struct {
	Status     string `json:"status"`
	Service    string `json:"service"`
	Name       string `json:"name"`
	ListenPort int    `json:"listen_port"`
}

// insecureClient uses a transport that ignores certificate validation. Created
// once and reused across probes for self-signed edges whose per-node
// skip_tls_verify flag is set.
var insecureClient = &http.Client{
	Timeout: 4 * time.Second,
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	},
}

// httpClient owns the http.Transport so callers reuse connections across
// sequential probes (the admin "Recheck" button can smash the page). Sane
// timeout: an edge that takes longer than 4s to answer its own liveness probe
// is not healthy enough to draw green. It verifies TLS by default; edges
// with SkipTLSVerify use insecureClient instead.
var httpClient = &http.Client{
	Timeout: 4 * time.Second,
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{},
	},
}

// clientFor picks the right HTTP client for an edge's probe. An edge with
// SkipTLSVerify set uses the explicit insecure transport (today every probe
// client ignores TLS, but keeping the flag lets a future hardened default
// flip on without changing the per-node opt-in semantics). The per-node
// timeout overrides the shared client's 4s default.
func clientFor(node models.Node) *http.Client {
	c := httpClient
	if node.SkipTLSVerify {
		c = insecureClient
	}
	timeout := node.HealthTimeout
	if timeout <= 0 {
		timeout = 4
	}
	// Clone so the per-node timeout doesn't bleed into the shared package
	// singleton — keep the Transport for connection reuse.
	return &http.Client{
		Timeout:   time.Duration(timeout) * time.Second,
		Transport: c.Transport,
	}
}

// Probe dials the edge at <scheme>://<address>/health and classifies the
// response. Never panics on a non-JSON body — the surrounding sweep/handler
// treats anything except `service:"ksedge"` as not-ours so a stale reverse
// proxy doesn't fake a green card.
//
// The address may carry no port (e.g. a Cloudflare-tunnel hostname); the HTTP
// client then dials the default port for the scheme. Per-node HealthTimeout
// and SkipTLSVerify override the package defaults when set.
func Probe(node models.Node) Result {
	// For WSS tunnel modes, probe via tunnel connectivity instead of direct HTTP.
	// Dual-transport modes (both/local_both) prefer the tunnel when connected
	// and fall back to direct HTTP otherwise (same as local_wss). Only
	// reverse_tunnel hard-fails when the tunnel is down.
	mode := strings.ToLower(strings.TrimSpace(node.ConnectionMode))
	if mode == "reverse_tunnel" || mode == "local_wss" || mode == "both" || mode == "local_both" {
		connected := tunnel.Global().IsConnected(node.ID)
		// Dual modes honour the node-task channel: a port-preferred node
		// task probes over HTTP even when the tunnel is up.
		if connected && (mode == "both" || mode == "local_both") {
			route := edge.DecideRoute(mode, edge.TaskNode, edge.LoadChannels(node.ID), true)
			if !route.PreferTunnel {
				connected = false
			}
		}
		if connected {
			// Tunnel probe: ask edge for health via tunnel RPC and interpret.
			// Use the tunnel's generic request path /health (GET) with a short timeout.
			status, body, err := tunnel.Global().Send(node.ID, "GET", "/health", nil, 5*time.Second)
			if err != nil {
				return Result{Reachable: false, Note: fmt.Sprintf("tunnel probe: %v", err)}
			}
			if status != http.StatusOK {
				return Result{Reachable: false, Note: fmt.Sprintf("edge returned HTTP %d via tunnel", status)}
			}
			var hr healthResponse
			if err := json.Unmarshal(body, &hr); err != nil {
				return Result{Reachable: false, Note: fmt.Sprintf("not a ksedge via tunnel: %v", err)}
			}
			if hr.Service != "ksedge" {
				return Result{Reachable: false, SeenName: hr.Name, Note: fmt.Sprintf("service=%q is not a ksedge", hr.Service)}
			}
			return Result{Reachable: true, SeenName: hr.Name}
		}
		if mode == "reverse_tunnel" {
			return Result{Reachable: false, Note: "edge not connected via WSS tunnel"}
		}
		// local_wss and the dual modes (both/local_both) fall through to
		// direct HTTP probe as fallback when tunnel not connected.
	}
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	// For tunnel placeholder addresses, Probe cannot use HTTP – already handled above.
	if node.Address == "" || node.Address == "tunnel" {
		return Result{Reachable: false, Note: "no address for direct probe (tunnel mode)"}
	}
	url := fmt.Sprintf("%s://%s/health", scheme, node.Address)
	cl := clientFor(node)
	resp, err := cl.Get(url)
	if err != nil {
		return Result{Reachable: false, Note: fmt.Sprintf("dial: %v", err)}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Result{Reachable: false, Note: fmt.Sprintf("edge returned HTTP %d", resp.StatusCode)}
	}
	var hr healthResponse
	if err := json.NewDecoder(resp.Body).Decode(&hr); err != nil {
		// The responder wasn't speaking JSON. Treat as a non-ksedge port
		// collision rather than "down" so the card surfaces the misconfig.
		return Result{Reachable: false, Note: fmt.Sprintf("not a ksedge: %v", err)}
	}
	if hr.Service != "ksedge" {
		return Result{Reachable: false, SeenName: hr.Name, Note: fmt.Sprintf("service=%q is not a ksedge", hr.Service)}
	}
	return Result{Reachable: true, SeenName: hr.Name}
}
