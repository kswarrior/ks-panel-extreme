package repository

import (
	"database/sql"
	"strings"
	"time"

	"github.com/example/kspanel/internal/db"
)

// Panel auto-update-check state (settings KV singleton, no migration needed).
// Stored as plain TEXT rows in the existing settings table so the state
// survives restarts on all three engines without a new migration.
//
// The panel always re-fetches version.json in the background every five
// minutes (handlers.PanelAutoCheckTick, driven once a minute from
// cli/launch.go) — it is a cheap manifest read, so there is no toggle or
// operator-tuned interval. Only the last result is persisted here.
const (
	PanelUpdateAutoLastCheckKey    = "panel_update_auto_last_check_at"
	PanelUpdateAutoLastRemoteKey   = "panel_update_auto_last_remote"
	PanelUpdateAutoLastAvailKey    = "panel_update_auto_last_available"
	PanelUpdateAutoLastErrorKey    = "panel_update_auto_last_error"
	PanelUpdateAutoLastLocalKey    = "panel_update_auto_last_local"
	PanelUpdateAutoTimeLayout      = time.RFC3339
	DefaultPanelUpdateAutoInterval = 5 // minutes — always-on manifest recheck
)

// PanelUpdateAutoState is the persisted auto-check status.
type PanelUpdateAutoState struct {
	LastCheckAt   *time.Time
	LastRemote    string
	LastAvailable *bool
	LastError     string
	LastLocal     string
}

// GetPanelUpdateAutoState loads the persisted auto-check status. Never fails
// the caller on corrupt values — they degrade to "never checked" so the API
// renders defaults instead of 500ing.
func GetPanelUpdateAutoState(con *sql.DB, d db.Dialect) PanelUpdateAutoState {
	st := PanelUpdateAutoState{}
	if con == nil {
		return st
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
	return st
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
