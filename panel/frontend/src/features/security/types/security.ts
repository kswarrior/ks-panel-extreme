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

  // DDoS port-switch runtime state: which port the panel is actually
  // serving on right now and whether a reaction moved it off the launch
  // port. ddos_port_error carries the last bind failure (e.g. alt port
  // already in use) so the UI can explain why a switch didn't happen.
  ddos_active_port: number;
  ddos_port_switched: boolean;
  ddos_port_error: string;

  // TCP-level DDoS listener counters (process-cumulative): how many
  // connections were accepted vs hard-refused at the socket layer while
  // auto-stop was active.
  ddos_tcp_accepted: number;
  ddos_tcp_dropped: number;

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

  // DDOSAutoStopEnabled enables automatic DDoS protection: when a single
  // IP exceeds the per-minute limit, or the global burst detector (see
  // ddos_global_trigger_hits) trips, the configured reaction fires
  // (ddos_mode) for ddos_stop_minutes.
  ddos_auto_stop_enabled: boolean;
  // DDOSStopMinutes is how many minutes the panel stays stopped after a
  // DDoS auto-stop triggers. Default 5.
  ddos_stop_minutes: number;
  // DDOSMaxStopCount is the maximum number of times the panel will
  // automatically stop. 0 = unlimited. After reaching this count,
  // auto-stop is disabled until manually reset.
  ddos_max_stop_count: number;
  // DDOSMode selects the reaction when a DDoS is detected:
  //   - "stop": refuse new requests for the cooldown window.
  //   - "port_switch": move the panel onto ddos_alt_port so attackers
  //     keep hitting a dead port while the panel stays reachable.
  // Mirrors models.DDOSMode* constants on the Go side.
  ddos_mode: 'stop' | 'port_switch';
  // DDOSAltPort is the port the panel moves to in "port_switch" mode.
  // Must be 1-65535 and differ from the current panel port.
  ddos_alt_port: number;
  // Global burst detector: trips auto protection when more than this
  // many requests arrive across ALL IPs inside the window below (catches
  // distributed floods no single IP would trip). 0 = disabled.
  ddos_global_trigger_hits: number;
  // Sliding window (seconds) for the global burst detector. Clamped to
  // 5-60 by the backend.
  ddos_global_trigger_window: number;

  // ── Firewall tab: IP allow/deny + WAF / Request Filtering ──
  // Client IPs or CIDRs that bypass the per-IP rate limit.
  ip_allowlist: string[];
  // Client IPs or CIDRs that are hard-rejected with 403.
  ip_denylist: string[];
  // Per-request body size cap in megabytes (backend clamps >= 1).
  max_body_size_mb: number;
  // CSV HTTP-method allowlist ("" = every method allowed).
  allowed_http_methods: string;
  // Reject known scanner/probe paths (/.env, /wp-admin, ...) with 403.
  block_suspicious_paths: boolean;

  // ── Sessions tab: session policy ──
  // Absolute session lifetime in minutes (drives cookie TTL + bearer
  // max-age). Default 480 (= previous hardcoded 8h).
  session_lifetime_minutes: number;
  // Idle timeout in minutes for tracked sessions (default 1440 = 24h).
  session_idle_timeout_minutes: number;
  // Maximum concurrent active sessions per user (0 = unlimited).
  session_max_per_user: number;
}

// One tracked session on the Sessions tab's devices table. `id` is a
// non-reversible SHA-256 prefix of the token used as the revoke handle —
// full tokens never leave the server.
export interface SecuritySessionEntry {
  id: string;
  user_id: number;
  username: string;
  ip_address: string;
  user_agent: string;
  issued_at: string;
  last_used: string;
  current: boolean;
}

export interface SecuritySessionsResponse {
  sessions: SecuritySessionEntry[];
  total: number;
}

export interface CookieSecurityInfo {
  name: string;
  host_prefix: boolean;
  http_only: boolean;
  same_site: string;
  secure: boolean;
  path: string;
  lifetime_min: number;
  idle_timeout_min: number;
}

// Read-only snapshot of panel-wide network protections rendered by the
// Firewall tab's status cards. The backend reports what is actually wired,
// including honest "not enforced" answers.
export interface SecurityStatusResponse {
  cors: {
    credentials: boolean;
    development_mode: boolean;
    origin_validation: boolean;
    allowed_origins: string[];
  };
  csrf: {
    token_middleware_enforced: boolean;
    session_cookie_same_site: string;
    origin_validation: boolean;
    note: string;
  };
  security_headers: {
    enforced: boolean;
    middleware_wired: boolean;
    applied_headers: string[];
    note: string;
  };
  request_limits: {
    max_body_mb: number;
  };
  cookie: CookieSecurityInfo;
}

// Login-protection status (Authentication tab): the effective lockout
// policy plus currently locked accounts.
export interface LockoutStatus {
  max_attempts: number;
  window_minutes: number;
  lockout_minutes: number;
  locked: Array<{ username: string; locked_at: string }>;
}

export interface RecoveryCodesStatus {
  users_with_codes: number;
  unused_codes: number;
}

export interface SecurityTopEntry {
  label: string;
  count: number;
}