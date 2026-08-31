package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/repository"

	"github.com/go-chi/chi/v5"
)

// callerSessionToken extracts the raw session credential the request was
// authenticated with (Bearer header wins over cookie, mirroring
// AuthMiddleware) so the Sessions tab can flag "this is you" rows without
// ever exposing the token itself.
func callerSessionToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		if tok := strings.TrimSpace(h[7:]); tok != "" {
			return tok
		}
	}
	if c, err := r.Cookie(auth.SessionCookieName); err == nil {
		return c.Value
	}
	return ""
}

type securitySessionEntry struct {
	// ID is auth.TokenID(token): a stable SHA-256 prefix usable as the
	// revoke handle. Full tokens never leave the server.
	ID        string    `json:"id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	IssuedAt  time.Time `json:"issued_at"`
	LastUsed  time.Time `json:"last_used"`
	Current   bool      `json:"current"`
}

// SecurityListSessionsHandler serves GET /api/security/sessions: every
// active tracked session across all users (the Sessions tab's devices
// table). Usernames are resolved through the normal user repository so a
// renamed user renders correctly.
func SecurityListSessionsHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	userRepo := repository.NewUserRepository(con)
	names := map[int64]string{}

	tracked := auth.SessionManagerInstance.AllActiveSessions()
	out := make([]securitySessionEntry, 0, len(tracked))
	callerID := auth.TokenID(callerSessionToken(r))
	for _, s := range tracked {
		name, ok := names[s.UserID]
		if !ok {
			if u, err := userRepo.GetByID(s.UserID); err == nil && u != nil {
				name = u.Username
			}
			names[s.UserID] = name
		}
		out = append(out, securitySessionEntry{
			ID:        auth.TokenID(s.Token),
			UserID:    s.UserID,
			Username:  name,
			IPAddress: s.IPAddress,
			UserAgent: s.UserAgent,
			IssuedAt:  s.IssuedAt,
			LastUsed:  s.LastUsed,
			Current:   callerID != "" && callerID == auth.TokenID(s.Token),
		})
	}
	writeJSON(w, map[string]interface{}{
		"sessions": out,
		"total":    len(out),
	})
}

// SecurityRevokeSessionHandler serves DELETE /api/security/sessions/{id}:
// terminates one tracked session by its non-reversible TokenID. The next
// request bearing that credential gets 401 from AuthMiddleware.
func SecurityRevokeSessionHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "session id is required", http.StatusBadRequest)
		return
	}
	if !auth.SessionManagerInstance.RevokeByTokenID(id) {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]interface{}{"status": "ok"})
}

// SecurityRevokeAllSessionsHandler serves POST /api/security/sessions/revoke-all:
// terminates EVERY active tracked session for ALL users and returns how
// many were terminated.
func SecurityRevokeAllSessionsHandler(w http.ResponseWriter, r *http.Request) {
	revoked := auth.SessionManagerInstance.InvalidateAllSessions()
	log.Printf("security sessions: revoked all (%d) at the request of an admin", revoked)
	writeJSON(w, map[string]interface{}{"status": "ok", "revoked": revoked})
}
