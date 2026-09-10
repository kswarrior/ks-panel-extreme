// Command ksdash is the sample stack dashboard app: one welcome page for
// testing the panel's node-style stack pairing end to end.
//
// Run it anywhere (same host or another host), point a stack row at it
// (loopback port OR remote address + root "dash"), paste the pairing token
// into its config, and the panel floats this page at /dash/ behind the
// panel session — no API key involved.
//
// Endpoints:
//
//	GET /health — liveness for the panel Verify button.
//	              {"status":"ok","service":"ksdash","name":<slug>}
//	GET /       — the welcome page. Echoes the panel-asserted identity
//	              headers (X-Panel-Username/X-Panel-User-Id/X-Panel-Stack)
//	              so you can see the proxy stamping works.
//
// Pairing: every --heartbeat-interval seconds it POSTs
// {token} to <panel-url>/api/stacks/heartbeat, which flips the stack row
// to up. Failures are logged, never fatal.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// config is the whole operator surface: flags win, PANEL_URL / STACK_TOKEN
// / STACK_SLUG envs fill the gaps (the panel pairing snippet prints this
// exact shape).
type config struct {
	port              int
	panelURL          string
	token             string
	slug              string
	heartbeatInterval time.Duration
}

func loadConfig() config {
	var c config
	flag.IntVar(&c.port, "port", 6600, "TCP port to listen on")
	flag.StringVar(&c.panelURL, "panel-url", "", "panel origin, e.g. http://127.0.0.1:8080")
	flag.StringVar(&c.token, "token", "", "pairing token (kss_…) minted by the panel")
	flag.StringVar(&c.slug, "slug", "dash", "stack slug (must match the panel row)")
	interval := flag.Int("heartbeat-interval", 60, "seconds between pairing heartbeats (0 disables)")
	flag.Parse()
	if c.panelURL == "" {
		c.panelURL = strings.TrimSpace(os.Getenv("PANEL_URL"))
	}
	if c.token == "" {
		c.token = strings.TrimSpace(os.Getenv("STACK_TOKEN"))
	}
	if c.slug == "" || c.slug == "dash" {
		if env := strings.TrimSpace(os.Getenv("STACK_SLUG")); env != "" {
			c.slug = env
		}
	}
	if *interval <= 0 {
		c.heartbeatInterval = 0
	} else {
		c.heartbeatInterval = time.Duration(*interval) * time.Second
	}
	c.panelURL = strings.TrimRight(strings.TrimSpace(c.panelURL), "/")
	return c
}

// heartbeatOnce pushes one pairing heartbeat. The token authenticates the
// app — it is sent in the body and never written to logs.
func heartbeatOnce(panelURL, token string) error {
	body, err := json.Marshal(map[string]string{"token": token})
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(panelURL+"/api/stacks/heartbeat", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("panel answered HTTP %d", resp.StatusCode)
	}
	return nil
}

// heartbeatLoop reports liveness until the process exits. A missing token
// or panel URL just disables it (the page still serves for proxy tests).
func heartbeatLoop(c config) {
	if c.token == "" || c.panelURL == "" {
		log.Println("pairing heartbeat off (set -token + -panel-url to report up)")
		return
	}
	if c.heartbeatInterval <= 0 {
		log.Println("pairing heartbeat off (interval 0)")
		return
	}
	tick := time.NewTicker(c.heartbeatInterval)
	defer tick.Stop()
	push := func() {
		if err := heartbeatOnce(c.panelURL, c.token); err != nil {
			log.Printf("heartbeat: %v", err)
			return
		}
		log.Println("heartbeat: ok")
	}
	push()
	for range tick.C {
		push()
	}
}

// healthHandler answers the panel Verify probe. Any 2xx counts as
// reachable — the panel does not gate stack apps on a service name.
func healthHandler(slug string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "ksdash",
			"name":    slug,
		})
	}
}

// welcomeHandler renders the one test page. Identity comes ONLY from the
// panel-asserted headers the reverse proxy stamps — this app has no login
// of its own. Values are escaped: usernames are operator-controlled.
func welcomeHandler(slug string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		user := html.EscapeString(r.Header.Get("X-Panel-Username"))
		uid := html.EscapeString(r.Header.Get("X-Panel-User-Id"))
		stack := html.EscapeString(r.Header.Get("X-Panel-Stack"))
		if user == "" {
			user = "direct visitor (no panel headers — open me via /dash/)"
		}
		if stack == "" {
			stack = html.EscapeString(slug)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome — %s</title></head>
<body style="font-family:system-ui,sans-serif;background:#0b1020;color:#e5e7eb;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center">
<main style="text-align:center;max-width:560px;padding:32px">
<h1 style="font-size:40px;margin:0 0 8px">👋 Welcome</h1>
<p style="color:#9ca3af;margin:0 0 24px">This is the <b>%s</b> test dashboard, served by <code>ksdash</code> and floated here by the panel — no API key involved.</p>
<table style="margin:0 auto;border-collapse:collapse;font-size:14px">
<tr><td style="color:#9ca3af;text-align:right;padding:4px 12px">panel user</td><td style="text-align:left"><b>%s</b></td></tr>
<tr><td style="color:#9ca3af;text-align:right;padding:4px 12px">panel user id</td><td style="text-align:left"><code>%s</code></td></tr>
<tr><td style="color:#9ca3af;text-align:right;padding:4px 12px">stack</td><td style="text-align:left"><code>%s</code></td></tr>
</table>
<p style="margin-top:24px;font-size:12px;color:#6b7280">health: <a style="color:#93c5fd" href="health">/health</a> · pair me from the stack detail page (Verify + pairing snippet)</p>
</main></body></html>`, html.EscapeString(slug), html.EscapeString(slug), user, uid, stack)
	}
}

func main() {
	c := loadConfig()
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler(c.slug))
	mux.HandleFunc("/", welcomeHandler(c.slug))
	go heartbeatLoop(c)
	addr := fmt.Sprintf("127.0.0.1:%d", c.port)
	log.Printf("ksdash %q listening on http://%s (panel %q)", c.slug, addr, c.panelURL)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
