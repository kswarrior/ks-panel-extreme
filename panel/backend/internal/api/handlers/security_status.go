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
func appEnvIsDev() bool {
	env := os.Getenv("KSPANEL_ENV")
	return env == "development" || env == "dev" || env == ""
}

// SecurityStatusHandler serves GET /api/security/status: a read-only
// snapshot of the panel-wide network protections the Firewall tab renders
// as status cards (CORS, CSRF, security headers, cookie flags).
//
// Honesty contract: this endpoint reports what is ACTUALLY wired into the
// router chain, not aspirations. The token-based CSRF middleware and the
// global security-header middleware exist in this package but are NOT
// mounted (a strict CSP would break the SPA's inline bootstrap/theme CSS,
// and no client token plumbing exists), so they are reported as such —
// with the mitigations that ARE live spelled out.
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
			// Token middleware exists but is intentionally not mounted.
			"token_middleware_enforced": false,
			// Live CSRF mitigations:
			"session_cookie_same_site": "Strict",
			"origin_validation":        !dev,
			"note": "Session cookie uses SameSite=Strict and cross-origin browser " +
				"requests are gated by origin validation; the X-CSRF-Token middleware " +
				"is present but not part of the active chain.",
		},
		"security_headers": map[string]interface{}{
			"enforced":         false,
			"middleware_wired": false,
			"applied_headers":  []string{},
			"note": "The global security-headers middleware is implemented but not " +
				"mounted on the router chain; responses currently carry CORS headers " +
				"from the cors router only.",
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
