package security

import (
	"net"
	"strings"
	"sync"
	"time"
)

// normalizeIP strips a possible port suffix from an IP string (e.g.
// "1.2.3.4:5678" -> "1.2.3.4", "[::1]:1234" -> "::1") so per-IP buckets
// are keyed by the actual client IP, not the ephemeral source port.
// Without this, each TCP connection (different source port) would get its
// own bucket and the per-IP limit would never be reached under a real
// flood that opens many connections.
func normalizeIP(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ip
	}
	// Fast path: if it parses as bare IP, nothing to strip.
	if net.ParseIP(ip) != nil {
		return ip
	}
	if h, _, err := net.SplitHostPort(ip); err == nil && h != "" {
		// Handle bracketed IPv6.
		return strings.Trim(h, "[]")
	}
	// Fallback for malformed "ip:port" where SplitHostPort fails due to
	// missing brackets on IPv6 bare form — try last colon heuristic.
	if last := strings.LastIndex(ip, ":"); last != -1 {
		maybeIP := strings.Trim(ip[:last], "[]")
		if net.ParseIP(maybeIP) != nil {
			return maybeIP
		}
	}
	return ip
}

// IPRateLimiter is a tiny in-memory sliding-window per-IP counter the
// security middleware consults before letting a request reach its
// handler.
//
// The counter is intentionally process-local: a horizontal scale-out
// would let each replica's quota be spent in parallel, but the panel is
// single-instance and any future scale-out would replace this with a
// shared store. Keeping the state here means the middleware's blocking
// decision never touches the database on the hot path — the DB is
// consulted once per config reload; the per-IP hit count lives in
// memory.
//
// The window is configured (in seconds) by the persisted
// SecurityConfig.WindowSecondsLimit and the cap (in requests-per-minute)
// by SecurityConfig.RequestsPerMinuteLimit. Both knobs are converted to a
// per-second rate when this limiter is built, so the Allow call below
// only needs an O(1) bucket sum.
//
// A periodic janitor (StartIPRateLimiterJanitor) evicts idle IPs so a
// long-running panel under a brief attack doesn't accumulate state for
// every probe IP it has ever seen.
type IPRateLimiter struct {
	mu        sync.Mutex
	hits      map[string][]time.Time
	capacity  int           // max hits per window
	window    time.Duration // rolling window size
	lastSweep time.Time
}

// NewIPRateLimiter builds a limiter with the supplied per-window cap. A
// zero or negative cap makes the limiter a no-op (returns true for every
// request) so the "disabled" state from the SecurityConfig UI is honoured.
func NewIPRateLimiter(perMinute int64, window time.Duration) *IPRateLimiter {
	cap := int(perMinute)
	if cap < 0 {
		cap = 0
	}
	if window <= 0 {
		window = 60 * time.Second
	}
	return &IPRateLimiter{
		hits:     make(map[string][]time.Time),
		capacity: cap,
		window:   window,
	}
}

// Allow reports whether a fresh hit from ip is within the configured cap.
// Drops any expired timestamps from ip's bucket first so the running
// total only counts hits inside the rolling window. Returns true (= allow)
// when the limiter is disabled (capacity == 0).
func (l *IPRateLimiter) Allow(ip string) bool {
	if l.capacity == 0 {
		return true
	}
	ip = normalizeIP(ip)
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
	return true
}

// Sweep drops IPs whose bucket is empty after trimming the window. Called
// by the janitor at a low cadence so memory stays bounded on a busy panel
// that has seen millions of unique probes.
func (l *IPRateLimiter) Sweep() {
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

// UpdateConfig rebuilds the limiter with the supplied per-minute cap. We
// keep the live map (so already-tracked IPs aren't suddenly forgotten
// when the admin nudges the cap), but flip the capacity / window
// atomically so a concurrent Allow sees a consistent pair.
func (l *IPRateLimiter) UpdateConfig(perMinute int64, window time.Duration) {
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

// StartIPRateLimiterJanitor launches a tiny background goroutine that
// calls Sweep on the supplied limiter every `interval`. Returns
// immediately if the limiter is nil (so a build that disables the
// security middleware can still compile without a guard at every call
// site).
func StartIPRateLimiterJanitor(l *IPRateLimiter, interval time.Duration) {
	if l == nil || interval <= 0 {
		return
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for range t.C {
			l.Sweep()
		}
	}()
}
