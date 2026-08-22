// Package security holds the process-wide live state the security
// middleware (api package) and the security handlers share. It MUST NOT
// import either `internal/api` or `internal/api/handlers` — both of those
// import this package instead, which keeps the dependency DAG acyclic.
//
// The state lives here, not in `api`, because the security handlers also
// need to push a fresh config into the live state immediately after an
// admin PUTs new rate limits; if the state stayed in `api`, the handler
// package would grow a cyclic import on `api`.
package security

import (
	"database/sql"
	"sync"
	"sync/atomic"
	"time"

	"github.com/example/kspanel/internal/repository"
)

// State is the process-wide singleton the security middleware consults on
// the hot path. It builds up once at router construction and keeps three
// things:
//
//   - The current SecurityConfig (per-IP RPM cap, window size, global RPM
//     cap, block-unknown-UA toggle). Updated atomically whenever the admin
//     PUTs a new config so the very next request sees the new threshold
//     without a panel restart.
//   - A per-IP sliding-window rate limiter used to enforce the per-minute
//     cap. Can be in-memory or persistent (database-backed).
//   - A global rolling request counter the Under-Attack branch reads to
//     decide whether the panel as a whole is over its global RPS ceiling.
//   - DDoS auto-stop state (mutex-protected, not in atomic Cfg because
//     only the middleware's hot path and the DDoS handler need it).
type State struct {
	cfg atomic.Pointer[Cfg]

	ipLimiter       *IPRateLimiter
	persistentLimiter interface{ Allow(string) bool; UpdateConfig(int64, time.Duration) }

	// globalRolling is a 1-second resolution request counter covering
	// `len(globalRolling)` buckets (= the rolling window). The
	// UnderAttack branch reads it to decide whether the panel as a
	// whole is over its global RPM limit.
	globalRolling [60]int64
	globalMu      sync.Mutex
	globalCursor  int64

	// DDoS auto-stop state (protected by ddosMu).
	ddosMu       sync.Mutex
	ddosActive   bool
	ddosStopAt   time.Time
}

// Cfg is the snapshot the middleware reads atomically. We race-load this
// pointer at the top of every request and use it for all decisions; a
// config PUT swaps it under the cfg atomic.Pointer and the next request
// sees the new values.
type Cfg struct {
	UnderAttack           bool
	BlockUnknownUA        bool
	PerMinuteLimit        int64
	WindowSeconds         int64
	GlobalRPMLimit        int64
	BlockChallengeAlready bool // reserved for future WAF/challenge integration

	// DDoS config (read-only at runtime, updated via Reload).
	DDOSAutoStopEnabled bool
	DDOSStopMinutes     int64
	DDOSMaxStopCount    int64
}

// state is the process-wide singleton. Initialized lazily by Get() on
// the first caller (the security middleware on the very first request, or
// a handler that needs to call Reload).
var (
	state   *State
	stateMu sync.Mutex
)

// Get returns the process-wide State, initializing it lazily on first
// call. Callers MUST not cache the returned pointer past their function
// scope; the singleton is never replaced once built, only mutated via
// Reload.
func Get() *State {
	stateMu.Lock()
	defer stateMu.Unlock()
	if state != nil {
		return state
	}
	s := &State{}
	cfg := loadCfgFromDB()
	s.cfg.Store(cfg)

	window := time.Duration(cfg.WindowSeconds) * time.Second
	if window <= 0 {
		window = 60 * time.Second
	}

	// Try to use persistent rate limiter with database
	var db *sql.DB
	if con, err := repository.OpenDB(); err == nil {
		db = con
		// Ensure the rate limit table exists
		_ = EnsureRateLimitTable(db)
	}

	if db != nil {
		// Use persistent rate limiter
		s.persistentLimiter = NewPersistentIPRateLimiter(cfg.PerMinuteLimit, window, db)
	} else {
		// Fall back to in-memory rate limiter
		s.ipLimiter = NewIPRateLimiter(cfg.PerMinuteLimit, window)
		StartIPRateLimiterJanitor(s.ipLimiter, 60*time.Second)
	}

	state = s
	return state
}

// Defaults returns the safe defaults used when the DB read fails or the
// persisted config is missing/invalid. Mirrors the defaults baked into
// repository.SecurityRepository.GetConfig so the panel behaves identically
// on a fresh install whether or not it can reach the DB at startup.
func Defaults() *Cfg {
	return &Cfg{
		UnderAttack:          false,
		BlockUnknownUA:       false,
		PerMinuteLimit:       600,
		WindowSeconds:        60,
		GlobalRPMLimit:       0,
		DDOSAutoStopEnabled:  false,
		DDOSStopMinutes:      5,
		DDOSMaxStopCount:     0,
	}
}

// loadCfgFromDB reads the persisted config out of the settings KV and
// sanitizes the numbers. Falls back to Defaults on any read error so the
// security middleware never crashes the panel on a transient DB hiccup at
// startup. Open/open borrow a DB connection just for this read; the
// returned *Cfg is detached so callers can store it without keeping the
// DB handle alive.
func loadCfgFromDB() *Cfg {
	con, err := repository.OpenDB()
	if err != nil {
		return Defaults()
	}
	defer con.Close()
	repo := repository.NewSecurityRepository(con)
	c := repo.GetConfig()
	return &Cfg{
		UnderAttack:          repo.IsUnderAttack(),
		BlockUnknownUA:       c.BlockUnknownUA,
		PerMinuteLimit:       c.RequestsPerMinuteLimit,
		WindowSeconds:        c.WindowSecondsLimit,
		GlobalRPMLimit:       c.GlobalRPMLimit,
		DDOSAutoStopEnabled:  c.DDOSAutoStopEnabled,
		DDOSStopMinutes:      c.DDOSStopMinutes,
		DDOSMaxStopCount:     c.DDOSMaxStopCount,
	}
}

// Reload pulls a fresh config snapshot from the DB and replaces the
// atomic pointer plus tunes the live per-IP limiter. Called by the PUT
// config + attack-toggle handlers so new thresholds take effect
// immediately without a panel restart.
func (s *State) Reload() {
	if s == nil {
		return
	}
	cfg := loadCfgFromDB()
	s.cfg.Store(cfg)
	window := time.Duration(cfg.WindowSeconds) * time.Second
	if window <= 0 {
		window = 60 * time.Second
	}
	if s.persistentLimiter != nil {
		s.persistentLimiter.UpdateConfig(cfg.PerMinuteLimit, window)
	} else if s.ipLimiter != nil {
		s.ipLimiter.UpdateConfig(cfg.PerMinuteLimit, window)
	}
}

// Cfg returns the current snapshot. Returning *Cfg so callers can read
// every field with one atomic load — they must NOT mutate the returned
// pointer; Reload swaps it under the atomic.
func (s *State) Cfg() *Cfg {
	if s == nil {
		return Defaults()
	}
	c := s.cfg.Load()
	if c == nil {
		return Defaults()
	}
	return c
}

// IPAllowed reports whether a fresh hit from ip is within the configured
// per-IP cap. Drops any expired timestamps from ip's bucket first so the
// running total only counts hits inside the rolling window. Returns true
// (= allow) when the limiter is disabled (capacity == 0).
func (s *State) IPAllowed(ip string) bool {
	if s == nil {
		return true
	}
	if s.persistentLimiter != nil {
		return s.persistentLimiter.Allow(ip)
	}
	if s.ipLimiter == nil {
		return true
	}
	return s.ipLimiter.Allow(ip)
}

// RecordGlobalHit ticks the rolling counter and returns the number of
// requests seen in the last window (=len(globalRolling) buckets of 1
// second each). Purely used for the Under-Attack global RPM check.
func (s *State) RecordGlobalHit(now time.Time) int64 {
	s.globalMu.Lock()
	defer s.globalMu.Unlock()
	n := int64(len(s.globalRolling))
	sec := now.Unix() % n
	cur := s.globalCursor
	if cur == 0 {
		cur = sec - 2
	}
	for b := cur + 1; b <= sec; b++ {
		idx := int((b % n + n) % n)
		s.globalRolling[idx] = 0
	}
	s.globalRolling[sec]++
	s.globalCursor = sec
	var sum int64
	for i := 0; i < len(s.globalRolling); i++ {
		sum += s.globalRolling[i]
	}
	return sum
}

// RecentHits returns the number of requests in the last `seconds` seconds.
// Used by the DDoS detector for faster response than the full 60s window.
func (s *State) RecentHits(seconds int) int64 {
	s.globalMu.Lock()
	defer s.globalMu.Unlock()
	if s.globalCursor == 0 {
		return 0
	}
	n := int64(len(s.globalRolling))
	now := time.Now().Unix()
	var sum int64
	for i := 1; i <= seconds && i <= int(n); i++ {
		sec := now - int64(i)
		idx := int((sec%n + n) % n)
		sum += s.globalRolling[idx]
	}
	return sum
}

// DDOSActive reports whether the panel is currently in DDoS auto-stop mode.
func (s *State) DDOSActive() bool {
	s.ddosMu.Lock()
	defer s.ddosMu.Unlock()
	return s.ddosActive
}

// SetDDOSActive sets the DDoS active state and cooldown end time.
// Returns true if state changed (for logging).
func (s *State) SetDDOSActive(active bool, stopAt time.Time) bool {
	s.ddosMu.Lock()
	defer s.ddosMu.Unlock()
	if s.ddosActive == active && (!active || s.ddosStopAt.Equal(stopAt)) {
		return false
	}
	s.ddosActive = active
	s.ddosStopAt = stopAt
	return true
}

// DDOSStopAt returns the cooldown end time if active.
func (s *State) DDOSStopAt() time.Time {
	s.ddosMu.Lock()
	defer s.ddosMu.Unlock()
	return s.ddosStopAt
}

// ClearDDOSAutoStop clears the DDoS active state.
func (s *State) ClearDDOSAutoStop() {
	s.ddosMu.Lock()
	defer s.ddosMu.Unlock()
	s.ddosActive = false
	s.ddosStopAt = time.Time{}
}

// DDOSStopCount returns the current auto-stop trigger count from the DB.
func (s *State) DDOSStopCount() int64 {
	con, err := repository.OpenDB()
	if err != nil {
		return 0
	}
	defer con.Close()
	repo := repository.NewSecurityRepository(con)
	return repo.GetDDOSStopCount()
}
