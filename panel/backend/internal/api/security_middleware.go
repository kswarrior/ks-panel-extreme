package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
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

		// Exempt security endpoints from DDoS blocking so admin can always
		// access the panel to disable DDoS or view status.
		isSecurityEndpoint := strings.HasPrefix(path, "/api/security")

		// Check DDoS auto-stop cooldown: if active and cooldown expired, clear it.
		if !isAsset && !isSecurityEndpoint {
			if state.DDOSActive() {
				stopAt := state.DDOSStopAt()
				if !stopAt.IsZero() && time.Now().After(stopAt) {
					state.ClearDDOSAutoStop()
					// Also clear UnderAttack in DB (async, best effort)
					go func() {
						con, err := repository.OpenDB()
						if err != nil {
							return
						}
						defer con.Close()
						repo := repository.NewSecurityRepository(con)
						_ = repo.SetUnderAttack(false)
						security.Get().Reload()
					}()
				}
			}
		}

		// DDoS auto-stop enforcement: when the DDoS auto-stop is active,
		// refuse every request that is not a security endpoint or static
		// asset so the panel actually stops forwarding traffic to the
		// downstream handlers. Without this short-circuit the UI badge
		// would flip to "Panel Stopped" but the panel would still serve
		// the next refresh normally. Security endpoints stay reachable
		// so the admin can hit the reset endpoint to lift the stop.
		ddosBlocked := false
		if !isAsset && !isSecurityEndpoint && state.DDOSActive() {
			ddosBlocked = true
		}

		// 1) Block empty User-Agents if the knob is on. Captures most
		//    scripted probes that never bother to send a UA.
		uaBlocked := cfg.BlockUnknownUA && r.UserAgent() == ""

		// 2) Per-IP rate limit. Skipped entirely for static assets so
		//    the page-load CSS/JS bundles can never be throttled under
		//    the same cap as API traffic.
		ipBlocked := false
		if !isAsset && cfg.PerMinuteLimit > 0 {
			if !state.IPAllowed(clientIP) {
				ipBlocked = true

				// 2b) DDoS auto-stop trigger: if UnderAttack is on and DDoS
				// auto-stop is enabled, and this IP got rate-limited,
				// trigger the auto-stop (panel stops accepting new requests).
				if !isSecurityEndpoint && cfg.UnderAttack && cfg.DDOSAutoStopEnabled {
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

		// Decide on a status BEFORE we hand off to the handler. Pick the
		// most informative one: UA-empty policy uses 403 (hard policy),
		// per-IP / global rate limits use 429 (temporary throttle), and
		// the DDoS auto-stop uses 503 (Service Unavailable) so it is
		// distinguishable from a generic throttle.
		blocked := uaBlocked || ipBlocked || globalBlocked || ddosBlocked
		sbw := &statusBytesWriter{ResponseWriter: w, status: http.StatusOK}
		if blocked {
			status := http.StatusTooManyRequests
			switch {
			case uaBlocked:
				status = http.StatusForbidden
			case ddosBlocked:
				status = http.StatusServiceUnavailable
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
		// or unreachable DB never hangs this goroutine.
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		go func(in repository.SecurityRequestInput) {
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

// triggerDDOSAutoStop attempts to trigger the DDoS auto-stop mechanism.
// It checks if max stop count has been reached, increments the counter,
// sets the cooldown, and flips UnderAttack to true.
// This runs in a goroutine so it doesn't block the request that triggered it.
func triggerDDOSAutoStop(state *security.State, cfg *security.Cfg) {
	// Check max stop count (0 = unlimited)
	if cfg.DDOSMaxStopCount > 0 {
		count := state.DDOSStopCount()
		if count >= cfg.DDOSMaxStopCount {
			return
		}
	}

	// Only trigger once per DDoS event - check if already active
	if state.DDOSActive() {
		return
	}

	go func() {
		con, err := repository.OpenDB()
		if err != nil {
			return
		}
		defer con.Close()

		repo := repository.NewSecurityRepository(con)

		// Increment stop count
		newCount, err := repo.IncrementDDOSStopCount()
		if err != nil {
			return
		}

		// Check max again after increment (race condition protection)
		if cfg.DDOSMaxStopCount > 0 && newCount > cfg.DDOSMaxStopCount {
			return
		}

		// Set cooldown
		stopAt := time.Now().Add(time.Duration(cfg.DDOSStopMinutes) * time.Minute)
		_ = repo.SetDDOSCooldownUntil(stopAt)

		// Set UnderAttack = true in DB
		_ = repo.SetUnderAttack(true)

		// Update live state
		state.SetDDOSActive(true, stopAt)
		security.Get().Reload()
	}()
}
