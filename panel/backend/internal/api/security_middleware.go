package api

import (
	"bufio"
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/security"
)

// SecurityMiddleware records one security_requests telemetry row for every
// HTTP request the panel serves, AND short-circuits requests that violate
// the persisted rate-limit policy (per-IP RPM cap, unknown-UA block, or
// the global Under-Attack RPM ceiling).
//
// The row is written asynchronously in its own goroutine so a logging
// failure never blocks the response that triggered it — the same contract
// the audit-log helper (RecordActivity) uses for activity_logs.
//
// The blocking decision lives on the hot path: a blocked request never
// reaches the downstream handler, so a hostile client spinning requests
// can't starve the DB connection pool. The status we set (429 for rate
// limits, 403 for policy) is what the telemetry Insert records, so the
// Security admin page's "Blocked" tile reflects the real decisions the
// middleware made.
func SecurityMiddleware(next http.Handler) http.Handler {
	// Ensure the live state singleton is primed on the very first request
	// it serves. State.Get lazily builds it from the persisted settings
	// row, so the first request ever handled (e.g. before the PUT
	// handlers have run) sees the safe defaults.
	state := security.Get()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		path := stripQuery(r.URL.Path)
		isAsset := isStaticAsset(path)
		cfg := state.Cfg()
		clientIP := securityClientIP(r)
		// The IP allow/deny matchers work on a bare address, while
		// clientIP may carry the RemoteAddr port suffix ("1.2.3.4:5678").
		clientHost := clientIP
		if h, _, err := net.SplitHostPort(clientIP); err == nil && h != "" {
			clientHost = h
		}

		// Exempt security endpoints from DDoS blocking so admin can always
		// access the panel to disable DDoS or view status.
		isSecurityEndpoint := strings.HasPrefix(path, "/api/security")

		// 0a) Firewall deny list: an explicit admin decision, so it wins
		//     over every other check (including static assets).
		ipDenied := cfg.IPDenied(clientHost)

		// 0b) HTTP-method allowlist + suspicious-path block (WAF /
		//     Request Filtering section of the Firewall tab). Skipped for
		//     static assets like every other content check.
		methodBlocked := !isAsset && !cfg.MethodAllowed(r.Method)
		suspiciousBlocked := !isAsset && cfg.BlockSuspiciousPaths && isSuspiciousPath(path)

		// Check DDoS auto-stop cooldown: if active and cooldown expired, clear
		// it (shared helper — the port switcher's poller clears the same way
		// when no legitimate traffic ever arrives to run this branch).
		if !isAsset && !isSecurityEndpoint && state.ClearDDOSIfExpired() {
			go func() {
				security.ClearUnderAttackFlag()
				security.Get().Reload()
			}()
		}

		// DDoS stop-mode enforcement: when auto-stop is active AND the
		// configured reaction mode is "stop", refuse every request that is
		// not a security endpoint or static asset so the panel actually
		// stops forwarding traffic to the downstream handlers. In
		// "port_switch" mode the defense is relocating the listener
		// (internal/security/portswitch.go) — traffic that DOES arrive on
		// the live port must be served so the panel stays usable during
		// the attack. Security endpoints stay reachable in both modes so
		// the admin can hit the reset endpoint.
		ddosBlocked := false
		if !isAsset && !isSecurityEndpoint && state.DDOSActive() && cfg.DDOSMode == models.DDOSModeStop {
			ddosBlocked = true
		}

		// 1) Block empty User-Agents if the knob is on. Captures most
		//    scripted probes that never bother to send a UA.
		uaBlocked := cfg.BlockUnknownUA && r.UserAgent() == ""

		// 2) Per-IP rate limit. Skipped entirely for static assets so
		//    the page-load CSS/JS bundles can never be throttled under
		//    the same cap as API traffic, and for IPs on the Firewall
		//    allowlist (that list's whole purpose is bypassing throttle).
		ipBlocked := false
		if !isAsset && cfg.PerMinuteLimit > 0 && !cfg.IPAllowlisted(clientHost) {
			if !state.IPAllowed(clientIP) {
				ipBlocked = true

				// 2b) DDoS auto-stop trigger: if auto protection is enabled
				//     and this IP got rate-limited, trigger the reaction
				//     configured by ddos_mode (stop requests / move port).
				//     Detection is autonomous — it deliberately does NOT
				//     require the manual Under-Attack toggle, which is an
				//     operator choice for the global RPM ceiling, not a
				//     precondition for DDoS defense.
				if !isSecurityEndpoint && cfg.DDOSAutoStopEnabled {
					triggerDDOSAutoStop(state, cfg)
				}
			}
		}

		// 3) Under-Attack global RPM ceiling. We only enforce this when
		//    the Under-Attack toggle is on AND a global cap is
		//    configured — a panel under normal traffic shouldn't
		//    self-DoS, and the admin can disable the ceiling by setting it
		//    to 0 even while Under-Attack is on. We always tick the
		//    rolling counter so the Under-Attack toggle (when flipped on
		//    mid-traffic) sees the real rolling sum, not the count since
		//    the toggle. Skipped entirely during a DDoS auto-stop so
		//    blocked traffic can't artificially keep the global RPM high
		//    and prolong the cooldown.
		globalBlocked := false
		if !isAsset && !ddosBlocked {
			rolling := state.RecordGlobalHit(start)
			if cfg.UnderAttack && cfg.GlobalRPMLimit > 0 && rolling > cfg.GlobalRPMLimit {
				globalBlocked = true
			}
		}

		// 3b) Global burst detector: a distributed flood spread across
		//     thousands of client IPs can stay under every per-IP cap
		//     while the panel as a whole drowns. When armed (hits > 0)
		//     and auto protection is on, crossing the rolling total for
		//     the configured window trips the same reaction as the
		//     per-IP path. Skipped while a stop is already active so the
		//     flood can't keep re-arming during cooldown.
		if !isAsset && !isSecurityEndpoint && cfg.DDOSAutoStopEnabled &&
			cfg.DDOSGlobalTriggerHits > 0 && !state.DDOSActive() {
			win := int(cfg.DDOSGlobalTriggerWindow)
			if win < 1 || win > 60 {
				win = 10 // mirrors the PUT handler clamp; defensive only
			}
			if state.RecentHits(win)+1 >= cfg.DDOSGlobalTriggerHits {
				triggerDDOSAutoStop(state, cfg)
			}
		}

		// Decide on a status BEFORE we hand off to the handler. Pick the
		// most informative one: UA-empty policy uses 403 (hard policy),
		// per-IP / global rate limits use 429 (temporary throttle), the
		// DDoS auto-stop uses 503 (Service Unavailable) so it is
		// distinguishable from a generic throttle, and the Firewall
		// deny-list / suspicious-path blocks use 403 while a disallowed
		// method answers 405.
		blocked := uaBlocked || ipBlocked || globalBlocked || ddosBlocked || ipDenied || methodBlocked || suspiciousBlocked

		// WebSocket upgrades (terminal) require http.Hijacker on the
		// ResponseWriter. Our statusBytesWriter wraps w but the chain of
		// chi/cors wrappers between SecurityMiddleware and the handler may
		// not all preserve Hijacker, causing gorilla/websocket to fail with
		// "response does not implement http.Hijacker". Bypass the capture
		// wrapper for WebSocket handshakes so the original hijackable writer
		// reaches the handler.
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			if blocked {
				status := http.StatusTooManyRequests
				switch {
				case uaBlocked:
					status = http.StatusForbidden
				case ddosBlocked:
					status = http.StatusServiceUnavailable
				case methodBlocked:
					status = http.StatusMethodNotAllowed
				case ipDenied, suspiciousBlocked:
					status = http.StatusForbidden
				}
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(status)
				_, _ = w.Write([]byte(http.StatusText(status)))
			} else {
				next.ServeHTTP(w, r)
			}
			// Still record telemetry without the wrapper — use the status we
			// already decided (blocked ? status : 200) and skip byte counting.
			if isAsset {
				return
			}
			status := http.StatusOK
			if blocked {
				switch {
				case uaBlocked:
					status = http.StatusForbidden
				case ddosBlocked:
					status = http.StatusServiceUnavailable
				case methodBlocked:
					status = http.StatusMethodNotAllowed
				case ipDenied, suspiciousBlocked:
					status = http.StatusForbidden
				default:
					status = http.StatusTooManyRequests
				}
			}
			duration := time.Since(start).Milliseconds()
			var uidPtr *int64
			if !blocked {
				if uid, err := handlers.UserIDFromContext(r); err == nil {
					v := uid
					uidPtr = &v
				}
			}
			in := repository.SecurityRequestInput{
				ClientIP:   clientIP,
				Method:     r.Method,
				Path:       path,
				Status:     status,
				UserID:     uidPtr,
				UserAgent:  r.UserAgent(),
				IsAPI:      strings.HasPrefix(path, "/api/"),
				IsLogin:    repository.IsLoginPath(path),
				BytesSent:  0,
				DurationMs: duration,
				Challenged: false,
				Blocked:    blocked || status == http.StatusForbidden || status == http.StatusTooManyRequests,
			}
			ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
			go func(in repository.SecurityRequestInput) {
				defer cancel()
				con, err := repository.OpenDB()
				if err != nil {
					return
				}
				defer con.Close()
				repo := repository.NewSecurityRepository(con)
				_, _ = repo.InsertWithContext(ctx, in)
			}(in)
			return
		}
		sbw := &statusBytesWriter{ResponseWriter: w, status: http.StatusOK}
		if blocked {
			status := http.StatusTooManyRequests
			switch {
			case uaBlocked:
				status = http.StatusForbidden
			case ddosBlocked:
				status = http.StatusServiceUnavailable
			case methodBlocked:
				status = http.StatusMethodNotAllowed
			case ipDenied, suspiciousBlocked:
				status = http.StatusForbidden
			}
			sbw.status = status
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(status)
			// Short, opaque body — we don't echo the limit count so a
			// hostile client can't probe how close to the edge it is.
			_, _ = w.Write([]byte(http.StatusText(status)))
		} else {
			next.ServeHTTP(sbw, r)
		}

		if isAsset {
			return
		}

		duration := time.Since(start).Milliseconds()
		// Blocked requests never reached AuthMiddleware (we ran before
		// it), so UserIDFromContext returns an error and the row stores a
		// NULL user_id — which is exactly right: a blocked probe is
		// anonymous from this layer's perspective. Only fetch the id when
		// we actually forwarded the request through AuthMiddleware.
		var uidPtr *int64
		if !blocked {
			if uid, err := handlers.UserIDFromContext(r); err == nil {
				v := uid
				uidPtr = &v
			}
		}

		in := repository.SecurityRequestInput{
			ClientIP:   clientIP,
			Method:     r.Method,
			Path:       path,
			Status:     sbw.status,
			UserID:     uidPtr,
			UserAgent:  r.UserAgent(),
			IsAPI:      strings.HasPrefix(path, "/api/"),
			IsLogin:    repository.IsLoginPath(path),
			BytesSent:  sbw.bytes,
			DurationMs: duration,
			Challenged: false, // populated by the WAF/challenge layer when integrated
			Blocked:    blocked || sbw.status == http.StatusForbidden || sbw.status == http.StatusTooManyRequests,
		}

		// Fire-and-forget insert: open its own DB connection so it never
		// contends with the request's own work, and never reports an
		// error back to the response (a logging failure must not break
		// the request that triggered it). A timeout is applied so a slow
		// or unreachable DB never hangs this goroutine. The context is
		// detached from the request (WithoutCancel) — r.Context() dies as
		// soon as this handler returns, which used to cancel the INSERT
		// mid-flight and silently drop most telemetry rows.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
		go func(in repository.SecurityRequestInput) {
			defer cancel()
			con, err := repository.OpenDB()
			if err != nil {
				return
			}
			defer con.Close()
			repo := repository.NewSecurityRepository(con)
			_, _ = repo.InsertWithContext(ctx, in)
		}(in)
	})
}

// stripQuery trims the query string off a path so tokens / secrets
// sometimes passed inline never reach the telemetry table. A bare "?" is
// preserved politely (it leaves an empty path behind it).
func stripQuery(p string) string {
	if i := strings.IndexByte(p, '?'); i >= 0 {
		return p[:i]
	}
	return p
}

// suspiciousProbePaths are the well-known scanner/probe targets blocked
// when the Firewall tab's "Block Suspicious Requests" knob is on. Kept as
// a prefix list: real exploit kits probe dozens of variants under each of
// these roots, and an exact-match table would age badly.
var suspiciousProbePaths = []string{
	"/.env",
	"/.git",
	"/.aws",
	"/wp-admin",
	"/wp-login.php",
	"/wordpress/",
	"/phpmyadmin",
	"/pma/",
	"/vendor/phpunit",
	"/actuator",
	"/cgi-bin/",
	"/config.json",
	"/backup.sql",
	"/dump.sql",
}

// isSuspiciousPath reports whether a request path looks like an automated
// vulnerability scan rather than legitimate panel traffic.
func isSuspiciousPath(p string) bool {
	lower := strings.ToLower(p)
	for _, prefix := range suspiciousProbePaths {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

// isStaticAsset reports whether the request path targets a bundled SPA
// static asset (CSS/JS/font/image under /assets or /@vite). These rows
// are not security-relevant so logging them would just bloat the table
// with 200s every page load. They are also exempt from the per-IP rate
// limit so the page-load bundles can never drag a legitimate visitor
// over the API cap.
func isStaticAsset(p string) bool {
	if strings.HasPrefix(p, "/assets/") || strings.HasPrefix(p, "/@vite") || strings.HasPrefix(p, "/@id") {
		return true
	}
	for _, ext := range []string{".css", ".js", ".mjs", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot"} {
		if strings.HasSuffix(p, ext) {
			return true
		}
	}
	return false
}

// securityClientIP is the security-side equivalent of activity_helper's
// clientIP helper: it honours RemoteAddr first (most reliable, cannot
// be spoofed), then X-Forwarded-For when behind a trusted proxy, then
// X-Real-IP, and finally RemoteAddr as fallback.
func securityClientIP(r *http.Request) string {
	// RemoteAddr is the most reliable source as it cannot be spoofed.
	ip := r.RemoteAddr
	if ip != "" {
		return ip
	}
	// Fall back to X-Forwarded-For when behind a reverse proxy
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if parts := strings.Split(v, ","); len(parts) > 0 {
			ip = strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	// Fall back to X-Real-IP
	if v := r.Header.Get("X-Real-Ip"); v != "" {
		return strings.TrimSpace(v)
	}
	return ""
}

// statusBytesWriter wraps an http.ResponseWriter to capture the status
// code + body size the downstream handler writes, so the security (and
// any future) middleware can record them after the request completes. It
// keeps WriteHeader's behaviour unchanged for the handler (it still calls
// w.WriteHeader once with the real status) and counts bytes as they pass
// through Write.
type statusBytesWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (s *statusBytesWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusBytesWriter) Write(b []byte) (int, error) {
	n, err := s.ResponseWriter.Write(b)
	s.bytes += int64(n)
	return n, err
}

func (s *statusBytesWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := s.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("statusBytesWriter: underlying ResponseWriter does not support hijacking")
	}
	return hijacker.Hijack()
}

func (s *statusBytesWriter) Flush() {
	if flusher, ok := s.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Header passthrough is implicit via the embedded ResponseWriter.

// contentLengthHeader pulls the Content-Length response header (if set) so
// the bandwidth count can include streamed responses the handler set a
// Content-Length on but the bytes counter missed because Write was never
// invoked.
func (s *statusBytesWriter) contentLengthHeader() int64 {
	if v := s.ResponseWriter.Header().Get("Content-Length"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return 0
}

// ddosTriggerInFlight collapses bursts of simultaneous trigger attempts
// (a flood trips hundreds of blocked requests per second) into a single
// in-flight attempt, so the hot path never queues goroutines and the
// settings KV is never hammered by parallel increments.
var ddosTriggerInFlight atomic.Bool

// triggerDDOSAutoStop activates the configured DDoS reaction (stop
// requests or port switch). It enforces the operator's max-stop-count cap
// (0 = unlimited), increments the trigger counter, sets the cooldown and
// flips the persisted Under-Attack flag so the UI reflects why the panel
// stopped answering normally.
//
// All database work happens on one goroutine at a time: the previous
// version read the stop count synchronously per blocked request and let
// every blocked request spawn its own increment goroutine, which both
// slowed the hot path under exactly the load it was built for and let
// concurrent increments overshoot the max-stop-count cap.
func triggerDDOSAutoStop(state *security.State, cfg *security.Cfg) {
	// Cheap gate first: already stopped, or another attempt is mid-flight
	// (it re-reads fresh state from the DB when it finishes).
	if state.DDOSActive() || !ddosTriggerInFlight.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer ddosTriggerInFlight.Store(false)

		con, err := repository.OpenDB()
		if err != nil {
			return
		}
		defer con.Close()
		repo := repository.NewSecurityRepository(con)

		newCount, err := repo.IncrementDDOSStopCount()
		if err != nil {
			return
		}
		if cfg.DDOSMaxStopCount > 0 && newCount > cfg.DDOSMaxStopCount {
			return
		}

		stopAt := time.Now().Add(time.Duration(cfg.DDOSStopMinutes) * time.Minute)
		_ = repo.SetDDOSCooldownUntil(stopAt)
		_ = repo.SetUnderAttack(true)

		state.SetDDOSActive(true, stopAt)
		security.Get().Reload()
	}()
}
