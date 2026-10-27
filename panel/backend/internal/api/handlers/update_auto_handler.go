package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/version"
)

// ---- Panel auto-update checks (background recheck, no visit required) ----
// The panel always re-fetches version.json every five minutes because it is
// just a small manifest read. A once-a-minute ticker in cli/launch.go calls
// PanelAutoCheckTick(), which enforces the interval and persists the result
// in the settings KV — so the "update available" state stays fresh even if
// nobody opens the System page for weeks.
//
// Endpoint (MANAGE_PANEL_UPDATE at the route, like the manual verbs):
//   GET /api/system/update-auto – last result (cheap status read)

// panelUpdateAutoResponse is the GET /api/system/update-auto payload (and
// the `auto_*` block embedded in update-info so the Panel tab needs only one
// round-trip on load).
type panelUpdateAutoResponse struct {
	Enabled          bool    `json:"enabled"`
	IntervalMin      int     `json:"interval_min"`
	LastCheckAt      *string `json:"last_check_at,omitempty"`
	LastRemote       *string `json:"last_remote_version,omitempty"`
	LastAvailable    *bool   `json:"last_available,omitempty"`
	LastError        string  `json:"last_error,omitempty"`
	LastLocal        *string `json:"last_local_version,omitempty"`
	NextCheckAt      *string `json:"next_check_at,omitempty"`
}

func panelAutoStateResponse(st repository.PanelUpdateAutoState) panelUpdateAutoResponse {
	out := panelUpdateAutoResponse{
		Enabled:     st.Enabled,
		IntervalMin: st.IntervalMin,
	}
	if st.LastCheckAt != nil {
		s := st.LastCheckAt.UTC().Format(time.RFC3339)
		out.LastCheckAt = &s
	}
	if st.LastRemote != "" {
		s := st.LastRemote
		out.LastRemote = &s
	}
	if st.LastAvailable != nil {
		b := *st.LastAvailable
		out.LastAvailable = &b
	}
	if st.LastError != "" {
		out.LastError = st.LastError
	}
	if st.LastLocal != "" {
		s := st.LastLocal
		out.LastLocal = &s
	}
	if st.NextCheckAt != nil {
		s := st.NextCheckAt.UTC().Format(time.RFC3339)
		out.NextCheckAt = &s
	}
	return out
}

func openAutoDB() (con *sql.DB, d db.Dialect, err error) {
	con, err = repository.OpenDB()
	if err != nil {
		return nil, nil, err
	}
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		con.Close()
		return nil, nil, derr
	}
	return con, d, nil
}

// GetPanelUpdateAutoHandler returns the auto-check toggle + interval and the
// last background (or manual) check result. Pure read — safe to poll.
func GetPanelUpdateAutoHandler(w http.ResponseWriter, r *http.Request) {
	con, d, err := openAutoDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	st := repository.GetPanelUpdateAutoState(con, d)
	writeJSON(w, panelAutoStateResponse(st))
}

// recordPanelUpdateCheckResult persists one check outcome (manual or
// background) so the Panel tab's "last checked …" line stays truthful even
// when the check was triggered by the ticker instead of a page visit.
// Best-effort: never fails the caller — a settings-write error is logged.
func recordPanelUpdateCheckResult(local, remote string, available *bool, lastErr string) {
	con, err := repository.OpenDB()
	if err != nil {
		return
	}
	defer con.Close()
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		return
	}
	_ = repository.SetPanelUpdateAutoResult(con, d, time.Now().UTC(),
		strings.TrimSpace(local), strings.TrimSpace(remote), available, lastErr)
}

// PanelAutoCheckTick performs one background recheck when the fixed
// five-minute interval has elapsed since the last stored check. Called once
// a minute from the launch ticker; swallows all errors so the goroutine never
// dies. Returns true when a network check was attempted.
func PanelAutoCheckTick() bool {
	con, err := repository.OpenDB()
	if err != nil {
		return false
	}
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		con.Close()
		return false
	}
	st := repository.GetPanelUpdateAutoState(con, d)
	con.Close()
	if st.LastCheckAt != nil {
		if time.Since(*st.LastCheckAt) < time.Duration(repository.DefaultPanelUpdateAutoInterval)*time.Minute {
			return false
		}
	}
	local := version.Snapshot()
	manifest, ferr := fetchUpdateManifest()
	if ferr != nil {
		recordPanelUpdateCheckResult(local.Version, "", nil, ferr.Error())
		log.Printf("panel auto-update check failed: %v", ferr)
		return true
	}
	avail := semverGreater(manifest.Version, local.Version)
	availCopy := avail
	recordPanelUpdateCheckResult(local.Version, manifest.Version, &availCopy, "")
	if avail {
		log.Printf("panel auto-update check: v%s available (local v%s)", manifest.Version, local.Version)
	}
	return true
}
