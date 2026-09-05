package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/security"
)

// appEnvIsDev mirrors the router-level development check so the status
// endpoint reports CORS behaviour consistently with what the chain does.
// Fail-closed like api.isDevelopment: unset KSPANEL_ENV is production.
func appEnvIsDev() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("KSPANEL_ENV")))
	return env == "development" || env == "dev"
}

// SecurityStatusHandler serves GET /api/security/status: a read-only
// snapshot of the panel-wide network protections the Firewall tab renders
// as status cards (CORS, CSRF, security headers, cookie flags).
//
// Honesty contract: this endpoint reports what is ACTUALLY wired into the
// router chain, not aspirations. The token-based CSRF middleware and the
// global security-header middleware ARE mounted in NewRouter (after cors,
// around SecurityMiddleware) with SPA-safe CSP ('unsafe-inline' for
// script/style only, for the branded bootstrap) and WS/static/Bearer
// bypasses, and the SPA fetches X-CSRF-Token from GET /api/csrf-token.
func SecurityStatusHandler(w http.ResponseWriter, r *http.Request) {
	dev := appEnvIsDev()

	allowedOrigins := os.Getenv("KSPANEL_ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5050,http://localhost:3000,http://127.0.0.1:5050,http://127.0.0.1:3000"
	}
	origins := []string{}
	for _, o := range strings.Split(allowedOrigins, ",") {
		if s := strings.TrimSpace(o); s != "" {
			origins = append(origins, s)
		}
	}

	writeJSON(w, map[string]interface{}{
		// CORS is handled by the go-chi cors router: credentials-bearing
		// requests are answered with an echoed concrete Origin in dev, and
		// validated against the KSPANEL_ALLOWED_ORIGINS list in prod.
		"cors": map[string]interface{}{
			"credentials":       true,
			"development_mode":  dev,
			"origin_validation": !dev,
			"allowed_origins":   origins,
		},
		"csrf": map[string]interface{}{
			// Token middleware IS mounted globally (CSRFMiddleware in
			// NewRouter): cookie-only mutating requests without
			// X-CSRF-Token get 403. Safe methods, WS upgrades, static
			// assets, Bearer auth and public families (POST /api/auth/*,
			// POST /api/nodes/heartbeat, /api/edge/tunnel,
			// GET /api/csrf-token) are exempt by design.
			"token_middleware_enforced": true,
			// Live CSRF mitigations:
			"session_cookie_same_site": "Strict",
			"origin_validation":        !dev,
			"note": "X-CSRF-Token middleware enforced globally; exempt: safe " +
				"methods, Upgrade: websocket, static assets, Bearer auth, " +
				"POST /api/auth/*, POST /api/nodes/heartbeat, /api/edge/tunnel. " +
				"SPA mints tokens via GET /api/csrf-token. SameSite=Strict + " +
				"origin validation remain as defense-in-depth.",
		},
		"security_headers": map[string]interface{}{
			"enforced":         true,
			"middleware_wired": true,
			"applied_headers": []string{
				"Content-Security-Policy",
				"X-Content-Type-Options",
				"X-Frame-Options",
				"X-XSS-Protection",
				"Referrer-Policy",
				"Permissions-Policy",
				"Cross-Origin-Opener-Policy",
				"Cross-Origin-Resource-Policy",
				"Cross-Origin-Embedder-Policy",
				"Strict-Transport-Security",
			},
			"note": "SecurityHeadersMiddleware + XSSProtectionMiddleware + " +
				"Sanitize/Validation mounted globally in NewRouter (after cors, " +
				"around SecurityMiddleware). CSP allows 'unsafe-inline' for " +
				"script/style only (branded bootstrap + Vite); HSTS only on " +
				"HTTPS/X-Forwarded-Proto=https.",
		},
		"request_limits": map[string]interface{}{
			// Mirrors the live DynamicMaxBodySize middleware source.
			"max_body_mb": security.Get().Cfg().MaxBodySizeBytes >> 20,
		},
		"cookie": cookieSecurityInfo(r),
	})
}

// cookieSecurityInfo describes the session cookie's effective attributes
// for the Sessions tab's "Cookie Security" card. Secure reflects THIS
// request's transport (same trust model NewSessionCookie uses).
func cookieSecurityInfo(r *http.Request) map[string]interface{} {
	return map[string]interface{}{
		"name":             auth.SessionCookieName,
		"host_prefix":      strings.HasPrefix(auth.SessionCookieName, "__Host-"),
		"http_only":        true,
		"same_site":        "Strict",
		"secure":           auth.IsSecureRequest(r),
		"path":             "/",
		"lifetime_min":     int(auth.SessionTTL().Minutes()),
		"idle_timeout_min": int(auth.CurrentSessionPolicy().IdleTimeout.Minutes()),
	}
}
