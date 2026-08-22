package auth

import (
	"net/http"
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
	UserAgent    string
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

// CreateSession creates a new session
func (sm *SessionManager) CreateSession(userID int64, token string, ipAddress, userAgent string) *Session {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session := &Session{
		UserID:     userID,
		Token:      token,
		IssuedAt:   time.Now(),
		LastUsed:   time.Now(),
		IPAddress:  ipAddress,
		UserAgent: userAgent,
		IsActive:   true,
	}

	sm.sessions[token] = session
	return session
}

// GetSession retrieves a session by token
func (sm *SessionManager) GetSession(token string) (*Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

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

// CleanupExpiredSessions removes expired sessions
func (sm *SessionManager) CleanupExpiredSessions() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	now := time.Now()
	for token, session := range sm.sessions {
		// Remove sessions that haven't been used in 24 hours
		if now.Sub(session.LastUsed) > 24*time.Hour {
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