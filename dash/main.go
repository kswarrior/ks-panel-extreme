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
//
// Announce: on start (retried until first success) it POSTs
// {token, slug, name, version, description, icon, needs[]} to
// <panel-url>/api/stacks/announce — the panel stores who the app is and
// holds the needed capabilities pending until the admin allows them and
// activates. The app itself never touches grants.
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
// / STACK_SLUG / APP_* / STACK_NEEDS envs fill the gaps (the panel pairing
// snippet prints the pairing half of this exact shape).
type config struct {
	port              int
	panelURL          string
	token             string
	slug              string
	name              string
	version           string
	description       string
	icon              string
	needs             []string
	heartbeatInterval time.Duration
}

func getenv(keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

func loadConfig() config {
	var c config
	var needsFlag string
	flag.IntVar(&c.port, "port", 6600, "TCP port to listen on")
	flag.StringVar(&c.panelURL, "panel-url", "", "panel origin, e.g. http://127.0.0.1:8080")
	flag.StringVar(&c.token, "token", "", "pairing token (kss_…) minted by the panel")
	flag.StringVar(&c.slug, "slug", "dash", "stack slug (must match the panel row)")
	flag.StringVar(&c.name, "name", "", "display name announced to the panel")
	flag.StringVar(&c.version, "version", "", "app version announced to the panel")
	flag.StringVar(&c.description, "description", "", "short blurb announced to the panel")
	flag.StringVar(&c.icon, "icon", "", "icon key announced to the panel")
	flag.StringVar(&needsFlag, "need", "", "comma-separated capabilities the app needs, e.g. metrics.read,instances.read")
	interval := flag.Int("heartbeat-interval", 60, "seconds between pairing heartbeats (0 disables)")
	flag.Parse()
	if c.panelURL == "" {
		c.panelURL = getenv("PANEL_URL")
	}
	if c.token == "" {
		c.token = getenv("STACK_TOKEN")
	}
	if c.slug == "" || c.slug == "dash" {
		if env := getenv("STACK_SLUG"); env != "" {
			c.slug = env
		}
	}
	if c.name == "" {
		c.name = getenv("APP_NAME")
	}
	if c.name == "" {
		c.name = c.slug
	}
	if c.version == "" {
		c.version = getenv("APP_VERSION")
	}
	if c.version == "" {
		c.version = "1.0.0"
	}
	if c.description == "" {
		c.description = getenv("APP_DESCRIPTION")
	}
	if c.icon == "" {
		c.icon = getenv("APP_ICON")
	}
	if needsFlag == "" {
		needsFlag = getenv("STACK_NEEDS")
	}
	for _, n := range strings.Split(needsFlag, ",") {
		if n = strings.TrimSpace(n); n != "" {
			c.needs = append(c.needs, n)
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

// announceOnce declares who the app is and what it needs. The panel
// answers how many capability approvals are still pending — the admin
// allows them in the stack detail page, then activates.
func announceOnce(c config) (int, error) {
	type need struct {
		Capability  string `json:"capability"`
		AccessLevel string `json:"access_level"`
	}
	needs := make([]need, 0, len(c.needs))
	for _, n := range c.needs {
		access := "read"
		if strings.Contains(n, "read_write") {
			access = "read_write"
		} else if !strings.HasSuffix(n, ".read") {
			access = "allow"
		}
		needs = append(needs, need{Capability: n, AccessLevel: access})
	}
	body, err := json.Marshal(map[string]any{
		"token": c.token, "slug": c.slug,
		"name": c.name, "version": c.version,
		"description": c.description, "icon": c.icon,
		"needs": needs,
	})
	if err != nil {
		return 0, err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(c.panelURL+"/api/stacks/announce", "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("panel answered HTTP %d", resp.StatusCode)
	}
	var out struct {
		Pending int `json:"pending"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return 0, err
	}
	return out.Pending, nil
}

// announceUntilSuccess runs before the heartbeat loop: the panel must
// exist and the token must be valid before anything else matters. It
// retries on the heartbeat cadence so a panel that boots later still
// gets the announcement. The token authenticates the call — it is sent
// in the body and never written to logs.
func announceUntilSuccess(c config) {
	if c.token == "" || c.panelURL == "" {
		log.Println("announce off (set -token + -panel-url so the panel learns name/version/needs)")
		return
	}
	interval := c.heartbeatInterval
	if interval <= 0 {
		interval = 60 * time.Second
	}
	for {
		pending, err := announceOnce(c)
		if err != nil {
			log.Printf("announce: %v", err)
			time.Sleep(interval)
			continue
		}
		if pending == 0 {
			log.Printf("announce: ok (%q v%s, nothing pending)", c.name, c.version)
		} else {
			log.Printf("announce: ok (%q v%s, %d approval(s) pending — allow them in the stack detail page)", c.name, c.version, pending)
		}
		return
	}
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
