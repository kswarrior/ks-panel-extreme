package repository

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// strconvI64 / boolStr are tiny adapters that keep the upsert loop above
// readable — they take typed values to the wire format the settings KV
// expects (string-encoded ints + "0"/"1" booleans).
func strconvI64(n int64) string { return strconv.FormatInt(n, 10) }
func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// SecurityRepository writes + aggregates the security_requests telemetry
// table that backs the Security admin page. The store is append-only like the
// activity repository: there is only Insert (one row per HTTP request,
// called from the security middleware) + the read-only Snapshot aggregator.
//
// The operator-editable config (per-IP RPS cap, window size, unknown-UA
// toggle, …) lives in the shared settings KV; see GetConfig / UpdateConfig
// below.
type SecurityRepository struct {
	db *sql.DB
}

func NewSecurityRepository(db *sql.DB) *SecurityRepository {
	return &SecurityRepository{db: db}
}

// Settings keys the security middleware + admin page share. Exposed as
// constants so the middleware's read path and the snapshot / PUT handler
// agree on the exact spelling without copy-pasting strings.
const (
	// SecurityRequestsPerMinuteKey caps per-IP requests inside the rolling
	// `SecurityWindowSecondsKey` window.
	SecurityRequestsPerMinuteKey = "security_requests_per_minute_limit"
	// SecurityWindowSecondsKey is the size of the rolling window the per-IP
	// cap is evaluated against.
	SecurityWindowSecondsKey = "security_window_seconds_limit"
	// SecurityGlobalRPMKey caps total requests-per-minute across the panel
	// (only enforced while the UnderAttack toggle is on).
	SecurityGlobalRPMKey = "security_global_rpm_limit"
	// SecurityBlockUnknownUAKey is the on/off toggle for empty-UA blocking.
	SecurityBlockUnknownUAKey = "security_block_unknown_ua"
	// SecurityDDOSAutoStopEnabledKey enables DDoS auto-stop on detection.
	SecurityDDOSAutoStopEnabledKey = "security_ddos_auto_stop_enabled"
	// SecurityDDOSStopMinutesKey is how many minutes to stay stopped.
	SecurityDDOSStopMinutesKey = "security_ddos_stop_minutes"
	// SecurityDDOSMaxStopCountKey is the max number of auto-stops before
	// auto protection disables itself until reset (0 = unlimited).
	SecurityDDOSMaxStopCountKey = "security_ddos_max_stop_count"
	// SecurityDDOSStopCountKey tracks how many times auto-stop triggered.
	SecurityDDOSStopCountKey = "security_ddos_stop_count"
	// SecurityDDOSCooldownUntilKey stores the RFC3339 cooldown expiry.
	SecurityDDOSCooldownUntilKey = "security_ddos_cooldown_until"
	// SecurityDDOSModeKey selects the reaction mode ("stop" or
	// "port_switch") — see models.DDOSMode* constants.
	SecurityDDOSModeKey = "security_ddos_mode"
	// SecurityDDOSAltPortKey is the port the panel moves to in
	// "port_switch" mode.
	SecurityDDOSAltPortKey = "security_ddos_alt_port"
	// SecurityDDOSGlobalTriggerHitsKey arms the all-IP burst detector.
	SecurityDDOSGlobalTriggerHitsKey = "security_ddos_global_trigger_hits"
	// SecurityDDOSGlobalTriggerWindowKey is its sliding window in seconds.
	SecurityDDOSGlobalTriggerWindowKey = "security_ddos_global_trigger_window"
	// SecurityIPAllowlistKey is a comma-separated list of client IPs /
	// CIDRs that bypass the per-IP rate limit.
	SecurityIPAllowlistKey = "security_ip_allowlist"
	// SecurityIPDenylistKey is a comma-separated list of client IPs /
	// CIDRs that are hard-rejected.
	SecurityIPDenylistKey = "security_ip_denylist"
	// SecurityMaxBodySizeKey caps request body size in megabytes.
	SecurityMaxBodySizeKey = "security_max_body_size_mb"
	// SecurityAllowedMethodsKey is a CSV HTTP-method allowlist ("" = all).
	SecurityAllowedMethodsKey = "security_allowed_http_methods"
	// SecurityBlockSuspiciousPathsKey toggles blocking of known
	// scanner/probe paths.
	SecurityBlockSuspiciousPathsKey = "security_block_suspicious_paths"
	// SecuritySessionLifetimeKey bounds the absolute session lifetime in
	// minutes (drives cookie TTL + bearer max-age).
	SecuritySessionLifetimeKey = "security_session_lifetime_minutes"
	// SecuritySessionIdleTimeoutKey invalidates tracked sessions unused
	// for this many minutes.
	SecuritySessionIdleTimeoutKey = "security_session_idle_timeout_minutes"
	// SecuritySessionMaxPerUserKey caps concurrent sessions per user
	// (0 = unlimited).
	SecuritySessionMaxPerUserKey = "security_session_max_per_user"
)

// Defaults for every editable knob. Used by GetConfig when the settings row
// is missing so a brand-new install behaves sensibly without an admin ever
// opening the page.
const (
	defaultRequestsPerMinute = int64(600) // 10 rps per IP
	defaultWindowSeconds     = int64(60)
	defaultGlobalRPM         = int64(0) // disabled by default
	defaultBlockUnknownUA    = false
	defaultDDOSAutoStop      = false
	defaultDDOSStopMinutes   = int64(5)
	defaultDDOSMaxStopCount  = int64(0) // 0 = unlimited
	defaultDDOSMode          = models.DDOSModeStop
	defaultDDOSAltPort       = int64(5050)
	// defaultDDOSGlobalTriggerHits is 0 (detector off) so a fresh install
	// behaves exactly like the pre-port-switch builds: detection comes
	// only from the per-IP rate limit.
	defaultDDOSGlobalTriggerHits   = int64(0)
	defaultDDOSGlobalTriggerWindow = int64(10)

	// Firewall / WAF defaults. 10 MB mirrors the previous hardcoded
	// MaxBodySize constant in internal/api/server.go; empty method
	// allowlist and disabled suspicious-path block mirror the previous
	// behaviour where no such checks existed.
	defaultIPAllowlist          = ""
	defaultIPDenylist           = ""
	defaultMaxBodySizeMB        = int64(10)
	defaultAllowedMethods       = ""
	defaultBlockSuspiciousPaths = false

	// Session defaults mirror the pre-config constants: 8h lifetime
	// (auth.SessionTTL), 24h idle cleanup (SessionManager) and no
	// per-user cap.
	defaultSessionLifetimeMinutes = int64(480)
	defaultSessionIdleMinutes     = int64(1440)
	defaultSessionMaxPerUser      = int64(0)
)

// getDDOSMode reads the reaction mode, normalizing anything unknown to the
// safe "stop" default so a hand-edited settings row can't put the panel in
// a mode this build doesn't understand.
func (r *SecurityRepository) getDDOSMode() string {
	m := r.getString(SecurityDDOSModeKey, defaultDDOSMode)
	if m != models.DDOSModeStop && m != models.DDOSModePortSwitch {
		return models.DDOSModeStop
	}
	return m
}

// GetConfig returns the persisted security config, applying the defaults
// above for every missing or invalid row. Never errors so a fresh DB
// doesn't 500 the Security page on first load.
func (r *SecurityRepository) GetConfig() models.SecurityConfig {
	return models.SecurityConfig{
		RequestsPerMinuteLimit:  r.getInt(SecurityRequestsPerMinuteKey, defaultRequestsPerMinute),
		WindowSecondsLimit:      r.getInt(SecurityWindowSecondsKey, defaultWindowSeconds),
		GlobalRPMLimit:          r.getInt(SecurityGlobalRPMKey, defaultGlobalRPM),
		BlockUnknownUA:          r.getBool(SecurityBlockUnknownUAKey, defaultBlockUnknownUA),
		DDOSAutoStopEnabled:     r.getBool(SecurityDDOSAutoStopEnabledKey, defaultDDOSAutoStop),
		DDOSStopMinutes:         r.getInt(SecurityDDOSStopMinutesKey, defaultDDOSStopMinutes),
		DDOSMaxStopCount:        r.getInt(SecurityDDOSMaxStopCountKey, defaultDDOSMaxStopCount),
		DDOSMode:                r.getDDOSMode(),
		DDOSAltPort:             r.getInt(SecurityDDOSAltPortKey, defaultDDOSAltPort),
		DDOSGlobalTriggerHits:   r.getInt(SecurityDDOSGlobalTriggerHitsKey, defaultDDOSGlobalTriggerHits),
		DDOSGlobalTriggerWindow: r.getInt(SecurityDDOSGlobalTriggerWindowKey, defaultDDOSGlobalTriggerWindow),

		IPAllowlist:          r.getCsvList(SecurityIPAllowlistKey, defaultIPAllowlist),
		IPDenylist:           r.getCsvList(SecurityIPDenylistKey, defaultIPDenylist),
		MaxBodySizeMB:        clampMin(r.getInt(SecurityMaxBodySizeKey, defaultMaxBodySizeMB), 1),
		AllowedHTTPMethods:   r.getString(SecurityAllowedMethodsKey, defaultAllowedMethods),
		BlockSuspiciousPaths: r.getBool(SecurityBlockSuspiciousPathsKey, defaultBlockSuspiciousPaths),

		SessionLifetimeMinutes:    clampMin(r.getInt(SecuritySessionLifetimeKey, defaultSessionLifetimeMinutes), 1),
		SessionIdleTimeoutMinutes: clampMin(r.getInt(SecuritySessionIdleTimeoutKey, defaultSessionIdleMinutes), 1),
		SessionMaxPerUser:         r.getInt(SecuritySessionMaxPerUserKey, defaultSessionMaxPerUser),
	}
}

// clampMin floors v at min (0 stays a legal "disabled" for counters, but
// size/lifetime knobs must never end up at zero or the panel would
// self-DoS).
func clampMin(v, min int64) int64 {
	if v < min {
		return min
	}
	return v
}

// getCsvList reads a comma-separated settings row into a clean string
// slice (trimmed entries, blanks dropped). A missing row yields an empty
// (non-nil) slice so JSON consumers always see an array.
func (r *SecurityRepository) getCsvList(key, def string) []string {
	raw := r.getString(key, def)
	out := []string{}
	for _, part := range strings.Split(raw, ",") {
		if s := strings.TrimSpace(part); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// joinCsv serializes an IP / method list back to the comma-separated KV
// wire format.
func joinCsv(list []string) string {
	cleaned := make([]string, 0, len(list))
	for _, s := range list {
		if t := strings.TrimSpace(s); t != "" {
			cleaned = append(cleaned, t)
		}
	}
	return strings.Join(cleaned, ",")
}

// UpdateConfig upserts every editable field into the settings KV. Zeros are
// persisted as-is — the SPA uses 0 to mean "disabled" for both
// requests-per-minute and global RPS caps, and clamping them away here
// would silently re-enable blocking when an admin cleared the input.
func (r *SecurityRepository) UpdateConfig(c models.SecurityConfig) error {
	writes := []struct {
		key, val string
	}{
		{SecurityRequestsPerMinuteKey, strconvI64(c.RequestsPerMinuteLimit)},
		{SecurityWindowSecondsKey, strconvI64(c.WindowSecondsLimit)},
		{SecurityGlobalRPMKey, strconvI64(c.GlobalRPMLimit)},
		{SecurityBlockUnknownUAKey, boolStr(c.BlockUnknownUA)},
		{SecurityDDOSAutoStopEnabledKey, boolStr(c.DDOSAutoStopEnabled)},
		{SecurityDDOSStopMinutesKey, strconvI64(c.DDOSStopMinutes)},
		// DDOSMaxStopCount gets its own key. It must never be written to
		// SecurityDDOSStopCountKey: that key tracks how many times
		// auto-stop HAS triggered (runtime history), while max-stop-count
		// is an operator preference. Collapsing them used to reset the
		// trigger history on every config save.
		{SecurityDDOSMaxStopCountKey, strconvI64(c.DDOSMaxStopCount)},
		{SecurityDDOSModeKey, c.DDOSMode},
		{SecurityDDOSAltPortKey, strconvI64(c.DDOSAltPort)},
		{SecurityDDOSGlobalTriggerHitsKey, strconvI64(c.DDOSGlobalTriggerHits)},
		{SecurityDDOSGlobalTriggerWindowKey, strconvI64(c.DDOSGlobalTriggerWindow)},

		{SecurityIPAllowlistKey, joinCsv(c.IPAllowlist)},
		{SecurityIPDenylistKey, joinCsv(c.IPDenylist)},
		{SecurityMaxBodySizeKey, strconvI64(clampMin(c.MaxBodySizeMB, 1))},
		{SecurityAllowedMethodsKey, strings.ToUpper(strings.Join(strings.Fields(strings.ReplaceAll(c.AllowedHTTPMethods, ",", " ")), ","))},
		{SecurityBlockSuspiciousPathsKey, boolStr(c.BlockSuspiciousPaths)},

		{SecuritySessionLifetimeKey, strconvI64(clampMin(c.SessionLifetimeMinutes, 1))},
		{SecuritySessionIdleTimeoutKey, strconvI64(clampMin(c.SessionIdleTimeoutMinutes, 1))},
		{SecuritySessionMaxPerUserKey, strconvI64(c.SessionMaxPerUser)},
	}
	for _, w := range writes {
		if _, err := r.db.Exec(
			`INSERT INTO settings (`+qKey()+`, value) VALUES (?, ?)`+upsertSet("(key)", []string{"value"}),
			w.key, w.val,
		); err != nil {
			return fmt.Errorf("security config upsert %s: %w", w.key, err)
		}
	}
	return nil
}

// getInt reads a single key from settings and parses it as int64. Anything
// non-numeric (including a missing row) falls back to the supplied default
// so the security middleware + snapshot can rely on a real number.
func (r *SecurityRepository) getInt(key string, def int64) int64 {
	var v string
	if err := r.db.QueryRow(`SELECT value FROM settings WHERE `+qKey()+` = ?`, key).Scan(&v); err != nil {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return def
	}
	if n < 0 {
		return 0
	}
	return n
}

// getBool reads a "0"/"1" row as a real bool.
func (r *SecurityRepository) getBool(key string, def bool) bool {
	var v string
	if err := r.db.QueryRow(`SELECT value FROM settings WHERE `+qKey()+` = ?`, key).Scan(&v); err != nil {
		return def
	}
	return v == "1"
}

// getString reads a string value from settings.
func (r *SecurityRepository) getString(key string, def string) string {
	var v string
	if err := r.db.QueryRow(`SELECT value FROM settings WHERE `+qKey()+` = ?`, key).Scan(&v); err != nil {
		return def
	}
	return v
}

// setString writes a string value to settings.
func (r *SecurityRepository) setString(key, val string) error {
	_, err := r.db.Exec(
		`INSERT INTO settings (`+qKey()+`, value) VALUES (?, ?)`+upsertSet("(key)", []string{"value"}),
		key, val,
	)
	return err
}

// SecurityRequestInput is the per-request record the security middleware
// passes to Insert. Every field is best-effort: a missing optional column
// maps to its default (NULL user_id, empty strings, zeros) so the logger
// never blocks a response waiting on a row.
type SecurityRequestInput struct {
	ClientIP   string
	Method     string
	Path       string
	Status     int
	UserID     *int64
	UserAgent  string
	Country    string
	Blocked    bool
	Challenged bool
	IsAPI      bool
	IsLogin    bool
	BytesSent  int64
	DurationMs int64
}

// Insert appends one request row. Returns the assigned id (and the error
// is logged + swallowed by the caller so a logging failure never breaks the
// response that triggered it — same contract as RecordActivity).
//
// modernc.org/sqlite rejects a Go nil as a bound parameter, so the optional
// user_id pointer is bound as the int when present, or omitted to a literal
// SQL NULL otherwise (mirrors activity_repo's optional-ID handling).
func (r *SecurityRepository) Insert(in SecurityRequestInput) (int64, error) {
	var blocked, challenged, isAPI, isLogin int64
	if in.Blocked {
		blocked = 1
	}
	if in.Challenged {
		challenged = 1
	}
	if in.IsAPI {
		isAPI = 1
	}
	if in.IsLogin {
		isLogin = 1
	}
	// Guard the user-agent length so a hostile or misbehaving client can't
	// grow the column unbounded. Mirrors the activity repo's *_LOGS columns
	// which the panel already trusts to be short.
	ua := in.UserAgent
	if len(ua) > 512 {
		ua = ua[:512]
	}

	var (
		q    string
		args []interface{}
	)
	q = `INSERT INTO security_requests
		(client_ip, method, path, status, user_id, user_agent, country,
		 blocked, challenged, is_api, is_login, bytes_sent, duration_ms)
		VALUES (?, ?, ?, ?, `
	args = append(args, in.ClientIP, in.Method, in.Path, in.Status)
	if in.UserID == nil {
		q += "NULL, ?, "
	} else {
		q += "?, ?, "
		args = append(args, *in.UserID)
	}
	// Seven trailing values: ua, country, blocked, challenged, is_api,
	// is_login, bytes_sent, duration_ms — matches the 7 "?" placeholders.
	args = append(args, ua, in.Country, blocked, challenged, isAPI, isLogin, in.BytesSent, in.DurationMs)
	q += "?, ?, ?, ?, ?, ?, ?)"

	res, err := r.db.Exec(q, args...)
	if err != nil {
		log.Printf("security_requests insert: %v", err)
		return 0, err
	}
	return res.LastInsertId()
}

// InsertWithContext appends one request row with a context for timeout
// control. The context is passed to the underlying driver's ExecContext
// so a slow or unreachable DB cannot hang the goroutine indefinitely.
func (r *SecurityRepository) InsertWithContext(ctx context.Context, in SecurityRequestInput) (int64, error) {
	var blocked, challenged, isAPI, isLogin int64
	if in.Blocked {
		blocked = 1
	}
	if in.Challenged {
		challenged = 1
	}
	if in.IsAPI {
		isAPI = 1
	}
	if in.IsLogin {
		isLogin = 1
	}
	// Guard the user-agent length so a hostile or misbehaving client can't
	// grow the column unbounded. Mirrors the activity repo's *_LOGS columns
	// which the panel already trusts to be short.
	ua := in.UserAgent
	if len(ua) > 512 {
		ua = ua[:512]
	}

	var (
		q    string
		args []interface{}
	)
	q = `INSERT INTO security_requests
		(client_ip, method, path, status, user_id, user_agent, country,
		 blocked, challenged, is_api, is_login, bytes_sent, duration_ms)
		VALUES (?, ?, ?, ?, `
	args = append(args, in.ClientIP, in.Method, in.Path, in.Status)
	if in.UserID == nil {
		q += "NULL, ?, "
	} else {
		q += "?, ?, "
		args = append(args, *in.UserID)
	}
	// Seven trailing values: ua, country, blocked, challenged, is_api,
	// is_login, bytes_sent, duration_ms — matches the 7 "?" placeholders.
	args = append(args, ua, in.Country, blocked, challenged, isAPI, isLogin, in.BytesSent, in.DurationMs)
	q += "?, ?, ?, ?, ?, ?, ?)"

	res, err := r.db.ExecContext(ctx, q, args...)
	if err != nil {
		log.Printf("security_requests insert with context: %v", err)
		return 0, err
	}
	return res.LastInsertId()
}

// IsUnderAttack reads the persisted security_under_attack setting so the
// security middleware can decide whether to challenge every inbound request
// and the Snapshot handler can surface the Attack Status flag to the UI. The
// value lives in the shared settings KV table (seeded by migration 027).
func (r *SecurityRepository) IsUnderAttack() bool {
	var v string
	err := r.db.QueryRow(`SELECT value FROM settings WHERE ` + qKey() + ` = 'security_under_attack'`).Scan(&v)
	if err != nil {
		return false
	}
	return v == "1"
}

// SetUnderAttack toggles the persisted attack-status flag. Implemented as an
// UPDATE-then-fallback-INSERT so it works across SQLite / Postgres / MySQL
// (ON CONFLICT / ON DUPLICATE KEY UPDATE differ per engine).
func (r *SecurityRepository) SetUnderAttack(under bool) error {
	val := "0"
	if under {
		val = "1"
	}
	res, err := r.db.Exec(`UPDATE settings SET value = ? WHERE `+qKey()+` = 'security_under_attack'`, val)
	if err != nil {
		return err
	}
	if n, e := res.RowsAffected(); e == nil && n > 0 {
		return nil
	}
	_, err = r.db.Exec(
		`INSERT INTO settings (`+qKey()+`, value) VALUES ('security_under_attack', ?)`, val)
	return err
}

// GetDDOSStopCount returns the current auto-stop trigger count.
func (r *SecurityRepository) GetDDOSStopCount() int64 {
	return r.getInt(SecurityDDOSStopCountKey, 0)
}

// IncrementDDOSStopCount increments and returns the new auto-stop trigger count.
func (r *SecurityRepository) IncrementDDOSStopCount() (int64, error) {
	newCount := r.getInt(SecurityDDOSStopCountKey, 0) + 1
	err := r.setString(SecurityDDOSStopCountKey, strconvI64(newCount))
	return newCount, err
}

// GetDDOSCooldownUntil returns the cooldown expiry timestamp.
func (r *SecurityRepository) GetDDOSCooldownUntil() (time.Time, error) {
	v := r.getString(SecurityDDOSCooldownUntilKey, "")
	if v == "" {
		return time.Time{}, nil
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return time.Time{}, err
	}
	return t, nil
}

// SetDDOSCooldownUntil sets the cooldown expiry timestamp.
func (r *SecurityRepository) SetDDOSCooldownUntil(t time.Time) error {
	var val string
	if !t.IsZero() {
		val = t.Format(time.RFC3339)
	}
	return r.setString(SecurityDDOSCooldownUntilKey, val)
}

// ClearDDOSState resets the DDoS runtime state (count and cooldown).
func (r *SecurityRepository) ClearDDOSState() error {
	if err := r.setString(SecurityDDOSStopCountKey, "0"); err != nil {
		return err
	}
	return r.setString(SecurityDDOSCooldownUntilKey, "")
}

// Snapshot aggregates the security_requests feed into the headline
// counters + top-N lists the Security admin page renders. The whole pass is
// a handful of SELECTs against indexed columns; on a busy panel it stays
// well under 50ms even with tens of thousands request rows in the window.
//
// The window argument scopes the cumulatives (total / blocked / errors /
// etc.); RPS is derived as total / window_seconds. Top-N lists always cap
// their result set so a hostile distribution can't blow up the response.
func (r *SecurityRepository) Snapshot(window time.Duration) (*models.SecuritySnapshot, error) {
	snap := &models.SecuritySnapshot{
		GeneratedAt:   time.Now().UTC(),
		WindowSeconds: int64(window.Seconds()),
		TopIPs:        []models.SecurityTopEntry{},
		RequestsPerIP: []models.SecurityTopEntry{},
		Countries:     []models.SecurityTopEntry{},
		UserAgents:    []models.SecurityTopEntry{},
		Config:        r.GetConfig(),
	}

	cutoff := time.Now().UTC().Add(-window).Format("2006-01-02 15:04:05")

	// AVG over an INTEGER column returns a float64 in every supported
	// dialect; scan into a separate float and round so we can keep
	// AverageResponseMs as an int64 in the model without an SQL type cast.
	var avgMs float64

	// Headline cumulatives in one SELECT — every aggregate the page needs
	// except the top-N lists and the per-second peak, which need their own.
	if err := r.db.QueryRow(`
		SELECT
			COUNT(*),
			COUNT(DISTINCT client_ip),
			COALESCE(SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN challenged = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_api = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_login = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_login = 1 AND status IN (401, 403) THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(bytes_sent), 0),
			COALESCE(AVG(duration_ms), 0)
		FROM security_requests
		WHERE created_at >= ?`, cutoff).Scan(
		&snap.TotalRequests, &snap.UniqueVisitors, &snap.BlockedRequests,
		&snap.ChallengeCount, &snap.Errors4xx, &snap.Errors5xx,
		&snap.APIRequests, &snap.LoginAttempts, &snap.FailedLoginAttempts,
		&snap.BandwidthBytes, &avgMs); err != nil {
		return nil, fmt.Errorf("security headline: %w", err)
	}
	snap.AverageResponseMs = int64(avgMs + 0.5)

	// RPS / RPM derived from the total + window. Active connections is
	// approximated as the count of requests whose duration_ms straddles
	// "now" — since the table is closed per-row, we surface the count of
	// requests in the last 5s as a proxy for live load.
	secs := snap.WindowSeconds
	if secs <= 0 {
		secs = 1
	}
	snap.RequestsPerSecond = snap.TotalRequests / secs
	snap.RequestsPerMinute = snap.TotalRequests * 60 / secs

	// Active connections: count of distinct client IPs that hit the panel
	// in the last 5 seconds. Cheap proxy for "live load" that doesn't need
	// a separate live-connections tracking table.
	liveCutoff := time.Now().UTC().Add(-5 * time.Second).Format("2006-01-02 15:04:05")
	_ = r.db.QueryRow(`SELECT COUNT(DISTINCT client_ip) FROM security_requests WHERE created_at >= ?`, liveCutoff).Scan(&snap.ActiveConnections)

	// Peak RPS: highest per-second bucket in the window. GROUP BY the
	// truncated second and take MAX.
	var peak sql.NullInt64
	_ = r.db.QueryRow(`
		SELECT MAX(n) FROM (
			SELECT COUNT(*) AS n
			FROM security_requests
			WHERE created_at >= ?
			GROUP BY strftime('%Y-%m-%d %H:%M:%S', created_at)
		)`, cutoff).Scan(&peak)
	if peak.Valid {
		snap.PeakRPS = peak.Int64
	}

	// Top-N lists — each capped to keep the response compact.
	snap.TopIPs, _ = r.topN(`SELECT client_ip, COUNT(*) FROM security_requests WHERE created_at >= ? AND client_ip != '' GROUP BY client_ip ORDER BY COUNT(*) DESC LIMIT 10`, cutoff)
	snap.RequestsPerIP, _ = r.topN(`SELECT client_ip, COUNT(*) FROM security_requests WHERE created_at >= ? AND client_ip != '' GROUP BY client_ip ORDER BY COUNT(*) DESC LIMIT 50`, cutoff)
	snap.Countries, _ = r.topN(`SELECT country, COUNT(*) FROM security_requests WHERE created_at >= ? AND country != '' GROUP BY country ORDER BY COUNT(*) DESC LIMIT 20`, cutoff)
	snap.UserAgents, _ = r.topN(`SELECT user_agent, COUNT(*) FROM security_requests WHERE created_at >= ? AND user_agent != '' GROUP BY user_agent ORDER BY COUNT(*) DESC LIMIT 20`, cutoff)

	// Attack status flag from the persisted settings KV.
	snap.UnderAttack = r.IsUnderAttack()

	// DDoS runtime state.
	snap.DDOSStopCount = r.GetDDOSStopCount()
	cooldown, _ := r.GetDDOSCooldownUntil()
	if !cooldown.IsZero() {
		snap.DDOSCooldownUntil = cooldown.Format(time.RFC3339)
		snap.DDOSActive = time.Now().Before(cooldown)
	}

	// Defense CPU/memory: the security middleware's resource footprint is
	// the panel's own goroutine set + heap. We don't track a separate
	// "protection service" process here; report the panel host telemetry
	// instead so the Security page mirrors the System dashboard's numbers
	// without a second telemetry pipeline. Left at zero on this layer;
	// filled by the handler from sysinfo.
	return snap, nil
}

// topN runs a (label, count) group-and-count query, returning a slice ready
// for JSON. Errors are swallowed (logged by the caller) because a single
// failure should not blow the whole Security snapshot — the dashboard shows
// zeros/empty for the affected widget instead.
func (r *SecurityRepository) topN(q, cutoff string) ([]models.SecurityTopEntry, error) {
	rows, err := r.db.Query(q, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.SecurityTopEntry, 0, 8)
	for rows.Next() {
		var e models.SecurityTopEntry
		if err := rows.Scan(&e.Label, &e.Count); err != nil {
			return out, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// PurgeBefore deletes security_requests rows older than the supplied age so
// the table doesn't grow without bound. Called by a periodic background
// sweep so a long-running panel under sustained traffic stays responsive.
// Returns the number of rows deleted.
func (r *SecurityRepository) PurgeBefore(age time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-age).Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`DELETE FROM security_requests WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// securityLoginPaths is the canonical set of paths the security middleware
// treats as "login attempts" so the Failed Login Attempts widget can be
// derived cheaply (path IN (...) AND status IN (401,403)). Kept here so the
// middleware + repo share one source of truth.
var securityLoginPaths = []string{"/api/auth/login", "/api/auth/switch-login"}

// IsLoginPath reports whether a request path should count as a login
// attempt for the security telemetry. Exposed so the middleware can stamp
// the is_login flag at write-time without re-deriving the set.
func IsLoginPath(p string) bool {
	stripped := strings.TrimRight(p, "/")
	for _, lp := range securityLoginPaths {
		if stripped == lp {
			return true
		}
	}
	return false
}
