package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/security"
)

// ctxKey is a private type to avoid context value collisions.
type ctxKey string

// expiryKey stores the absolute expiry time alongside userID.
const expiryKey ctxKey = "sessionExpiry"

// AuthMiddleware reads the HMAC-signed session credentials — either the
// session_id cookie or an `Authorization: Bearer <token>` header — verifies
// them (signature + max-age), injects the userID and absolute expiry into
// the request context, and rotates the cookie (sliding expiry) when the
// session is nearing the end of its life.
//
// The Bearer path exists so the SPA can hold several accounts at once: each
// account keeps its own token in the browser (like Discord/Chrome multi-
// profile), and the active one is sent as a Bearer header on every API
// request regardless of which user owns the single HttpOnly cookie. A
// request that carries a Bearer header always wins over the cookie, so the
// active account is unambiguous.
//
// Rotation bounds the impact of a stolen cookie: an attacker who lifted a
// valid session has at most auth.SessionTTL from their last use of it,
// because every legitimate request the victim makes past the rotation
// window invalidates the old cookie value (the new one bears a fresh
// issued-at). Active users never feel the rotation since the new cookie
// is written transparently on the response.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// A Bearer token takes precedence over the cookie when both are
		// present — the SPA is being explicit about which account the
		// request is for. Cookies are only used as the fallback so the
		// original single-session flow keeps working unchanged.
		var rawToken string
		var fromCookie bool
		if tok := extractBearerToken(r); tok != "" {
			rawToken = tok
		} else if cookie, err := r.Cookie(auth.SessionCookieName); err == nil {
			rawToken = cookie.Value
			fromCookie = true
		} else {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		uid, issuedAt, err := auth.ValidateSessionToken(rawToken)
		if err != nil {
			http.Error(w, "invalid session", http.StatusUnauthorized)
			return
		}

		now := time.Now()
		policy := auth.CurrentSessionPolicy()

		// Enforce a server-side max age independent of the cookie's
		// Expires/MaxAge (which a client can strip). A legacy token with
		// no embedded issued-at reports the Unix epoch, so it lands here
		// and is treated as expired — forcing a single re-login rather
		// than honouring an unbounded bearer.
		if !issuedAt.IsZero() && now.Sub(issuedAt) > policy.Lifetime {
			if fromCookie {
				http.SetCookie(w, auth.ClearSessionCookie(r))
			}
			http.Error(w, "session expired", http.StatusUnauthorized)
			return
		}

		// Consult the session manager's revocation list: a tracked
		// session that an admin revoked (or that idled out past the
		// Sessions-tab idle timeout) is rejected here. Untracked tokens
		// still pass — they remain bounded by the absolute lifetime
		// above. This is what makes the Security page's "Revoke"
		// actions effective rather than cosmetic.
		if !auth.SessionManagerInstance.TrackedSessionValid(rawToken, policy.IdleTimeout) {
			if fromCookie {
				http.SetCookie(w, auth.ClearSessionCookie(r))
			}
			http.Error(w, "session revoked", http.StatusUnauthorized)
			return
		}

		// Suspended users are blocked even when they still hold a valid
		// session cookie/bearer (e.g. an admin suspended them while they
		// were logged in). The IsUserSuspended check is cheap (single row)
		// and the DB connection is opened per-request here (short-lived) so
		// the invalidation takes effect on the very next request without
		// waiting for the session to expire or be revoked via the manager.
		if con, err := repository.OpenDB(); err == nil {
			if suspended, until, _ := repository.NewUserRepository(con).IsUserSuspended(uid); suspended {
				_ = con.Close()
				if fromCookie {
					http.SetCookie(w, auth.ClearSessionCookie(r))
				}
				if until != nil {
					http.Error(w, "account suspended until "+until.Format("2006-01-02 15:04"), http.StatusForbidden)
				} else {
					http.Error(w, "account suspended indefinitely", http.StatusForbidden)
				}
				return
			}
			_ = con.Close()
		}

		// Compute the absolute expiry we carry in context for any handler
		// that wants it (e.g. to render a countdown or to keep the
		// cookie + context in lockstep). Existing expiry-rounding falls
		// back to a fresh TTL when the token carried no issued-at.
		var expiry time.Time
		if issuedAt.IsZero() {
			expiry = now.Add(policy.Lifetime)
		} else {
			expiry = issuedAt.Add(policy.Lifetime)
		}

		// Sliding expiry on the cookie only. The SPA is in charge of the
		// Bearer tokens it uses for the multi-account switcher, so we
		// leave those untouched — minting a fresh one would desync the
		// value the SPA stored with the one the server now expects.
		if fromCookie && auth.ShouldRotate(expiry) {
			newExpiry := now.Add(policy.Lifetime)
			newValue := auth.GenerateSessionToken(uid, now)
			// Keep the manager in lockstep with rotation: register the
			// replacement token and retire the old value so the admin
			// Sessions list shows exactly the live credentials.
			auth.SessionManagerInstance.CreateSession(uid, newValue, r.RemoteAddr, r.UserAgent())
			auth.SessionManagerInstance.InvalidateSession(rawToken)
			http.SetCookie(w, auth.NewSessionCookie(r, newValue, newExpiry))
			expiry = newExpiry
		}

		ctx := context.WithValue(r.Context(), handlers.UserIDKey, uid)
		ctx = context.WithValue(ctx, expiryKey, expiry)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// extractBearerToken pulls a session token out of an Authorization header of
// the form `Bearer <token>`. Returns "" when the header is absent or not a
// Bearer scheme so callers can fall back to the cookie. We trim surrounding
// whitespace; an empty token after "Bearer " still returns "" so the cookie
// fallback wins rather than a guaranteed-invalid validation.
func extractBearerToken(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(h) < len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}

// MustAuth extracts the authenticated userID from context using the typed key.
func MustAuth(r *http.Request) (int64, error) {
	return handlers.UserIDFromContext(r)
}

// PermissionMiddleware wraps a route requiring a specific permission.
// It uses MustAuth so expiry is enforced uniformly through AuthMiddleware.
func PermissionMiddleware(perm string, checker *permissions.Checker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid, err := MustAuth(r)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			if err := checker.Ensure(uid, perm); err != nil {
				http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// requirePermission is a chi-style middleware that enforces a permission key on
// the current user. It opens its own DB connection (chi middleware can't easily
// share one across the request lifecycle here), which is fine for these
// short-lived admin endpoints.
func requirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid, err := MustAuth(r)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			con, err := repository.OpenDB()
			if err != nil {
				http.Error(w, "server error", http.StatusInternalServerError)
				return
			}
			defer con.Close()
			checker := permissions.NewChecker(con)
			if err := checker.Ensure(uid, perm); err != nil {
				http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// requireAnyPermission enforces that the user holds ANY of the supplied keys.
// It is the granular-route companion to requirePermission: admin action routes
// now pass both their area umbrella (MANAGE_USERS) and the matching CRUD verb
// (USERS_CREATE), so a role holding EITHER is allowed through. This is what
// lets the umbrella-implies-all-actions contract live alongside the new
// per-action keys without forcing a migration of existing role grants.
//
// Example:
//
//	r.With(requireAnyPermission(permissions.ManageUsersKey, permissions.UsersCreateKey)).Post("/", ...)
func requireAnyPermission(keys ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid, err := MustAuth(r)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			if len(keys) == 0 {
				http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
				return
			}
			con, err := repository.OpenDB()
			if err != nil {
				http.Error(w, "server error", http.StatusInternalServerError)
				return
			}
			defer con.Close()
			checker := permissions.NewChecker(con)
			if err := checker.EnsureAny(uid, keys...); err != nil {
				http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// requireUmbrellaOrAction is a thin wrapper over requireAnyPermission that
// takes an area Group plus the specific action verb to gate. It makes the
// route table read as "this route is for <action> on <area>" — the umbrella
// fallback stays visible in the call rather than being implicit.
func requireUmbrellaOrAction(group permissions.Group, action permissions.Action) func(http.Handler) http.Handler {
	return requireAnyPermission(group.KeysForAction(action)...)
}

// MaxBodySize returns middleware that limits the request body size.
// This prevents DoS attacks via large request bodies.
func MaxBodySize(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Limit the request body size
			r.Body = io.NopCloser(io.LimitReader(r.Body, maxBytes))
			next.ServeHTTP(w, r)
		})
	}
}

// DynamicMaxBodySize is the router-level companion of MaxBodySize that
// reads the per-request cap from the live security config (Firewall tab's
// "Request Size Limit") instead of a compile-time constant. The state
// singleton is captured once at chain construction; each request only
// pays an atomic pointer load.
// Backup upload endpoints need a far larger window than the generic
// 10 MiB default — a database snapshot can be hundreds of megabytes — so
// those paths are exempted to a dedicated 1 GiB ceiling.
func DynamicMaxBodySize() func(http.Handler) http.Handler {
	state := security.Get()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			limit := int64(10 << 20)
			if c := state.Cfg(); c != nil && c.MaxBodySizeBytes > 0 {
				limit = c.MaxBodySizeBytes
			}
			// Backup uploads can legitimately be very large; lift the cap
			// for those routes so the LimitReader does not silently
			// truncate a valid SQLite file mid-stream.
			if strings.HasPrefix(r.URL.Path, "/api/database/backups") {
				const backupLimit = 1 << 30 // 1 GiB
				if limit < backupLimit {
					limit = backupLimit
				}
			}
			r.Body = io.NopCloser(io.LimitReader(r.Body, limit))
			next.ServeHTTP(w, r)
		})
	}
}

// SecurityMiddlewareDefaults returns a set of security middlewares with sensible defaults
func SecurityMiddlewareDefaults() []func(http.Handler) http.Handler {
	return []func(http.Handler) http.Handler{
		MaxBodySize(10 << 20), // 10 MB default limit
	}
}
