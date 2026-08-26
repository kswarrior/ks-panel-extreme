package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Session represents a user session
type Session struct {
	UserID        int64
	Token         string
	IssuedAt      time.Time
	LastUsed      time.Time
	IPAddress     string
	UserAgent     string
	IsActive      bool
	InvalidatedAt time.Time
}

// SessionManager manages user sessions
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

// NewSessionManager creates a new session manager
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*Session),
	}
}

// CreateSession creates a new session. When the live SessionPolicy caps
// sessions per user, the user's oldest active sessions are invalidated
// first so the newest login always wins.
func (sm *SessionManager) CreateSession(userID int64, token string, ipAddress, userAgent string) *Session {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	max := CurrentSessionPolicy().MaxPerUser
	if max > 0 {
		active := make([]*Session, 0, 4)
		for _, s := range sm.sessions {
			if s.UserID == userID && s.IsActive {
				active = append(active, s)
			}
		}
		// Oldest last-use first — the stalest device loses its seat.
		sort.Slice(active, func(i, j int) bool { return active[i].LastUsed.Before(active[j].LastUsed) })
		for i := 0; len(active)-i >= int(max); i++ {
			active[i].IsActive = false
			active[i].InvalidatedAt = time.Now()
		}
	}

	session := &Session{
		UserID:    userID,
		Token:     token,
		IssuedAt:  time.Now(),
		LastUsed:  time.Now(),
		IPAddress: ipAddress,
		UserAgent: userAgent,
		IsActive:  true,
	}

	sm.sessions[token] = session
	return session
}

// GetSession retrieves a session by token
func (sm *SessionManager) GetSession(token string) (*Session, bool) {
	// Full Lock, not RLock: LastUsed is refreshed here, which mutates the
	// shared *Session. Concurrent RLock holders writing the same field is a
	// data race (go test -race flags it).
	sm.mu.Lock()
	defer sm.mu.Lock()

	session, exists := sm.sessions[token]
	if !exists || !session.IsActive {
		return nil, false
	}

	// Update last used time
	session.LastUsed = time.Now()
	return session, true
}

// InvalidateSession invalidates a specific session
func (sm *SessionManager) InvalidateSession(token string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, exists := sm.sessions[token]
	if !exists {
		return false
	}

	session.IsActive = false
	session.InvalidatedAt = time.Now()
	return true
}

// InvalidateAllUserSessions invalidates all sessions for a user
func (sm *SessionManager) InvalidateAllUserSessions(userID int64) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	count := 0
	for _, session := range sm.sessions {
		if session.UserID == userID && session.IsActive {
			session.IsActive = false
			session.InvalidatedAt = time.Now()
			count++
		}
	}

	return count
}

// InvalidateAllSessionsExceptCurrent invalidates all sessions except the current one
func (sm *SessionManager) InvalidateAllSessionsExceptCurrent(userID int64, currentToken string) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	count := 0
	for token, session := range sm.sessions {
		if session.UserID == userID && session.IsActive && token != currentToken {
			session.IsActive = false
			session.InvalidatedAt = time.Now()
			count++
		}
	}

	return count
}

// TrackedSessionValid reports whether a bearer/cookie token may proceed.
//
// Revocation-list semantics: a token the manager has never seen (e.g. a
// switch-login bearer minted before this process started, or a legacy
// pre-manager token) is ALLOWED — it still carries a valid HMAC signature
// and expires by its absolute lifetime. A token that IS tracked and
// revoked or idle-expired is rejected (fail closed for known-bad).
//
// When valid, LastUsed is refreshed so both the idle check and the
// admin Sessions list stay accurate.
func (sm *SessionManager) TrackedSessionValid(token string, idleTimeout time.Duration) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, exists := sm.sessions[token]
	if !exists {
		return true
	}
	if !session.IsActive {
		return false
	}
	now := time.Now()
	if idleTimeout > 0 && now.Sub(session.LastUsed) > idleTimeout {
		session.IsActive = false
		session.InvalidatedAt = now
		return false
	}
	session.LastUsed = now
	return true
}

// AllActiveSessions returns COPIES of every active session across all
// users (the admin Sessions tab). Tokens are never exposed by callers —
// use TokenID to build stable, non-secret identifiers.
func (sm *SessionManager) AllActiveSessions() []Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	out := make([]Session, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		if s.IsActive {
			out = append(out, *s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastUsed.After(out[j].LastUsed) })
	return out
}

// TokenID derives a stable, non-reversible identifier for a session token
// (first 16 hex chars of SHA-256). The admin API uses it as the revoke
// handle so full tokens never appear in responses or logs.
func TokenID(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])[:16]
}

// RevokeByTokenID invalidates the active session whose TokenID matches id.
func (sm *SessionManager) RevokeByTokenID(id string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	for _, session := range sm.sessions {
		if session.IsActive && TokenID(session.Token) == id {
			session.IsActive = false
			session.InvalidatedAt = time.Now()
			return true
		}
	}
	return false
}

// InvalidateAllSessions invalidates EVERY active session (all users) and
// returns how many were terminated. Used by the admin "Revoke all
// sessions" action.
func (sm *SessionManager) InvalidateAllSessions() int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	count := 0
	for _, session := range sm.sessions {
		if session.IsActive {
			session.IsActive = false
			session.InvalidatedAt = time.Now()
			count++
		}
	}
	return count
}

// GetActiveSessions returns all active sessions for a user
func (sm *SessionManager) GetActiveSessions(userID int64) []*Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	var sessions []*Session
	for _, session := range sm.sessions {
		if session.UserID == userID && session.IsActive {
			sessions = append(sessions, session)
		}
	}

	return sessions
}

// CleanupExpiredSessions removes sessions idle beyond the configured
// SessionPolicy.IdleTimeout (previously a hardcoded 24h).
func (sm *SessionManager) CleanupExpiredSessions() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	idle := CurrentSessionPolicy().IdleTimeout
	if idle <= 0 {
		idle = DefaultSessionPolicy().IdleTimeout
	}
	now := time.Now()
	for token, session := range sm.sessions {
		if now.Sub(session.LastUsed) > idle {
			delete(sm.sessions, token)
		}
	}
}

// IsSessionValid checks if a session is still valid
func (sm *SessionManager) IsSessionValid(token string) bool {
	session, valid := sm.GetSession(token)
	return valid && session.IsActive
}

// SessionManagerInstance is the global session manager
var SessionManagerInstance = NewSessionManager()

// InitializeSessionManager starts the cleanup goroutine
func InitializeSessionManager() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			SessionManagerInstance.CleanupExpiredSessions()
		}
	}()
}

func init() {
	InitializeSessionManager()
}

// SessionMiddleware extends the existing AuthMiddleware to integrate with session management
func SessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get the token from the request
		var rawToken string
		var fromCookie bool

		// Check for Bearer token first
		if tok := extractBearerToken(r); tok != "" {
			rawToken = tok
		} else if cookie, err := r.Cookie(SessionCookieName); err == nil {
			rawToken = cookie.Value
			fromCookie = true
		}

		if rawToken != "" {
			// Validate the session
			if !SessionManagerInstance.IsSessionValid(rawToken) {
				// Session is invalid, clear the cookie if it exists
				if fromCookie {
					http.SetCookie(w, ClearSessionCookie(r))
				}
				http.Error(w, "session invalid", http.StatusUnauthorized)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// extractBearerToken is a helper function to extract Bearer tokens
func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) < len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}

// InvalidateUserSessions is a convenience function to invalidate all user sessions
func InvalidateUserSessions(userID int64) int {
	return SessionManagerInstance.InvalidateAllUserSessions(userID)
}

// InvalidateOtherSessions invalidates all sessions except the current one
func InvalidateOtherSessions(userID int64, currentToken string) int {
	return SessionManagerInstance.InvalidateAllSessionsExceptCurrent(userID, currentToken)
}
