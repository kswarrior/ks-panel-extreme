package auth

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// AccountLockout tracks failed login attempts and manages account lockouts
type AccountLockout struct {
	mu              sync.RWMutex
	attempts        map[string]*LoginAttempt
	lockoutWindow   time.Duration
	maxAttempts     int
	lockoutDuration time.Duration
}

// LoginAttempt tracks failed login attempts for a user
type LoginAttempt struct {
	Username    string
	Attempts    int
	LastAttempt time.Time
	LockedAt    time.Time
	Locked      bool
}

// NewAccountLockout creates a new account lockout manager
func NewAccountLockout() *AccountLockout {
	return &AccountLockout{
		attempts:        make(map[string]*LoginAttempt),
		lockoutWindow:   15 * time.Minute, // Reset attempts after 15 minutes
		maxAttempts:     5,                // Max attempts before lockout
		lockoutDuration: 30 * time.Minute, // Lockout duration
	}
}

// lockKey normalizes an identifier into the map key used for attempt
// tracking. Emails match case-insensitively in the user repository
// (lower(email) = lower(?)), so "Victim@X.com" and "victim@x.com" resolve to
// the same account — tracking them under different keys would let an attacker
// rotate letter case to get a fresh 5-attempt counter per variant and bypass
// the lockout entirely. Usernames are looked up case-sensitively, but sharing
// one counter across case variants is the safe direction: it can only make
// the lockout stricter, never looser.
func lockKey(identifier string) string {
	return strings.ToLower(strings.TrimSpace(identifier))
}

// RecordFailedAttempt records a failed login attempt for a user
func (al *AccountLockout) RecordFailedAttempt(username string) {
	key := lockKey(username)
	al.mu.Lock()
	defer al.mu.Unlock()

	now := time.Now()
	attempt, exists := al.attempts[key]

	if !exists {
		attempt = &LoginAttempt{
			Username:    username,
			Attempts:    1,
			LastAttempt: now,
		}
		al.attempts[key] = attempt
		return
	}

	// While locked, further attempts neither extend the lockout nor bump
	// counters: the expiry stays fixed so an attacker hammering the
	// endpoint cannot keep a victim locked forever (fail closed, fixed
	// duration). Expiry is handled lazily by IsAccountLocked / the reset
	// path below on the next attempt after the duration passes.
	if attempt.Locked && now.Sub(attempt.LockedAt) < al.lockoutDuration {
		return
	}

	// Check if the attempt is within the reset window
	if now.Sub(attempt.LastAttempt) > al.lockoutWindow {
		// Reset attempts if outside the window
		attempt.Attempts = 1
		attempt.LastAttempt = now
		attempt.Locked = false
		return
	}

	// Increment attempts
	attempt.Attempts++
	attempt.LastAttempt = now

	// Check if account should be locked
	if attempt.Attempts >= al.maxAttempts {
		attempt.Locked = true
		attempt.LockedAt = now
	}
}

// IsAccountLocked checks if an account is locked
func (al *AccountLockout) IsAccountLocked(username string) bool {
	// Full Lock, not RLock: the lazy expiry reset below mutates the shared
	// attempt record. Writing under RLock races with concurrent readers and
	// writers (go test -race flags it).
	key := lockKey(username)
	al.mu.Lock()
	defer al.mu.Unlock()

	attempt, exists := al.attempts[key]
	if !exists {
		return false
	}

	// If locked, check if lockout period has expired
	if attempt.Locked {
		if time.Since(attempt.LockedAt) >= al.lockoutDuration {
			// Lockout period expired, reset
			attempt.Locked = false
			attempt.Attempts = 0
			return false
		}
		return true
	}

	return false
}

// GetRemainingAttempts returns the number of remaining attempts before lockout
func (al *AccountLockout) GetRemainingAttempts(username string) int {
	al.mu.RLock()
	defer al.mu.RUnlock()

	attempt, exists := al.attempts[lockKey(username)]
	if !exists {
		return al.maxAttempts
	}

	if attempt.Locked {
		return 0
	}

	remaining := al.maxAttempts - attempt.Attempts
	if remaining < 0 {
		return 0
	}
	return remaining
}

// GetLockoutTime returns the time until the account is unlocked
func (al *AccountLockout) GetLockoutTime(username string) time.Duration {
	al.mu.RLock()
	defer al.mu.RUnlock()

	attempt, exists := al.attempts[lockKey(username)]
	if !exists || !attempt.Locked {
		return 0
	}

	remaining := al.lockoutDuration - time.Since(attempt.LockedAt)
	if remaining < 0 {
		return 0
	}
	return remaining
}

// ResetAttempts resets the failed login attempts for a user
func (al *AccountLockout) ResetAttempts(username string) {
	al.mu.Lock()
	defer al.mu.Unlock()

	delete(al.attempts, lockKey(username))
}

// UnlockAccount manually unlocks an account
func (al *AccountLockout) UnlockAccount(username string) {
	al.mu.Lock()
	defer al.mu.Unlock()

	if attempt, exists := al.attempts[lockKey(username)]; exists {
		attempt.Locked = false
		attempt.Attempts = 0
		attempt.LockedAt = time.Time{}
	}
}

// CleanupOldAttempts removes old attempt records
func (al *AccountLockout) CleanupOldAttempts() {
	al.mu.Lock()
	defer al.mu.Unlock()

	now := time.Now()
	for key, attempt := range al.attempts {
		if !attempt.Locked && now.Sub(attempt.LastAttempt) > al.lockoutWindow {
			delete(al.attempts, key)
		}
	}
}

// GetAccountStatus returns the current status of an account
func (al *AccountLockout) GetAccountStatus(username string) (bool, int, time.Duration) {
	al.mu.RLock()
	defer al.mu.RUnlock()

	attempt, exists := al.attempts[lockKey(username)]
	if !exists {
		return false, al.maxAttempts, 0
	}

	if attempt.Locked {
		remaining := al.lockoutDuration - time.Since(attempt.LockedAt)
		if remaining < 0 {
			return false, al.maxAttempts, 0
		}
		return true, 0, remaining
	}

	return false, al.maxAttempts - attempt.Attempts, 0
}

// AccountLockoutMiddleware creates middleware that enforces account lockout
func AccountLockoutMiddleware(al *AccountLockout) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only apply to login endpoints
			if r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/switch-login" {
				// Extract identifier from request without consuming the body:
				// the downstream login handler must still decode it (fail
				// closed: a body we drained would arrive as EOF and break
				// login / bypass lockout accounting).
				var identifier string
				if r.Method == "POST" {
					body, err := io.ReadAll(r.Body)
					if err == nil {
						_ = r.Body.Close()
						r.Body = io.NopCloser(bytes.NewReader(body))
						var req map[string]interface{}
						if jerr := json.Unmarshal(body, &req); jerr == nil {
							if identifier, _ = req["identifier"].(string); identifier == "" {
								identifier, _ = req["username"].(string)
							}
							if identifier == "" {
								identifier, _ = req["email"].(string)
							}
						}
					}
				}

				if identifier != "" {
					// Check if account is locked
					if al.IsAccountLocked(identifier) {
						lockoutTime := al.GetLockoutTime(identifier)
						w.Header().Set("Retry-After", lockoutTime.String())
						http.Error(w, "account temporarily locked due to multiple failed attempts", http.StatusTooManyRequests)
						return
					}

					// Add remaining attempts to headers for client feedback
					remaining := al.GetRemainingAttempts(identifier)
					w.Header().Set("X-Remaining-Attempts", strconv.Itoa(remaining))
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Policy surfaces the effective lockout configuration for the Security
// page's Authentication tab (read-only: the thresholds are fixed for the
// process lifetime).
func (al *AccountLockout) Policy() (maxAttempts int, windowMinutes int, lockoutMinutes int) {
	al.mu.RLock()
	defer al.mu.RUnlock()
	return al.maxAttempts,
		int(al.lockoutWindow / time.Minute),
		int(al.lockoutDuration / time.Minute)
}

// LockedAccount is one currently-locked identifier.
type LockedAccount struct {
	Username string
	LockedAt time.Time
}

// LockedAccounts lists every identifier currently under an active lockout
// so an admin can see (and manually unlock) affected accounts.
func (al *AccountLockout) LockedAccounts() []LockedAccount {
	al.mu.RLock()
	defer al.mu.RUnlock()

	out := make([]LockedAccount, 0)
	now := time.Now()
	for _, attempt := range al.attempts {
		if !attempt.Locked {
			continue
		}
		// Report only locks that are still inside their duration; the
		// lazy expiry in IsAccountLocked clears the rest on next use.
		if now.Sub(attempt.LockedAt) >= al.lockoutDuration {
			continue
		}
		out = append(out, LockedAccount{Username: attempt.Username, LockedAt: attempt.LockedAt})
	}
	return out
}

// InitializeAccountLockout creates and starts a cleanup goroutine for the account lockout
func InitializeAccountLockout() *AccountLockout {
	al := NewAccountLockout()

	// Start cleanup goroutine
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			al.CleanupOldAttempts()
		}
	}()

	return al
}

// AccountLockoutInstance is the global account lockout instance
var AccountLockoutInstance = InitializeAccountLockout()
