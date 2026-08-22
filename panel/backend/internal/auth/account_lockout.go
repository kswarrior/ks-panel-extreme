package auth

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// AccountLockout tracks failed login attempts and manages account lockouts
type AccountLockout struct {
	mu            sync.RWMutex
	attempts      map[string]*LoginAttempt
	lockoutWindow time.Duration
	maxAttempts   int
	lockoutDuration time.Duration
}

// LoginAttempt tracks failed login attempts for a user
type LoginAttempt struct {
	Username  string
	Attempts  int
	LastAttempt time.Time
	LockedAt  time.Time
	Locked    bool
}

// NewAccountLockout creates a new account lockout manager
func NewAccountLockout() *AccountLockout {
	return &AccountLockout{
		attempts:       make(map[string]*LoginAttempt),
		lockoutWindow:  15 * time.Minute, // Reset attempts after 15 minutes
		maxAttempts:     5,               // Max attempts before lockout
		lockoutDuration: 30 * time.Minute, // Lockout duration
	}
}

// RecordFailedAttempt records a failed login attempt for a user
func (al *AccountLockout) RecordFailedAttempt(username string) {
	al.mu.Lock()
	defer al.mu.Unlock()

	now := time.Now()
	attempt, exists := al.attempts[username]

	if !exists {
		attempt = &LoginAttempt{
			Username: username,
			Attempts: 1,
			LastAttempt: now,
		}
		al.attempts[username] = attempt
		return
	}

	// Check if the attempt is within the lockout window
	if attempt.Locked && now.Sub(attempt.LockedAt) < al.lockoutDuration {
		// Still locked, just update the locked time
		attempt.LockedAt = now
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
	al.mu.RLock()
	defer al.mu.RUnlock()

	attempt, exists := al.attempts[username]
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

	attempt, exists := al.attempts[username]
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

	attempt, exists := al.attempts[username]
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

	delete(al.attempts, username)
}

// UnlockAccount manually unlocks an account
func (al *AccountLockout) UnlockAccount(username string) {
	al.mu.Lock()
	defer al.mu.Unlock()

	if attempt, exists := al.attempts[username]; exists {
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
	for username, attempt := range al.attempts {
		if !attempt.Locked && now.Sub(attempt.LastAttempt) > al.lockoutWindow {
			delete(al.attempts, username)
		}
	}
}

// GetAccountStatus returns the current status of an account
func (al *AccountLockout) GetAccountStatus(username string) (bool, int, time.Duration) {
	al.mu.RLock()
	defer al.mu.RUnlock()

	attempt, exists := al.attempts[username]
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
				// Extract identifier from request
				var identifier string
				if r.Method == "POST" {
					var req map[string]interface{}
					if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
						if identifier, _ = req["identifier"].(string); identifier == "" {
							identifier, _ = req["username"].(string)
						}
						if identifier == "" {
							identifier, _ = req["email"].(string)
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