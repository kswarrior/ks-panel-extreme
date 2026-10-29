package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	cookieName = "stats_session"
	sessionTTL = 7 * 24 * time.Hour
)

type session struct {
	username string
	expires  time.Time
}

var (
	sessionsMu sync.Mutex
	sessions   = make(map[string]session)
)

func env(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

// Username returns the configured admin username. ADMIN_USERNAME is preferred;
// STATS_ADMIN_USER is accepted for older deployments.
func Username() string {
	if value := env("ADMIN_USERNAME", "STATS_ADMIN_USER"); value != "" {
		return value
	}
	return "admin"
}

// Password returns the configured admin password. ADMIN_PASSWORD is preferred;
// STATS_ADMIN_PASSWORD / STATS_PASSWORD are accepted for older deployments.
func Password() string {
	return env("ADMIN_PASSWORD", "STATS_ADMIN_PASSWORD", "STATS_PASSWORD")
}

func IsConfigured() bool { return Password() != "" }

func secureEqual(a, b string) bool {
	ah := sha256.Sum256([]byte(a))
	bh := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(ah[:], bh[:]) == 1
}

func createSession(username string) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	expires := time.Now().Add(sessionTTL)

	sessionsMu.Lock()
	now := time.Now()
	for key, value := range sessions {
		if now.After(value.expires) {
			delete(sessions, key)
		}
	}
	sessions[token] = session{username: username, expires: expires}
	sessionsMu.Unlock()
	return token, expires, nil
}

func destroySession(token string) {
	sessionsMu.Lock()
	delete(sessions, token)
	sessionsMu.Unlock()
}

func sessionUser(r *http.Request) string {
	cookie, err := r.Cookie(cookieName)
	if err != nil || cookie.Value == "" {
		return ""
	}

	sessionsMu.Lock()
	value, ok := sessions[cookie.Value]
	if ok && time.Now().After(value.expires) {
		delete(sessions, cookie.Value)
		ok = false
	}
	sessionsMu.Unlock()
	if !ok {
		return ""
	}
	return value.username
}

// IsAdmin reports whether the request carries a valid session cookie or
// HTTP Basic credentials for the configured admin account.
func IsAdmin(r *http.Request) bool {
	if !IsConfigured() {
		return false
	}
	if user := sessionUser(r); user != "" && secureEqual(user, Username()) {
		return true
	}
	user, password, ok := r.BasicAuth()
	return ok && secureEqual(user, Username()) && secureEqual(password, Password())
}

// RequireAdmin wraps a handler with the admin check used by map/table APIs.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !IsAdmin(r) {
			w.Header().Set("WWW-Authenticate", `Basic realm="stats admin"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
		MaxAge:   int(sessionTTL.Seconds()),
	})
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(1, 0),
		MaxAge:   -1,
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// LoginHandler authenticates the admin and creates an HttpOnly session cookie.
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !IsConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "admin login is not configured"})
		return
	}

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	if !secureEqual(input.Username, Username()) || !secureEqual(input.Password, Password()) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	token, expires, err := createSession(Username())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create session"})
		return
	}
	setSessionCookie(w, r, token, expires)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "username": Username()})
}

// MeHandler reports the current admin session to the dashboard header.
func MeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !IsConfigured() {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "configured": false})
		return
	}
	if user := sessionUser(r); user != "" && secureEqual(user, Username()) {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "configured": true, "username": user})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "configured": true})
}

// LogoutHandler destroys the current session and clears the cookie.
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if cookie, err := r.Cookie(cookieName); err == nil {
		destroySession(cookie.Value)
	}
	clearSessionCookie(w, r)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
