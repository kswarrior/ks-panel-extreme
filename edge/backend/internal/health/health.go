// Package health renders the GET /health endpoint a ksedge exposes.
//
// The original /health returned only `{"status":"ok"}`. That was fine for a
// pure liveness probe, but the panel had no way to tell whether a reachable
// port actually belonged to its ksedge or to another process that happened to
// be squatting the same port. Now /health reports the edge's configured name,
// its listen port and a monotonic `uptime_secs`, so the panel's active probe
// can:
//   * confirm the responder is actually a ksedge (`service:"ksedge"`),
//   * match the reported name against the row's expected name (catches the
//     "two edges share one port" class of misconfiguration),
//   * show "reachable" on the card even before the first heartbeat lands,
//     which fixes the original "add-a-node then stare at a red card for 60s"
//     UX while the operator waits out the heartbeat interval.
//
// The endpoint never includes the token — /health is unauthenticated so
// anyone on the network can hit it, and the token is the panel's auth secret.
package health

import (
	"encoding/json"
	"net/http"
	"time"
)

// startBoot is captured once per process so `/health` can report edge uptime.
var startBoot = time.Now()

// Response is the JSON `/health` returns. `Service` is always "ksedge" so a
// probing panel can distinguish us from any random webserver sharing the port;
// the rest let the card show "reachable since <…>" and flag a name mismatch.
type Response struct {
	Status     string `json:"status"`      // always "ok" today
	Service    string `json:"service"`     // always "ksedge" — the panel keys on this
	Name       string `json:"name"`        // edge display name from config (may be "")
	ListenPort int    `json:"listen_port"` // port we're actually listening on
	UptimeSecs int64  `json:"uptime_secs"` // process uptime, rolling
}

// Handler returns an http.HandlerFunc that closes over the bits of config /health
// is allowed to expose. Anything sensitive (Token, PanelURL) stays out.
func Handler(name string, listenPort int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusMethodNotAllowed)
			_ = json.NewEncoder(w).Encode(Response{Status: "method not allowed"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{
			Status:     "ok",
			Service:    "ksedge",
			Name:       name,
			ListenPort: listenPort,
			UptimeSecs: int64(time.Since(startBoot).Seconds()),
		})
	}
}
