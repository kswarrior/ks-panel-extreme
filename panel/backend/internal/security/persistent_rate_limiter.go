package security

import (
	"database/sql"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/repository"
)

// normalizePersistentIP mirrors ip_rate_limiter.normalizeIP so both limiters
// key by bare IP. Kept locally to avoid a cross-file unexported dependency
// cycle; the logic is intentionally identical.
func normalizePersistentIP(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ip
	}
	if net.ParseIP(ip) != nil {
		return ip
	}
	if h, _, err := net.SplitHostPort(ip); err == nil && h != "" {
		return strings.Trim(h, "[]")
	}
	if last := strings.LastIndex(ip, ":"); last != -1 {
		maybeIP := strings.Trim(ip[:last], "[]")
		if net.ParseIP(maybeIP) != nil {
			return maybeIP
		}
	}
	return ip
}

// PersistentIPRateLimiter is a database-backed sliding-window per-IP counter
// that persists across panel restarts.
type PersistentIPRateLimiter struct {
	mu        sync.Mutex
	hits      map[string][]time.Time // In-memory cache for hot path
	capacity  int                    // max hits per window
	window    time.Duration          // rolling window size
	lastSweep time.Time
	db        *sql.DB
}

// NewPersistentIPRateLimiter builds a limiter with the supplied per-window cap.
// It loads existing hits from the database for persistence.
func NewPersistentIPRateLimiter(perMinute int64, window time.Duration, db *sql.DB) *PersistentIPRateLimiter {
	cap := int(perMinute)
	if cap < 0 {
		cap = 0
	}
	if window <= 0 {
		window = 60 * time.Second
	}

	limiter := &PersistentIPRateLimiter{
		hits:     make(map[string][]time.Time),
		capacity: cap,
		window:   window,
		db:       db,
	}

	// Load recent hits from database
	limiter.loadFromDB()

	// Start janitor
	StartPersistentIPRateLimiterJanitor(limiter, 60*time.Second)

	return limiter
}

// loadFromDB loads recent rate limit hits from the database
func (l *PersistentIPRateLimiter) loadFromDB() {
	if l.db == nil {
		return
	}

	cutoff := time.Now().Add(-l.window).Format("2006-01-02 15:04:05")
	rows, err := l.db.Query(
		`SELECT client_ip, created_at FROM rate_limit_hits WHERE created_at >= ? ORDER BY created_at`,
		cutoff,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var ip string
		var createdAtStr string
		if err := rows.Scan(&ip, &createdAtStr); err != nil {
			continue
		}
		createdAt, err := time.Parse("2006-01-02 15:04:05", createdAtStr)
		if err != nil {
			continue
		}
		ip = normalizePersistentIP(ip)
		l.hits[ip] = append(l.hits[ip], createdAt)
	}
}

// Allow reports whether a fresh hit from ip is within the configured cap.
// Drops any expired timestamps from ip's bucket first so the running
// total only counts hits inside the rolling window. Returns true (= allow)
// when the limiter is disabled (capacity == 0).
func (l *PersistentIPRateLimiter) Allow(ip string) bool {
	if l.capacity == 0 {
		return true
	}
	ip = normalizePersistentIP(ip)
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-l.window)
	bucket := l.hits[ip]
	i := 0
	for i < len(bucket) && bucket[i].Before(cutoff) {
		i++
	}
	if i > 0 {
		bucket = bucket[i:]
	}
	if len(bucket) >= l.capacity {
		l.hits[ip] = bucket
		return false
	}
	bucket = append(bucket, now)
	l.hits[ip] = bucket

	// Asynchronously persist to database
	if l.db != nil {
		go l.persistHit(ip, now)
	}

	return true
}

// persistHit saves a hit to the database
func (l *PersistentIPRateLimiter) persistHit(ip string, hitTime time.Time) {
	if l.db == nil {
		return
	}
	_, _ = l.db.Exec(
		`INSERT INTO rate_limit_hits (client_ip, created_at) VALUES (?, ?)`,
		ip, hitTime.Format("2006-01-02 15:04:05"),
	)
}

// Sweep drops IPs whose bucket is empty after trimming the window. Called
// by the janitor at a low cadence so memory stays bounded on a busy panel
// that has seen millions of unique probes.
func (l *PersistentIPRateLimiter) Sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := time.Now().Add(-l.window)
	now := time.Now()
	if !l.lastSweep.IsZero() && now.Sub(l.lastSweep) < l.window {
		return
	}
	l.lastSweep = now
	for ip, bucket := range l.hits {
		i := 0
		for i < len(bucket) && bucket[i].Before(cutoff) {
			i++
		}
		if i == len(bucket) {
			delete(l.hits, ip)
		} else if i > 0 {
			l.hits[ip] = bucket[i:]
		}
	}
}

// UpdateConfig rebuilds the limiter with the supplied per-minute cap.
// We keep the live map (so already-tracked IPs aren't suddenly forgotten
// when the admin nudges the cap), but flip the capacity / window
// atomically so a concurrent Allow sees a consistent pair.
func (l *PersistentIPRateLimiter) UpdateConfig(perMinute int64, window time.Duration) {
	cap := int(perMinute)
	if cap < 0 {
		cap = 0
	}
	if window <= 0 {
		window = 60 * time.Second
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.capacity = cap
	l.window = window
}

// StartPersistentIPRateLimiterJanitor launches a tiny background goroutine that
// calls Sweep on the supplied limiter every `interval`. Also cleans up old
// database records.
func StartPersistentIPRateLimiterJanitor(l *PersistentIPRateLimiter, interval time.Duration) {
	if l == nil || interval <= 0 {
		return
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for range t.C {
			l.Sweep()
			// Clean up old database records
			if l.db != nil {
				cutoff := time.Now().Add(-24 * time.Hour).Format("2006-01-02 15:04:05")
				_, _ = l.db.Exec(`DELETE FROM rate_limit_hits WHERE created_at < ?`, cutoff)
			}
		}
	}()
}

// EnsureRateLimitTable creates the rate limit hits table if it doesn't exist
func EnsureRateLimitTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS rate_limit_hits (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			client_ip TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_ip_time ON rate_limit_hits(client_ip, created_at);
	`)
	return err
}

// RateLimitConfig holds the configuration for rate limiting
type RateLimitConfig struct {
	Enabled          bool
	RequestsPerMinute int64
	WindowSeconds    int64
	StorageType      string // "memory" or "database"
}

// GetRateLimitConfig retrieves the rate limit configuration from settings
func GetRateLimitConfig(db *sql.DB) *RateLimitConfig {
	repo := repository.NewSecurityRepository(db)
	config := repo.GetConfig()
	return &RateLimitConfig{
		Enabled:           config.RequestsPerMinuteLimit > 0,
		RequestsPerMinute: config.RequestsPerMinuteLimit,
		WindowSeconds:     config.WindowSecondsLimit,
		StorageType:       "database",
	}
}