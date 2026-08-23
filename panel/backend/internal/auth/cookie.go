package auth

import (
	"net/http"
	"strings"
	"time"
)

// SessionCookieName is the single place the session cookie's name lives so
// Login, Logout and AuthMiddleware all read/write the same cookie. Keeping
// it exported lets tests (and, in a pinch, operators) reference it without
// risking a typo that desyncs the auth path.
// Uses __Host- prefix for additional security (requires Secure, Path=/, no Domain)
const SessionCookieName = "__Host-session_id"

// SessionTTL returns how long a freshly-issued (or rotated) session stays
// valid. It reads the live SessionPolicy (Security page → Sessions tab) so
// an admin can change the lifetime without a rebuild; the default mirrors
// the previous hardcoded 8h constant. The cookie's Expires mirrors this.
func SessionTTL() time.Duration {
	return CurrentSessionPolicy().Lifetime
}

// rotationWindowFor is the fraction of the session lifetime below which we
// re-issue the cookie (sliding expiry). Concretely, if a request arrives
// with a cookie whose remaining life is shorter than half the lifetime, the
// middleware rotates it — extending the session for an active user while
// bounding the life of a stolen/hijacked cookie to at most one lifetime
// from its last use.
func rotationWindowFor(lifetime time.Duration) time.Duration {
	return lifetime / 2
}

// IsSecureRequest reports whether the in-flight request was delivered over
// a scheme where the Secure cookie flag is appropriate (TLS, or a proxy
// that terminated TLS and forwarded it via the standard X-Forwarded-Proto).
//
// Over plain HTTP (e.g. local dev on http://localhost) forcing Secure would
// make the browser refuse to store the cookie entirely, silently breaking
// login. Over HTTPS omitting Secure exposes the session to a downgrade /
// sniffing attacker. We trust the forwarded proto header ONLY because the
// CORS router already sits in front of this middleware and operators are
// expected to terminate TLS at their reverse proxy — the same trust model
// the X-Forwarded-* headers already rely on.
func IsSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		return strings.EqualFold(proto, "https")
	}
	return false
}

// NewSessionCookie builds the session cookie with the project's security
// defaults: HttpOnly (no JS access ⇒ no XSS-generated theft path),
// SameSite=Strict (no cross-site request delivery ⇒ CSRF-resistant),
// Path="/", and Secure when the request is over TLS. MaxAge is derived
// from the supplied expiry so the browser purges it at the right moment.
// The __Host- prefix requires Secure flag, so we enforce it in production.
func NewSessionCookie(r *http.Request, value string, expiry time.Time) *http.Cookie {
	maxAge := int(time.Until(expiry).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}
	isSecure := IsSecureRequest(r)

	// In development, allow non-Secure for localhost
	isDevelopment := false
	if host := r.Host; host == "localhost:5050" || host == "127.0.0.1:5050" || strings.HasPrefix(host, "localhost:") || strings.HasPrefix(host, "127.0.0.1:") {
		isDevelopment = true
	}

	c := &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Expires:  expiry,
		MaxAge:   maxAge,
	}

	// __Host- prefix requires Secure flag
	// In production, always set Secure. In development, only set if actually secure.
	if isSecure || isDevelopment {
		c.Secure = isSecure
	} else {
		// Production HTTP - do not set Secure flag; browsers won't send
		// Secure cookies over HTTP. The SecureCookieMiddleware will block
		// non-HTTPS requests separately.
		c.Secure = false
	}

	return c
}

// ClearSessionCookie issues an expired, zeroed cookie so the browser
// forgets the session on logout. It mirrors the same attr set on issue
// (Path/HttpOnly/SameSite/Secure) so the deletion targets the exact same
// cookie the browser previously stored — otherwise the browser keeps the
// old one around.
func ClearSessionCookie(r *http.Request) *http.Cookie {
	isSecure := IsSecureRequest(r)

	// In development, allow non-Secure for localhost
	isDevelopment := false
	if host := r.Host; host == "localhost:5050" || host == "127.0.0.1:5050" || strings.HasPrefix(host, "localhost:") || strings.HasPrefix(host, "127.0.0.1:") {
		isDevelopment = true
	}

	c := &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Now().Add(-1 * time.Hour),
	}

	// __Host- prefix requires Secure flag
	if isSecure || isDevelopment {
		c.Secure = isSecure
	} else {
		// Production HTTP - do not set Secure flag; browsers won't send
		// Secure cookies over HTTP. The SecureCookieMiddleware will block
		// non-HTTPS requests separately.
		c.Secure = false
	}

	return c
}

// ShouldRotate decides whether a session cookie whose absolute expiry is
// `currentExpiry` should be re-issued (sliding-expiry rotation) on the
// current request. We rotate only when less than half the configured
// lifetime remains, so an active user never loses their session but a
// hijacked cookie's useful lifetime is bounded.
func ShouldRotate(currentExpiry time.Time) bool {
	return time.Until(currentExpiry) < rotationWindowFor(SessionTTL())
}
