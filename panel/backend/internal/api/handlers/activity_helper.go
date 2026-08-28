package handlers

import (
	"context"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// requestUserKey is the context key under which the auth middleware stores
// the *models.User* it loaded during the request. Caching the user here
// avoids an extra SELECT * FROM users round-trip for every audit-log write
// in handlers that touch many entities.
type requestUserKey struct{}

// userCache holds the loaded user + role display name for the duration of
// one request, so distinct handlers (the actor of one, the audit writer
// of another) share the cached lookup.
type userCache struct {
	User *models.User
	Role string
}

// withCurrentUser injects the loaded user into ctx so downstream handlers
// can read it without re-querying the DB.
func withCurrentUser(ctx context.Context, u *models.User, roleName string) context.Context {
	return context.WithValue(ctx, requestUserKey{}, &userCache{User: u, Role: roleName})
}

func currentUserFromContext(ctx context.Context) (*models.User, string, bool) {
	raw := ctx.Value(requestUserKey{})
	if raw == nil {
		return nil, "", false
	}
	c, ok := raw.(*userCache)
	if !ok || c == nil {
		return nil, "", false
	}
	return c.User, c.Role, true
}

// clientIP returns the best-effort client IP for the request. We honour
// X-Forwarded-For (first hop), X-Real-Ip, and RemoteAddr in that order so
// the panel works behind a reverse proxy without leaking the loopback IP.
func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		// XFF is a comma list; the first entry is the originating client.
		if parts := strings.Split(v, ","); len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if v := r.Header.Get("X-Real-Ip"); v != "" {
		return strings.TrimSpace(v)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

// RecordActivity writes a single audit row. Errors are swallowed (logged)
// because audit failures must NEVER break the request that triggered them;
// a successful user delete with a failed audit log is preferable to a 500
// error after the delete already committed.
//
// We resolve the actor (username + role-name + user id) via the context
// cache or, as a fallback, a fresh DB SELECT on the authenticated user id.
func RecordActivity(r *http.Request, in repository.ActivityInput) {
	// Fill in actor identity from the cache / DB if not explicitly set.
	if in.Username == "" || in.Role == "" || in.UserID == nil {
		username, role, uid := resolvedActor(r)
		if in.Username == "" {
			in.Username = username
		}
		if in.Role == "" {
			in.Role = role
		}
		if in.UserID == nil {
			in.UserID = uid
		}
	}
	in.IPAddress = clientIP(r)
	in.UserAgent = r.UserAgent()

	con, err := repository.OpenDB()
	if err != nil {
		log.Println("activity: open db:", err)
		return
	}
	defer con.Close()
	repo := repository.NewActivityRepository(con)
	if uid, err := repo.Create(in); err != nil {
		log.Println("activity: insert:", err)
	} else if uid == 0 {
		log.Println("activity: insert returned 0 id")
	}
}

// loadActorUser resolves the calling user's identity + role-name for use in
// audit-log fields. Cheaper than it looks: single SELECT per request, on
// an already-open DB the page can reuse.
func loadActorUser(r *http.Request, uid int64) (string, string, *int64) {
	con, err := repository.OpenDB()
	if err != nil {
		return "", "", nil
	}
	defer con.Close()
	userRepo := repository.NewUserRepository(con)
	u, err := userRepo.GetByID(uid)
	if err != nil {
		return "", "", nil
	}
	roleRepo := repository.NewRoleRepository(con)
	role, rerr := roleRepo.GetRoleByID(u.RoleID)
	if rerr != nil || role == nil {
		return u.Username, "", &u.ID
	}
	return u.Username, role.Name, &u.ID
}

// resolvedActor returns username + role-name + user-id-pointer for the
// caller, preferring the context cache (set once per request) over a fresh
// SELECT. Falls back to a DB lookup when nothing is cached.
func resolvedActor(r *http.Request) (username, role string, userID *int64) {
	if u, rn, ok := currentUserFromContext(r.Context()); ok && u != nil {
		uid := u.ID
		return u.Username, rn, &uid
	}
	uid, err := UserIDFromContext(r)
	if err != nil {
		return "", "", nil
	}
	return loadActorUser(r, uid)
}
