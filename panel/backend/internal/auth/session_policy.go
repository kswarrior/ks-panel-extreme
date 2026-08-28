package auth

import (
	"sync/atomic"
	"time"
)

// SessionPolicy is the operator-configurable session lifetime policy shown
// on the Security page's Sessions tab. It replaces the previously
// hardcoded constants (8h absolute life, 24h idle cleanup, unlimited
// sessions per user) so the same values can be edited at runtime.
//
// The policy is held in an atomic pointer: the security state reload path
// (internal/security) pushes a fresh policy after every config PUT and at
// process boot, while AuthMiddleware / the SessionManager read it on every
// request without locking.
type SessionPolicy struct {
	// Lifetime bounds the absolute life of a session. Drives the cookie
	// Expires/MaxAge, the bearer max-age check in AuthMiddleware and the
	// sliding-expiry rotation window.
	Lifetime time.Duration
	// IdleTimeout invalidates a TRACKED session that has not been used
	// for this long. Untracked tokens (legacy bearers minted before the
	// manager existed) are unaffected — they still expire by Lifetime.
	IdleTimeout time.Duration
	// MaxPerUser caps concurrent active sessions per user. When a new
	// session would exceed the cap the oldest active one is evicted.
	// 0 = unlimited.
	MaxPerUser int64
}

// DefaultSessionPolicy mirrors the constants this policy replaced, so a
// panel that has never had its Security config saved behaves exactly like
// the pre-config builds.
func DefaultSessionPolicy() SessionPolicy {
	return SessionPolicy{
		Lifetime:    8 * time.Hour,
		IdleTimeout: 24 * time.Hour,
		MaxPerUser:  0,
	}
}

var sessionPolicy atomic.Pointer[SessionPolicy]

// CurrentSessionPolicy returns the live policy, falling back to the safe
// defaults when nothing has been loaded yet (e.g. before the security
// state's first DB read).
func CurrentSessionPolicy() SessionPolicy {
	if p := sessionPolicy.Load(); p != nil {
		return *p
	}
	return DefaultSessionPolicy()
}

// SetSessionPolicy atomically swaps the live policy. Non-positive values
// fall back to their defaults so a malformed settings row can never arm a
// zero-second lifetime (fail closed).
func SetSessionPolicy(lifetime, idle time.Duration, maxPerUser int64) {
	def := DefaultSessionPolicy()
	if lifetime <= 0 {
		lifetime = def.Lifetime
	}
	if idle <= 0 {
		idle = def.IdleTimeout
	}
	if maxPerUser < 0 {
		maxPerUser = 0
	}
	sessionPolicy.Store(&SessionPolicy{
		Lifetime:    lifetime,
		IdleTimeout: idle,
		MaxPerUser:  maxPerUser,
	})
}
