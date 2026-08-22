package models

import "time"

// SecuritySnapshot is the single response shape returned by the Security
// admin page (admin/security). It folds the per-request security_requests
// feed into the headline counters + top-N lists an operator needs to
// monitor the panel under attack, in one round-trip so the page can paint
// in a single fetch and refresh on an interval without re-querying.
//
// Every aggregate field is computed up-front by SecurityRepository.Snapshot
// against a configurable window (last 60s for RPS, full-window for cumulatives).
// The "Peak RPS" figure is the highest per-second bucket seen in the window.
type SecuritySnapshot struct {
	GeneratedAt time.Time `json:"generated_at"`
	// WindowSeconds is the aggregate window the cumulatives cover. The
	// dashboard surfaces it as the "over the last Ns" suffix on each tile
	// so an operator reading the numbers understands their scope.
	WindowSeconds int64 `json:"window_seconds"`

	// --- Headline counters (cumulative over the window) ---
	TotalRequests       int64 `json:"total_requests"`
	RequestsPerSecond   int64 `json:"requests_per_second"`
	RequestsPerMinute   int64 `json:"requests_per_minute"`
	ActiveConnections   int64 `json:"active_connections"`
	UniqueVisitors      int64 `json:"unique_visitors"`
	BlockedRequests     int64 `json:"blocked_requests"`
	ChallengeCount      int64 `json:"challenge_count"`
	Errors4xx           int64 `json:"errors_4xx"`
	Errors5xx           int64 `json:"errors_5xx"`
	APIRequests         int64 `json:"api_requests"`
	LoginAttempts       int64 `json:"login_attempts"`
	FailedLoginAttempts int64 `json:"failed_login_attempts"`
	BandwidthBytes      int64 `json:"bandwidth_bytes"`
	PeakRPS             int64 `json:"peak_rps"`
	AverageResponseMs   int64 `json:"average_response_ms"`
	DefenseCPU          int64 `json:"defense_cpu_pct"`
	DefenseMemory       int64 `json:"defense_memory_pct"`
	UnderAttack         bool  `json:"under_attack"`

	// DDoS runtime state (not editable, surfaced for monitoring).
	DDOSActive          bool   `json:"ddos_active"`
	DDOSStopCount       int64  `json:"ddos_stop_count"`
	DDOSCooldownUntil   string `json:"ddos_cooldown_until"`

	// DDOSTCPDropped counts how many TCP connections the listener has
	// refused at the socket layer since launch because the DDoS
	// auto-stop was active. The counter is read from the wrapper in
	// internal/api/ddos_listener.go. It is process-cumulative, not
	// window-bound, so the admin page shows the total impact of the
	// current auto-stop (and prior stops) at a glance.
	DDOSTCPDropped  uint64 `json:"ddos_tcp_dropped"`
	DDOSTCPAccepted uint64 `json:"ddos_tcp_accepted"`

	// Config is the editable runtime config the Security page reads to
	// decide what to display in the rate-limit form. Lives inside the
	// snapshot so the page can paint both the live numbers and the editable
	// controls in a single round-trip; the PUT endpoint echoes the same
	// shape back so the SPA can refresh its local state without re-fetching.
	Config SecurityConfig `json:"config"`

	// --- Top-N lists (already capped server-side) ---
	TopIPs         []SecurityTopEntry `json:"top_ips"`
	RequestsPerIP  []SecurityTopEntry `json:"requests_per_ip"`
	Countries      []SecurityTopEntry `json:"countries"`
	UserAgents     []SecurityTopEntry `json:"user_agents"`
}

// SecurityConfig is the operator-editable subset of the security policy. It
// is persisted in the settings KV (migration 028) and read by both the
// SecurityMiddleware (to decide which requests to block) and the Security
// admin page (to render the edit form). Every field has a safe default
// loaded when the row is missing so a brand-new install behaves sensibly
// without the admin ever opening the page.
type SecurityConfig struct {
	// RequestsPerMinuteLimit caps how many requests a single client IP may
	// make inside the rolling `WindowSecondsLimit` window. Expressed as
	// requests-per-minute to match the UI label. 0 disables per-IP throttling.
	RequestsPerMinuteLimit int64 `json:"requests_per_minute_limit"`
	// WindowSecondsLimit is the size of the rolling window the per-IP cap
	// is evaluated against. Defaults to 60.
	WindowSecondsLimit int64 `json:"window_seconds_limit"`
	// GlobalRPMLimit caps total requests-per-minute across the whole panel.
	// When crossed AND UnderAttack is on, every additional request returns
	// 429 + is stamped blocked = 1 in the telemetry table. 0 disables.
	GlobalRPMLimit int64 `json:"global_rpm_limit"`
	// BlockUnknownUA causes the middleware to short-circuit any request
	// whose User-Agent header is empty (curl/wget probes, headless scrapers).
	// Off by default to keep scripted tooling working out of the box.
	BlockUnknownUA bool `json:"block_unknown_ua"`

	// DDOSAutoStopEnabled enables automatic panel stop when DDoS is detected.
	// When on, if a single IP exceeds the per-minute limit while UnderAttack
	// is active, the panel stops accepting new requests for the cooldown period.
	DDOSAutoStopEnabled bool `json:"ddos_auto_stop_enabled"`
	// DDOSStopMinutes is how many minutes the panel stays stopped after a
	// DDoS auto-stop triggers. Default 5.
	DDOSStopMinutes int64 `json:"ddos_stop_minutes"`
	// DDOSMaxStopCount is the maximum number of times the panel will
	// automatically stop. 0 = unlimited. After reaching this count,
	// auto-stop is disabled until manually reset.
	DDOSMaxStopCount int64 `json:"ddos_max_stop_count"`
}

// SecurityTopEntry is one row of any of the Top-N lists (top IPs,
// requests-per-IP, countries, user agents). The `Label` is the dimension
// value (the IP address, the country code, the user-agent string) and
// `Count` is how many requests matched it in the snapshot window.
type SecurityTopEntry struct {
	Label string `json:"label"`
	Count int64  `json:"count"`
}
