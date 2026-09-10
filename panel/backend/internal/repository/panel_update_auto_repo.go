package repository

import (
	"database/sql"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/db"
)

// Panel auto-update-check state (settings KV singleton, no migration needed).
// Stored as plain TEXT rows in the existing settings table so the state
// survives restarts on all three engines without a new migration.
//
// When enabled, the panel's background ticker (see handlers.PanelAutoCheckTick,
// driven once a minute from cli/launch.go) re-fetches version.json every
// interval — even if nobody opens the System page — and persists the result
// here. The Panel tab reads this state to render "last checked … / next
// check in …" without forcing a live network fetch on every page load.
const (
	PanelUpdateAutoEnabledKey      = "panel_update_auto_enabled"
	PanelUpdateAutoIntervalKey     = "panel_update_auto_interval_min"
	PanelUpdateAutoLastCheckKey    = "panel_update_auto_last_check_at"
	PanelUpdateAutoLastRemoteKey   = "panel_update_auto_last_remote"
	PanelUpdateAutoLastAvailKey    = "panel_update_auto_last_available"
	PanelUpdateAutoLastErrorKey    = "panel_update_auto_last_error"
	PanelUpdateAutoLastLocalKey    = "panel_update_auto_last_local"
	PanelUpdateAutoTimeLayout      = time.RFC3339
	DefaultPanelUpdateAutoInterval = 360 // minutes (6h) — gentle on the 60/hr unauth GitHub API budget
	MinPanelUpdateAutoInterval     = 5   // minutes — below this we would burn the rate limit + spam logs
	MaxPanelUpdateAutoInterval     = 43200 // minutes (30d)
)

// PanelUpdateAutoState is the persisted auto-check config + last result.
type PanelUpdateAutoState struct {
	Enabled       bool
	IntervalMin   int
	LastCheckAt   *time.Time
	LastRemote    string
	LastAvailable *bool
	LastError     string
	LastLocal     string
	NextCheckAt   *time.Time
}

// GetPanelUpdateAutoState loads the persisted auto-check state. Never fails
// the caller on corrupt values — they degrade to safe defaults so the Panel
// tab renders "never checked" instead of 500ing.
func GetPanelUpdateAutoState(con *sql.DB, d db.Dialect) PanelUpdateAutoState {
	st := PanelUpdateAutoState{
		Enabled:     false,
		IntervalMin: DefaultPanelUpdateAutoInterval,
	}
	if con == nil {
		return st
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoEnabledKey); err == nil {
		t := strings.ToLower(strings.TrimSpace(v))
		st.Enabled = t == "1" || t == "true" || t == "yes" || t == "on"
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoIntervalKey); err == nil && strings.TrimSpace(v) != "" {
		if n, perr := strconv.Atoi(strings.TrimSpace(v)); perr == nil {
			st.IntervalMin = ClampPanelUpdateAutoInterval(n)
		}
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoLastCheckKey); err == nil && strings.TrimSpace(v) != "" {
		if t, perr := time.Parse(PanelUpdateAutoTimeLayout, strings.TrimSpace(v)); perr == nil {
			utc := t.UTC()
			st.LastCheckAt = &utc
		}
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoLastRemoteKey); err == nil {
		st.LastRemote = strings.TrimSpace(v)
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoLastAvailKey); err == nil && strings.TrimSpace(v) != "" {
		t := strings.TrimSpace(v)
		b := t == "1" || strings.EqualFold(t, "true")
		st.LastAvailable = &b
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoLastErrorKey); err == nil {
		st.LastError = strings.TrimSpace(v)
	}
	if v, err := settingsGet(con, d, PanelUpdateAutoLastLocalKey); err == nil {
		st.LastLocal = strings.TrimSpace(v)
	}
	if st.LastCheckAt != nil && st.Enabled && st.IntervalMin > 0 {
		nxt := st.LastCheckAt.Add(time.Duration(st.IntervalMin) * time.Minute)
		st.NextCheckAt = &nxt
	}
	return st
}

// ClampPanelUpdateAutoInterval forces n into [Min,Max], falling back to the
// default when n <= 0 (missing/never-configured).
func ClampPanelUpdateAutoInterval(n int) int {
	if n <= 0 {
		return DefaultPanelUpdateAutoInterval
	}
	if n < MinPanelUpdateAutoInterval {
		return MinPanelUpdateAutoInterval
	}
	if n > MaxPanelUpdateAutoInterval {
		return MaxPanelUpdateAutoInterval
	}
	return n
}

// SetPanelUpdateAutoConfig persists only the toggle + interval, preserving
// the last-check result.
func SetPanelUpdateAutoConfig(con *sql.DB, d db.Dialect, enabled bool, intervalMin int) error {
	intervalMin = ClampPanelUpdateAutoInterval(intervalMin)
	en := "0"
	if enabled {
		en = "1"
	}
	if err := settingsSet(con, d, PanelUpdateAutoEnabledKey, en); err != nil {
		return err
	}
	return settingsSet(con, d, PanelUpdateAutoIntervalKey, strconv.Itoa(intervalMin))
}

// SetPanelUpdateAutoResult persists one background (or manual) check result.
// available=nil means the check failed (see lastErr); the previous remote
// version is kept only when remote != "" so a failed tick doesn't blank the
// "last known remote" the Panel tab shows.
func SetPanelUpdateAutoResult(con *sql.DB, d db.Dialect, checkedAt time.Time, local, remote string, available *bool, lastErr string) error {
	utc := checkedAt.UTC().Format(PanelUpdateAutoTimeLayout)
	pairs := map[string]string{
		PanelUpdateAutoLastCheckKey: utc,
		PanelUpdateAutoLastErrorKey: strings.TrimSpace(lastErr),
		PanelUpdateAutoLastLocalKey: strings.TrimSpace(local),
	}
	if strings.TrimSpace(remote) != "" {
		pairs[PanelUpdateAutoLastRemoteKey] = strings.TrimSpace(remote)
	}
	if available != nil {
		if *available {
			pairs[PanelUpdateAutoLastAvailKey] = "1"
		} else {
			pairs[PanelUpdateAutoLastAvailKey] = "0"
		}
	} else {
		pairs[PanelUpdateAutoLastAvailKey] = ""
	}
	for k, v := range pairs {
		if err := settingsSet(con, d, k, v); err != nil {
			return err
		}
	}
	return nil
}
