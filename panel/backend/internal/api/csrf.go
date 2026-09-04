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

// generateSecureToken generates a secure random token
func generateSecureToken(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// CSRFMiddleware creates middleware that enforces CSRF protection
func CSRFMiddleware(ctm *CSRFTokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip CSRF protection for safe methods
			if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" || r.Method == "TRACE" {
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

			// Mark token as used
			ctm.MarkTokenAsUsed(csrfToken)

			next.ServeHTTP(w, r)
		})
	}
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

// isCSRFExemptPath checks if a path should be exempt from CSRF protection
func isCSRFExemptPath(path string) bool {
	exemptPaths := []string{
		"/api/auth/login",
		"/api/auth/logout",
		"/api/auth/register",
		"/api/auth/send-verify",
		"/api/auth/verify-email",
		"/api/auth/flags",
		"/api/auth/device-id",
		"/api/settings/panel-name",
		"/api/settings/panel-logo",
		"/api/themes",
		"/api/nodes/heartbeat",
		"/health",
	}

	for _, exempt := range exemptPaths {
		if path == exempt {
			return true
		}
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