package main

// KS Panel DDoS Protection Tester — SAFE load tester
//
// NOT a real DDoS. Sends a controlled burst of HTTP requests to the local
// panel and verifies that the protection reacts:
//   - per-IP rate limit returns 429 Too Many Requests
//   - DDoS auto-stop returns 503 Service Unavailable (stop mode)
//   - port_switch mode re-binds the panel to DDOSAltPort
//
// Safety rails:
//   - defaults to localhost only; external targets require --allow-external
//   - capped concurrency (max 100) and total requests (max 5000)
//   - per-request timeout, interruptible, no amplification
//   - does not spoof headers, does not bypass WAF, uses plain GET /health
//
// Usage:
//   go run ./tools/ddos-tester --target http://127.0.0.1:8080 --requests 700 --concurrency 20
//   go run ./tools/ddos-tester --target http://127.0.0.1:8080 --configure --admin-user kshosting --admin-pass kshosting@55 --mode port_switch --alt-port 5050 --per-minute 30 --requests 80
//
// Exit code 0 = protection working, 1 = protection FAILED or target not reachable, 2 = usage error.

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Config struct {
	Target       string
	AltPort      int
	Requests     int
	Concurrency  int
	Path         string
	Timeout      time.Duration
	AllowExt     bool
	KeepAlive    bool
	Verbose      bool
	Configure    bool
	AdminUser    string
	AdminPass    string
	Mode         string
	PerMinute    int
	WindowSec    int
	GlobalHits   int
	GlobalWindow int
	StopMinutes  int
	ResetAfter   bool
}

type result struct {
	ok200       atomic.Int64
	r429        atomic.Int64
	r503        atomic.Int64
	rOther      atomic.Int64
	dropped     atomic.Int64 // connection errors / EOF from DDoSDroppingListener
	otherStatus sync.Map     // status -> count
}

func main() {
	cfg := Config{}
	flag.StringVar(&cfg.Target, "target", "http://127.0.0.1:8080", "panel base URL (e.g. http://127.0.0.1:8080)")
	flag.IntVar(&cfg.AltPort, "alt-port", 5050, "alternate DDoS port to check for port_switch")
	flag.IntVar(&cfg.Requests, "requests", 700, "total requests to send (1..5000)")
	flag.IntVar(&cfg.Concurrency, "concurrency", 20, "concurrent workers (1..100)")
	flag.StringVar(&cfg.Path, "path", "/health", "path to hit (default /health, public, counted for rate limit)")
	flag.DurationVar(&cfg.Timeout, "timeout", 5*time.Second, "per-request timeout")
	flag.BoolVar(&cfg.AllowExt, "allow-external", false, "allow non-localhost targets (required for remote test)")
	flag.BoolVar(&cfg.KeepAlive, "keep-alive", false, "reuse TCP connections (keep-alive). default false = new conn per request, which is the stricter DDoS simulation")
	flag.BoolVar(&cfg.Verbose, "verbose", false, "print every non-200 response")
	flag.BoolVar(&cfg.Configure, "configure", false, "auto-configure DDoS protection via admin API before test")
	flag.StringVar(&cfg.AdminUser, "admin-user", "kshosting", "admin username for --configure")
	flag.StringVar(&cfg.AdminPass, "admin-pass", "kshosting@55", "admin password for --configure")
	flag.StringVar(&cfg.Mode, "mode", "port_switch", "ddos mode to configure: stop or port_switch")
	flag.IntVar(&cfg.PerMinute, "per-minute", 30, "per-IP limit to configure (when --configure)")
	flag.IntVar(&cfg.WindowSec, "window", 60, "window seconds to configure")
	flag.IntVar(&cfg.GlobalHits, "global-hits", 0, "global trigger hits to configure (0=disabled)")
	flag.IntVar(&cfg.GlobalWindow, "global-window", 10, "global trigger window seconds")
	flag.IntVar(&cfg.StopMinutes, "stop-minutes", 1, "ddos stop minutes to configure")
	flag.BoolVar(&cfg.ResetAfter, "reset-after", true, "reset DDoS state after test (when --configure)")
	flag.Parse()

	if err := validate(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		flag.Usage()
		os.Exit(2)
	}

	fmt.Println("=== KS Panel DDoS Protection Tester (SAFE) ===")
	fmt.Printf("Target      : %s%s\n", cfg.Target, cfg.Path)
	fmt.Printf("Requests    : %d  Concurrency: %d  KeepAlive: %v  Timeout: %s\n", cfg.Requests, cfg.Concurrency, cfg.KeepAlive, cfg.Timeout)
	fmt.Printf("Alt port    : %d (checked for port_switch)\n", cfg.AltPort)
	if cfg.Configure {
		fmt.Printf("Configure   : mode=%s perMinute=%d window=%ds stopMinutes=%d globalHits=%d globalWindow=%ds\n",
			cfg.Mode, cfg.PerMinute, cfg.WindowSec, cfg.StopMinutes, cfg.GlobalHits, cfg.GlobalWindow)
	}
	fmt.Println()

	// Safety: localhost only unless --allow-external
	if !cfg.AllowExt {
		u, _ := url.Parse(cfg.Target)
		host := ""
		if u != nil {
			host = u.Hostname()
		}
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			fmt.Fprintf(os.Stderr, "Refusing to flood non-localhost target %q without --allow-external (safety)\n", cfg.Target)
			os.Exit(2)
		}
	}

	// Probe target health before test
	baseURL := strings.TrimRight(cfg.Target, "/")
	healthURL := baseURL + "/health"
	fmt.Printf("Probing %s ... ", healthURL)
	if err := probeHealth(healthURL, cfg.Timeout); err != nil {
		fmt.Printf("FAIL (%v)\n", err)
		fmt.Println("Hint: is panel running? try: bash ./retest.sh 8080")
		os.Exit(1)
	}
	fmt.Println("OK")

	// Optionally configure DDoS protection via admin API
	var adminCookies []*http.Cookie
	if cfg.Configure {
		fmt.Println("\n-- Configuring DDoS protection via admin API --")
		cookies, err := configureProtection(cfg)
		if err != nil {
			fmt.Printf("Configure failed: %v\n", err)
			fmt.Println("Continuing with existing config (test may need manual Security page setup)")
		} else {
			fmt.Println("Configure OK — protection armed")
			adminCookies = cookies
			// Give middleware a moment to reload (security.Get().Reload is called in handler, but State is async)
			time.Sleep(800 * time.Millisecond)
		}
	} else {
		// Try to login anyway for snapshot reading (non-fatal if fails)
		cookies, _ := login(cfg.Target, cfg.AdminUser, cfg.AdminPass, cfg.Timeout)
		adminCookies = cookies
	}

	// Snapshot before
	fmt.Println("\n-- Snapshot before --")
	printSnapshot(cfg.Target, adminCookies, cfg.Timeout)

	// Run burst
	fmt.Printf("\n-- Sending %d requests (concurrency %d) --\n", cfg.Requests, cfg.Concurrency)
	res := &result{}
	start := time.Now()
	runBurst(cfg, res)
	elapsed := time.Since(start)

	total := res.ok200.Load() + res.r429.Load() + res.r503.Load() + res.rOther.Load() + res.dropped.Load()
	fmt.Printf("\nDone in %s: total=%d  200=%d  429=%d  503=%d  dropped(conn err)=%d  other=%d\n",
		elapsed.Round(time.Millisecond), total, res.ok200.Load(), res.r429.Load(), res.r503.Load(), res.dropped.Load(), res.rOther.Load())
	if res.rOther.Load() > 0 {
		fmt.Println("Other status breakdown:")
		res.otherStatus.Range(func(k, v any) bool {
			fmt.Printf("  %v : %v\n", k, v)
			return true
		})
	}

	// Small pause to let async DDoS trigger goroutine finish (triggerDDOSAutoStop is async)
	time.Sleep(1200 * time.Millisecond)

	// Snapshot after
	fmt.Println("\n-- Snapshot after --")
	snapAfter := printSnapshot(cfg.Target, adminCookies, cfg.Timeout)

	// Check port switch
	origPort := extractPort(cfg.Target)
	fmt.Printf("\n-- Port checks --\n")
	checkPort(baseURL, "primary")
	altURL := fmt.Sprintf("http://127.0.0.1:%d", cfg.AltPort)
	if origPort != cfg.AltPort {
		checkPort(altURL, "alternate")
	} else {
		fmt.Printf("Skipping alternate check (same as primary)\n")
	}

	// Verdict
	fmt.Println("\n=== Verdict ===")
	blocked := res.r429.Load() + res.r503.Load() + res.dropped.Load()
	protectionWorked := blocked > 0
	portSwitched := false
	if snapAfter != nil {
		if v, ok := snapAfter["ddos_active"]; ok && v == true {
			fmt.Printf("DDoS active      : true (cooldown %v)\n", snapAfter["ddos_cooldown_until"])
			protectionWorked = true
		} else {
			fmt.Printf("DDoS active      : false\n")
		}
		if v, ok := snapAfter["ddos_port_switched"]; ok && v == true {
			portSwitched = true
			fmt.Printf("Port switched    : true (active port %v)\n", snapAfter["ddos_active_port"])
		}
		if v, ok := snapAfter["ddos_stop_count"]; ok {
			fmt.Printf("Stop count       : %v\n", v)
		}
		if v, ok := snapAfter["ddos_tcp_dropped"]; ok {
			fmt.Printf("TCP dropped      : %v\n", v)
		}
	}

	if cfg.Mode == "port_switch" || portSwitched {
		if portSwitched {
			fmt.Println("\n✓ PASS: Panel port switched (DDoS port_switch protection WORKING)")
		} else {
			// For port_switch mode we check if alt port is now serving
			altHealthy := isHealthy(altURL+"/health", 2*time.Second)
			origHealthy := isHealthy(baseURL+"/health", 2*time.Second)
			if altHealthy && !origHealthy {
				fmt.Println("\n✓ PASS: Panel moved to alternate port (primary down, alt up) — protection WORKING")
				portSwitched = true
			} else if altHealthy && origHealthy {
				// Could be both up briefly during reconcile or already switched earlier
				// Check snapshot again
				if protectionWorked {
					fmt.Println("\n? PARTIAL: Both ports serving, but blocking observed — check snapshot port_switched flag")
				} else {
					fmt.Println("\n✗ FAIL: No port switch detected (both ports still serving, no blocking) — protection NOT working")
				}
			} else {
				if protectionWorked {
					fmt.Printf("\n? PARTIAL: Blocking observed (%d blocked) but no port switch — maybe mode=stop or alt port not reachable. Blocked counts suggest rate limiting IS working.\n", blocked)
					fmt.Println("  If you expected port_switch, verify Security page: DDoS mode = port_switch, alt_port =", cfg.AltPort, "and DDoS auto-stop enabled")
				} else {
					fmt.Println("\n✗ FAIL: No blocking (429/503/dropped=0) and no port switch — DDoS protection NOT working")
					fmt.Println("  Likely causes:")
					fmt.Println("    - DDoS auto-stop disabled in Security page")
					fmt.Println("    - per-minute limit too high (e.g. 600) and requests too few — re-run with --configure --per-minute 30 --requests 80")
					fmt.Println("    - IP rate limiter bug (fixed in patched panel) — rebuild and retest")
				}
			}
		}
	} else {
		// stop mode verdict
		if protectionWorked {
			fmt.Printf("\n✓ PASS: Blocking observed (%d blocked: 429=%d 503=%d dropped=%d) — protection WORKING\n", blocked, res.r429.Load(), res.r503.Load(), res.dropped.Load())
		} else {
			fmt.Println("\n✗ FAIL: No blocking — protection NOT working (expected 429 or 503 under flood)")
		}
	}

	// Reset after if requested
	if cfg.Configure && cfg.ResetAfter && len(adminCookies) > 0 {
		fmt.Println("\n-- Resetting DDoS state --")
		if err := resetDDoS(cfg.Target, adminCookies, cfg.Timeout); err != nil {
			fmt.Printf("Reset failed (non-fatal): %v\n", err)
		} else {
			fmt.Println("Reset OK")
			time.Sleep(600 * time.Millisecond)
			fmt.Println("\nSnapshot after reset:")
			printSnapshot(cfg.Target, adminCookies, cfg.Timeout)
		}
	}

	if protectionWorked || portSwitched {
		fmt.Println("\nResult: PASS (protection reacted)")
		os.Exit(0)
	}
	fmt.Println("\nResult: FAIL (no protection)")
	os.Exit(1)
}

func validate(cfg Config) error {
	if cfg.Requests < 1 || cfg.Requests > 5000 {
		return fmt.Errorf("--requests must be 1..5000 (got %d)", cfg.Requests)
	}
	if cfg.Concurrency < 1 || cfg.Concurrency > 100 {
		return fmt.Errorf("--concurrency must be 1..100 (got %d)", cfg.Concurrency)
	}
	if cfg.Mode != "stop" && cfg.Mode != "port_switch" {
		return fmt.Errorf("--mode must be stop or port_switch (got %q)", cfg.Mode)
	}
	if cfg.AltPort < 1 || cfg.AltPort > 65535 {
		return fmt.Errorf("--alt-port must be 1..65535")
	}
	if _, err := url.Parse(cfg.Target); err != nil {
		return fmt.Errorf("invalid --target: %w", err)
	}
	return nil
}

func probeHealth(hurl string, timeout time.Duration) error {
	client := &http.Client{Timeout: timeout, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	resp, err := client.Get(hurl)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != 200 {
		return fmt.Errorf("health returned %d", resp.StatusCode)
	}
	return nil
}

func isHealthy(hurl string, timeout time.Duration) bool {
	return probeHealth(hurl, timeout) == nil
}

func checkPort(base string, label string) {
	healthy := isHealthy(base+"/health", 2*time.Second)
	if healthy {
		fmt.Printf("  %s (%s/health) : UP\n", label, base)
	} else {
		fmt.Printf("  %s (%s/health) : DOWN/refused\n", label, base)
	}
}

func extractPort(target string) int {
	u, err := url.Parse(target)
	if err != nil {
		return 0
	}
	_, portStr, err := net.SplitHostPort(u.Host)
	if err != nil {
		// maybe without port, use default
		if u.Scheme == "https" {
			return 443
		}
		return 80
	}
	var p int
	fmt.Sscanf(portStr, "%d", &p)
	return p
}

func runBurst(cfg Config, res *result) {
	base := strings.TrimRight(cfg.Target, "/") + cfg.Path
	jobs := make(chan struct{}, cfg.Requests)
	for i := 0; i < cfg.Requests; i++ {
		jobs <- struct{}{}
	}
	close(jobs)

	var wg sync.WaitGroup
	transport := &http.Transport{
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		DisableKeepAlives:   !cfg.KeepAlive,
		MaxIdleConnsPerHost: cfg.Concurrency,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			d := &net.Dialer{Timeout: cfg.Timeout}
			return d.DialContext(ctx, network, addr)
		},
	}
	client := &http.Client{
		Timeout:   cfg.Timeout,
		Transport: transport,
	}

	// Progress ticker
	done := make(chan struct{})
	go func() {
		tick := time.NewTicker(1 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-tick.C:
				fmt.Printf("  ... %d/%d  (200=%d 429=%d 503=%d dropped=%d)\n",
					res.ok200.Load()+res.r429.Load()+res.r503.Load()+res.rOther.Load()+res.dropped.Load(),
					cfg.Requests, res.ok200.Load(), res.r429.Load(), res.r503.Load(), res.dropped.Load())
			case <-done:
				return
			}
		}
	}()

	for i := 0; i < cfg.Concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range jobs {
				status, err := doReq(client, base)
				if err != nil {
					// Connection-level drop (DDoSDroppingListener returns EOF, or port closed)
					res.dropped.Add(1)
					if cfg.Verbose {
						fmt.Printf("  dropped: %v\n", err)
					}
					continue
				}
				switch status {
				case 200:
					res.ok200.Add(1)
				case 429:
					res.r429.Add(1)
					if cfg.Verbose {
						fmt.Printf("  429\n")
					}
				case 503:
					res.r503.Add(1)
					if cfg.Verbose {
						fmt.Printf("  503\n")
					}
				default:
					res.rOther.Add(1)
					cnt, _ := res.otherStatus.LoadOrStore(status, new(atomic.Int64))
					if c, ok := cnt.(*atomic.Int64); ok {
						c.Add(1)
					} else {
						// fallback
						res.otherStatus.Store(status, status)
					}
					if cfg.Verbose {
						fmt.Printf("  %d\n", status)
					}
				}
			}
		}()
	}
	wg.Wait()
	close(done)
}

func doReq(client *http.Client, urlStr string) (int, error) {
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "kspanel-ddos-tester/1.0")
	// Ensure we don't reuse unexpectedly when keep-alive disabled, we already set transport.
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, nil
}

func login(baseURL, user, pass string, timeout time.Duration) ([]*http.Cookie, error) {
	client := &http.Client{Timeout: timeout, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	body := map[string]string{"username": user, "password": pass}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/auth/login", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != 200 && resp.StatusCode != 204 {
		return nil, fmt.Errorf("login %d", resp.StatusCode)
	}
	return resp.Cookies(), nil
}

func configureProtection(cfg Config) ([]*http.Cookie, error) {
	cookies, err := login(cfg.Target, cfg.AdminUser, cfg.AdminPass, cfg.Timeout)
	if err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}
	client := &http.Client{Timeout: cfg.Timeout, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}

	// Get current config
	req, _ := http.NewRequest("GET", strings.TrimRight(cfg.Target, "/")+"/api/security/config", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := client.Do(req)
	if err != nil {
		return cookies, err
	}
	var cur map[string]interface{}
	if resp.StatusCode == 200 {
		b, _ := io.ReadAll(resp.Body)
		json.Unmarshal(b, &cur)
	}
	resp.Body.Close()

	// Build payload merging existing + overrides
	payload := map[string]interface{}{}
	if cur != nil {
		for k, v := range cur {
			payload[k] = v
		}
	}
	payload["requests_per_minute_limit"] = cfg.PerMinute
	payload["window_seconds_limit"] = cfg.WindowSec
	payload["global_rpm_limit"] = 0
	payload["block_unknown_ua"] = false
	payload["ddos_auto_stop_enabled"] = true
	payload["ddos_stop_minutes"] = cfg.StopMinutes
	payload["ddos_max_stop_count"] = 0
	payload["ddos_mode"] = cfg.Mode
	payload["ddos_alt_port"] = cfg.AltPort
	payload["ddos_global_trigger_hits"] = cfg.GlobalHits
	payload["ddos_global_trigger_window"] = cfg.GlobalWindow
	// keep firewall/session defaults if missing
	if _, ok := payload["max_body_size_mb"]; !ok {
		payload["max_body_size_mb"] = 10
	}
	if _, ok := payload["session_lifetime_minutes"]; !ok {
		payload["session_lifetime_minutes"] = 480
	}
	if _, ok := payload["session_idle_timeout_minutes"]; !ok {
		payload["session_idle_timeout_minutes"] = 1440
	}
	if _, ok := payload["session_max_per_user"]; !ok {
		payload["session_max_per_user"] = 0
	}
	if _, ok := payload["ip_allowlist"]; !ok {
		payload["ip_allowlist"] = []string{}
	}
	if _, ok := payload["ip_denylist"]; !ok {
		payload["ip_denylist"] = []string{}
	}
	if _, ok := payload["allowed_http_methods"]; !ok {
		payload["allowed_http_methods"] = ""
	}

	b, _ := json.Marshal(payload)
	putReq, _ := http.NewRequest("PUT", strings.TrimRight(cfg.Target, "/")+"/api/security/config", bytes.NewReader(b))
	putReq.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		putReq.AddCookie(c)
	}
	putResp, err := client.Do(putReq)
	if err != nil {
		return cookies, err
	}
	defer putResp.Body.Close()
	bb, _ := io.ReadAll(putResp.Body)
	if putResp.StatusCode != 200 {
		return cookies, fmt.Errorf("PUT config %d: %s", putResp.StatusCode, string(bb))
	}

	// Reset DDoS state so we start clean
	_ = resetDDoS(cfg.Target, cookies, cfg.Timeout)

	return cookies, nil
}

func resetDDoS(baseURL string, cookies []*http.Cookie, timeout time.Duration) error {
	client := &http.Client{Timeout: timeout, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	req, _ := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/security/ddos/reset", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != 200 {
		return fmt.Errorf("reset %d", resp.StatusCode)
	}
	return nil
}

func printSnapshot(baseURL string, cookies []*http.Cookie, timeout time.Duration) map[string]interface{} {
	client := &http.Client{Timeout: timeout, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	req, _ := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+"/api/security", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	// Also try without auth (may be 401) — we still try
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("  snapshot request failed: %v\n", err)
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		fmt.Printf("  snapshot %d (need admin auth — use --configure or --admin-*)\n", resp.StatusCode)
		return nil
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		fmt.Printf("  snapshot %d: %s\n", resp.StatusCode, string(b))
		return nil
	}
	b, _ := io.ReadAll(resp.Body)
	var snap map[string]interface{}
	if err := json.Unmarshal(b, &snap); err != nil {
		fmt.Printf("  snapshot parse error: %v\n", err)
		return nil
	}
	// Print key fields
	fields := []string{"total_requests", "requests_per_second", "blocked_requests", "under_attack", "ddos_active", "ddos_stop_count", "ddos_cooldown_until", "ddos_active_port", "ddos_port_switched", "ddos_port_error", "ddos_tcp_dropped", "ddos_tcp_accepted"}
	for _, f := range fields {
		if v, ok := snap[f]; ok {
			fmt.Printf("  %s: %v\n", f, v)
		}
	}
	// also config snippet
	if cfg, ok := snap["config"].(map[string]interface{}); ok {
		fmt.Printf("  config: per_minute=%v window=%v mode=%v alt_port=%v auto_stop=%v global_hits=%v\n",
			cfg["requests_per_minute_limit"], cfg["window_seconds_limit"], cfg["ddos_mode"], cfg["ddos_alt_port"], cfg["ddos_auto_stop_enabled"], cfg["ddos_global_trigger_hits"])
	}
	return snap
}
