// Security types — payload of the single /api/security round-trip.
//
// Mirrors internal/models/security.go (Go-side shape). The Security admin
// page renders every field here; the React side never constructs this
// shape from scratch — it only consumes what the handler returns.

export interface SecuritySnapshot {
  generated_at: string;
  // WindowSeconds is the aggregate window the cumulatives cover (the
  // backend uses 5 minutes). Surfaced as a "over the last Ns" suffix so
  // operators reading the numbers understand their scope.
  window_seconds: number;

  // Headline counters — cumulative over the window.
  total_requests: number;
  requests_per_second: number;
  requests_per_minute: number;
  active_connections: number;
  unique_visitors: number;
  blocked_requests: number;
  challenge_count: number;
  errors_4xx: number;
  errors_5xx: number;
  api_requests: number;
  login_attempts: number;
  failed_login_attempts: number;
  bandwidth_bytes: number;
  peak_rps: number;
  average_response_ms: number;
  defense_cpu_pct: number;
  defense_memory_pct: number;
  under_attack: boolean;

  // DDoS runtime state (not editable, surfaced for monitoring).
  ddos_active: boolean;
  ddos_stop_count: number;
  ddos_cooldown_until: string;

  // Config is the editable runtime config the Security page reads to
  // decide what to display in the rate-limit form. Lives inside the
  // snapshot so the page can paint both the live numbers and the editable
  // controls in a single round-trip; the PUT endpoint echoes the same
  // shape back so the SPA can refresh its local state without re-fetching.
  config: SecurityConfig;

  // Top-N lists — already capped server-side.
  top_ips: SecurityTopEntry[];
  requests_per_ip: SecurityTopEntry[];
  countries: SecurityTopEntry[];
  user_agents: SecurityTopEntry[];
}

export interface SecurityConfig {
  // RequestsPerMinuteLimit caps how many requests a single client IP may
  // make inside the rolling WindowSecondsLimit window. Expressed as
  // requests-per-minute to match the UI label. 0 disables per-IP throttling.
  requests_per_minute_limit: number;
  // WindowSecondsLimit is the size of the rolling window the per-IP cap
  // is evaluated against. Defaults to 60.
  window_seconds_limit: number;
  // GlobalRPMLimit caps total requests-per-minute across the whole panel.
  // When crossed AND UnderAttack is on, every additional request returns
  // 429 + is stamped blocked = 1 in the telemetry table. 0 disables.
  global_rpm_limit: number;
  // BlockUnknownUA causes the middleware to short-circuit any request
  // whose User-Agent header is empty (curl/wget probes, headless scrapers).
  // Off by default to keep scripted tooling working out of the box.
  block_unknown_ua: boolean;

  // DDOSAutoStopEnabled enables automatic panel stop when DDoS is detected.
  // When on, if a single IP exceeds the per-minute limit while UnderAttack
  // is active, the panel stops accepting new requests for the cooldown period.
  ddos_auto_stop_enabled: boolean;
  // DDOSStopMinutes is how many minutes the panel stays stopped after a
  // DDoS auto-stop triggers. Default 5.
  ddos_stop_minutes: number;
  // DDOSMaxStopCount is the maximum number of times the panel will
  // automatically stop. 0 = unlimited. After reaching this count,
  // auto-stop is disabled until manually reset.
  ddos_max_stop_count: number;
}

export interface SecurityTopEntry {
  label: string;
  count: number;
}