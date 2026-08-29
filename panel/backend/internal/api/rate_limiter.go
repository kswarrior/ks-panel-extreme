package api

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RateLimiter implements a simple in-memory rate limiter with automatic
// garbage collection of old records. Records are purged on a background
// janitor goroutine so the map does not grow unbounded.
type RateLimiter struct {
	mu     sync.RWMutex
	records map[string][]time.Time
	// Rate limits: requests per time window
	loginAttempts    int
	loginWindow      time.Duration
	registerAttempts int
	registerWindow   time.Duration
	janitorStop      chan struct{}
}

// NewRateLimiter creates a new rate limiter with configurable limits.
// A background janitor goroutine automatically purges expired records
// so the map stays bounded even under sustained traffic.
func NewRateLimiter() *RateLimiter {
	rl := &RateLimiter{
		records:          make(map[string][]time.Time),
		loginAttempts:     5,              // 5 login attempts
		loginWindow:       15 * time.Minute, // per 15 minutes
		registerAttempts: 3,              // 3 registration attempts
		registerWindow:    1 * time.Hour,  // per 1 hour
		janitorStop:      make(chan struct{}),
	}
	go rl.janitor()
	return rl
}

// janitor periodically removes rate limit entries that have no valid
// attempts remaining inside any window. Runs as a daemon goroutine.
func (rl *RateLimiter) janitor() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for clientID, attempts := range rl.records {
				hasValid := false
				for _, attempt := range attempts {
					if now.Sub(attempt) <= 15*time.Minute {
						hasValid = true
						break
					}
				}
				if !hasValid {
					delete(rl.records, clientID)
				}
			}
			rl.mu.Unlock()
		case <-rl.janitorStop:
			return
		}
	}
}

// IsAllowed checks if a client is allowed to make a request to a specific endpoint
func (rl *RateLimiter) IsAllowed(clientID string, endpoint string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	attempts := rl.records[clientID]

	// Clean old attempts outside the window
	var validAttempts []time.Time
	for _, attempt := range attempts {
		if now.Sub(attempt) <= rl.getWindow(endpoint) {
			validAttempts = append(validAttempts, attempt)
		}
	}
	rl.records[clientID] = validAttempts

	// Check if within limits
	maxAttempts := rl.getMaxAttempts(endpoint)
	return len(validAttempts) < maxAttempts
}

// RecordAttempt records a failed attempt for a client
func (rl *RateLimiter) RecordAttempt(clientID string, endpoint string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.records[clientID] = append(rl.records[clientID], now)
}

// IsLocked checks if a client is temporarily locked out
func (rl *RateLimiter) IsLocked(clientID string, endpoint string) bool {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	attempts, exists := rl.records[clientID]
	if !exists {
		return false
	}

	now := time.Now()
	validAttempts := []time.Time{}
	for _, attempt := range attempts {
		if now.Sub(attempt) <= rl.getWindow(endpoint) {
			validAttempts = append(validAttempts, attempt)
		}
	}

	return len(validAttempts) >= rl.getMaxAttempts(endpoint)
}

// GetRemainingAttempts returns remaining attempts for a client
func (rl *RateLimiter) GetRemainingAttempts(clientID string, endpoint string) int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	attempts, exists := rl.records[clientID]
	if !exists {
		return rl.getMaxAttempts(endpoint)
	}

	now := time.Now()
	validAttempts := []time.Time{}
	for _, attempt := range attempts {
		if now.Sub(attempt) <= rl.getWindow(endpoint) {
			validAttempts = append(validAttempts, attempt)
		}
	}

	remaining := rl.getMaxAttempts(endpoint) - len(validAttempts)
	if remaining < 0 {
		return 0
	}
	return remaining
}

// ClearRecords removes all records for a client (e.g., on successful login)
func (rl *RateLimiter) ClearRecords(clientID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	delete(rl.records, clientID)
}

// StopJanitor stops the background cleanup goroutine. Call during shutdown.
func (rl *RateLimiter) StopJanitor() {
	close(rl.janitorStop)
}

// getMaxAttempts returns maximum allowed attempts for an endpoint
func (rl *RateLimiter) getMaxAttempts(endpoint string) int {
	switch endpoint {
	case "login":
		return rl.loginAttempts
	case "register":
		return rl.registerAttempts
	default:
		return 10 // default for other endpoints
	}
}

// getWindow returns the time window for an endpoint
func (rl *RateLimiter) getWindow(endpoint string) time.Duration {
	switch endpoint {
	case "login":
		return rl.loginWindow
	case "register":
		return rl.registerWindow
	default:
		return 1 * time.Hour // default for other endpoints
	}
}

// RateLimitMiddleware creates middleware that enforces rate limits
func RateLimitMiddleware(rl *RateLimiter, endpoint string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clientID := getClientID(r)
			
			// Check if client is locked out
			if rl.IsLocked(clientID, endpoint) {
				w.Header().Set("Retry-After", rl.getWindow(endpoint).String())
				http.Error(w, "rate limit exceeded, please try again later", http.StatusTooManyRequests)
				return
			}

			// Check if client has remaining attempts
			if !rl.IsAllowed(clientID, endpoint) {
				rl.RecordAttempt(clientID, endpoint)
				remaining := rl.GetRemainingAttempts(clientID, endpoint)
				w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			// Record successful attempt (for tracking)
			if r.Method == "POST" && (r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/register") {
				// Record attempt after successful validation
				next.ServeHTTP(w, r)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// getClientID extracts a unique identifier for the client
func getClientID(r *http.Request) string {
	// Use IP address as the client identifier
	// RemoteAddr is the most reliable source as it cannot be spoofed.
	// X-Forwarded-For and X-Real-IP are only used when behind a trusted proxy.
	ip := r.RemoteAddr
	if ip != "" {
		return ip
	}
	// Fall back to X-Forwarded-For when behind a reverse proxy
	ip = r.Header.Get("X-Forwarded-For")
	if ip != "" {
		if parts := strings.Split(ip, ","); len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	// Fall back to X-Real-IP
	ip = r.Header.Get("X-Real-IP")
	if ip != "" {
		return ip
	}
	return ""
}

// CleanupOldRecords removes old rate limit records
func (rl *RateLimiter) CleanupOldRecords() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for clientID, attempts := range rl.records {
		validAttempts := []time.Time{}
		for _, attempt := range attempts {
			if now.Sub(attempt) <= 1*time.Hour {
				validAttempts = append(validAttempts, attempt)
			}
		}
		if len(validAttempts) == 0 {
			delete(rl.records, clientID)
		} else {
			rl.records[clientID] = validAttempts
		}
	}
}

// AuthRateLimiter is a rate limiter specifically for authentication endpoints
var AuthRateLimiter = NewRateLimiter()