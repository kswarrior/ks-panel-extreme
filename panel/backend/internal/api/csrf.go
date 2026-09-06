package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// CSRFTokenManager manages CSRF tokens
type CSRFTokenManager struct {
	mu     sync.RWMutex
	tokens map[string]*CSRFToken
}

// CSRFToken represents a CSRF token with metadata
type CSRFToken struct {
	Token     string
	CreatedAt time.Time
	ExpiresAt time.Time
	Used      bool
}

// NewCSRFTokenManager creates a new CSRF token manager
func NewCSRFTokenManager() *CSRFTokenManager {
	return &CSRFTokenManager{
		tokens: make(map[string]*CSRFToken),
	}
}

// GenerateToken creates a new CSRF token
func (ctm *CSRFTokenManager) GenerateToken() string {
	ctm.mu.Lock()
	defer ctm.mu.Unlock()

	token := generateSecureToken(32)
	csrfToken := &CSRFToken{
		Token:     token,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(1 * time.Hour), // 1 hour expiry
		Used:      false,
	}
	ctm.tokens[token] = csrfToken
	return token
}

// ValidateToken validates a CSRF token. Tokens are reusable until expiry
// (1h): the SPA fetches one token via GET /api/csrf-token and sends it as
// X-CSRF-Token on every mutating request. Single-use semantics would force
// a token fetch per mutation and break normal SPA flows, so Used is kept
// only for observability — it never rejects. MarkTokenAsUsed remains for
// API compatibility but has no enforcement effect.
func (ctm *CSRFTokenManager) ValidateToken(token string) bool {
	ctm.mu.Lock()
	defer ctm.mu.Unlock()

	csrfToken, exists := ctm.tokens[token]
	if !exists {
		return false
	}

	// Check if token is expired
	if time.Now().After(csrfToken.ExpiresAt) {
		delete(ctm.tokens, token)
		return false
	}

	return true
}

// MarkTokenAsUsed marks a token as used
func (ctm *CSRFTokenManager) MarkTokenAsUsed(token string) {
	ctm.mu.Lock()
	defer ctm.mu.Unlock()

	if csrfToken, exists := ctm.tokens[token]; exists {
		csrfToken.Used = true
	}
}

// CleanupExpiredTokens removes expired tokens
func (ctm *CSRFTokenManager) CleanupExpiredTokens() {
	ctm.mu.Lock()
	defer ctm.mu.Unlock()

	now := time.Now()
	for token, csrfToken := range ctm.tokens {
		if now.After(csrfToken.ExpiresAt) {
			delete(ctm.tokens, token)
		}
	}
}

// generateSecureToken generates a secure random token. Fail closed: a
// short/failed crypto read must never mint a weak (part-zero) token —
// chi's Recoverer turns the panic into a 500 with no token issued.
func generateSecureToken(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		panic("csrf: crypto/rand failed: " + err.Error())
	}
	return base64.URLEncoding.EncodeToString(b)
}

// CSRFMiddleware creates middleware that enforces CSRF protection.
//
// Skip order (all cheap, before any token lookup):
//  1. Safe methods (GET/HEAD/OPTIONS/TRACE) — covers public GET /health,
//     GET /api/settings/panel-name|logo, GET /api/themes, and the WS
//     handshakes (terminal + notifications/stream are GET upgrades).
//  2. WebSocket upgrades on any method (Upgrade: websocket) — browsers
//     cannot set Authorization on WS handshakes; the terminal/stream
//     handlers do their own session-cookie auth.
//  3. Static SPA assets (/assets/, /@vite, /@id, known extensions) —
//     plain GETs that must never require a token.
//  4. Bearer-authenticated API calls (Authorization: Bearer …). Bearer
//     tokens are never auto-sent by browsers (unlike cookies), so they
//     are not CSRF-able; exempting them preserves API/CLI clients and
//     the SPA's multi-account Bearer path while cookie-only browser
//     POSTs still require the token.
//  5. Explicit public exempt paths (login/register/heartbeat/…).
func CSRFMiddleware(ctm *CSRFTokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip CSRF protection for safe methods
			if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" || r.Method == "TRACE" {
				next.ServeHTTP(w, r)
				return
			}

			// WebSocket handshake bypass (terminal, notifications/stream,
			// edge tunnel): Upgrade: websocket on any method.
			if isWebSocketUpgrade(r) {
				next.ServeHTTP(w, r)
				return
			}

			// Static asset bypass (SPA bundles must never need a token).
			if isCSRFStaticAsset(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Bearer exemption: non-browser API clients.
			if hasBearerAuth(r) {
				next.ServeHTTP(w, r)
				return
			}

			// Skip CSRF protection for API endpoints that don't require it
			if isCSRFExemptPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Get CSRF token from header
			csrfToken := r.Header.Get("X-CSRF-Token")
			if csrfToken == "" {
				// Try to get from form data
				csrfToken = r.FormValue("csrf_token")
			}

			if csrfToken == "" || !ctm.ValidateToken(csrfToken) {
				http.Error(w, "invalid CSRF token", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// hasBearerAuth reports whether the request carries an Authorization:
// Bearer credential (API keys, multi-account SPA tokens). Such requests
// are not vulnerable to cookie-CSRF and are exempt.
func hasBearerAuth(r *http.Request) bool {
	h := r.Header.Get("Authorization")
	if h == "" {
		return false
	}
	const prefix = "Bearer "
	if len(h) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		a := h[i]
		b := prefix[i]
		if a >= 'a' && a <= 'z' {
			a -= 'a' - 'A'
		}
		if b >= 'a' && b <= 'z' {
			b -= 'a' - 'A'
		}
		if a != b {
			return false
		}
	}
	return len(h) > len(prefix)
}

// isCSRFStaticAsset mirrors SecurityMiddleware.isStaticAsset so the CSRF
// layer never gates SPA bundles.
func isCSRFStaticAsset(p string) bool {
	if len(p) >= 8 && p[:8] == "/assets/" {
		return true
	}
	if len(p) >= 6 && (p[:6] == "/@vite" || p[:6] == "/@id/." || p[:4] == "/@id") {
		return true
	}
	// Extension suffixes (same list as isStaticAsset).
	for _, ext := range []string{".css", ".js", ".mjs", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot"} {
		if len(p) >= len(ext) && p[len(p)-len(ext):] == ext {
			return true
		}
	}
	return false
}

// CSRFTokenHandler provides a CSRF token to the client
func CSRFTokenHandler(ctm *CSRFTokenManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		token := ctm.GenerateToken()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"csrf_token": token,
		})
	}
}

// isCSRFExemptPath checks if a path should be exempt from CSRF protection.
// Exact matches cover the original stock exempt list (minus /api/themes —
// see below); prefix matches cover the public families that must never
// require a token:
//
//   - POST /api/auth/* (login, switch-login, register, verify, OAuth
//     start/callback — the browser has no session yet, so there is
//     nothing to forge);
//   - POST /api/nodes/heartbeat (edge token-in-body, not session cookie);
//   - GET /api/edge/tunnel (token query, WS upgrade — also covered by the
//     Upgrade bypass, kept here for non-upgrade methods);
//   - GET /api/csrf-token (the token mint itself).
//
// NOTE: GET /api/themes and GET /api/settings/panel-name|logo already pass
// via the safe-method skip. /api/settings/panel-name|logo stay exempt for
// explicitness (they have no mutating verbs on the same path). /api/themes
// is DELIBERATELY NOT exempt: POST /api/themes is admin authoring
// (MANAGE_THEMES) and MUST require a token; GET /api/themes passes via the
// safe-method skip without needing an exemption. Keeping "/api/themes" in
// the exempt list would wrongly exempt the admin POST.
func isCSRFExemptPath(path string) bool {
	exemptPaths := []string{
		"/api/auth/login",
		"/api/auth/logout",
		"/api/auth/register",
		"/api/auth/send-verify",
		"/api/auth/verify-email",
		"/api/auth/flags",
		"/api/auth/device-id",
		"/api/auth/switch-login",
		"/api/settings/panel-name",
		"/api/settings/panel-logo",
		"/api/nodes/heartbeat",
		"/health",
		"/api/csrf-token",
		"/api/authority/branding",
	}

	for _, exempt := range exemptPaths {
		if path == exempt {
			return true
		}
	}
	// Prefix families (public, unauthenticated by design).
	if len(path) >= 10 && path[:10] == "/api/auth/" {
		return true
	}
	if len(path) >= 16 && path[:16] == "/api/edge/tunnel" {
		return true
	}
	return false
}

// SetCSRFTokenCookie sets a CSRF token cookie for the frontend
func SetCSRFTokenCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "csrf_token",
		Value:    token,
		Path:     "/",
		HttpOnly: false,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		Expires:  time.Now().Add(1 * time.Hour),
	})
}

// GetCSRFTokenFromCookie retrieves a CSRF token from cookies
func GetCSRFTokenFromCookie(r *http.Request) string {
	cookie, err := r.Cookie("csrf_token")
	if err != nil {
		return ""
	}
	return cookie.Value
}

// CSRFTokenInstance is the global CSRF token manager
var CSRFTokenInstance = NewCSRFTokenManager()

// InitializeCSRFTokenManager starts the cleanup goroutine
func InitializeCSRFTokenManager() {
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		
		for range ticker.C {
			CSRFTokenInstance.CleanupExpiredTokens()
		}
	}()
}

func init() {
	InitializeCSRFTokenManager()
}