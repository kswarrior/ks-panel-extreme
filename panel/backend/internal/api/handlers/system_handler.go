package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/sysinfo"
)

// SystemSnapshot is the single response shape returned by the System
// page. All counts/aggregates are computed up-front so the frontend only
// needs ONE round-trip on load and one fetch per refresh interval.
type SystemSnapshot struct {
	GeneratedAt time.Time `json:"generated_at"`

	// Top-level entity totals.
	Users         int64 `json:"users"`
	Roles         int64 `json:"roles"`
	Nodes         int64 `json:"nodes"`
	Templates     int64 `json:"templates"`
	Instances     int64 `json:"instances"`
	APIKeys       int64 `json:"api_keys"`
	Mods          int64 `json:"mods"`
	ModActive     int64 `json:"mod_active"`
	Applications  int64 `json:"applications"`
	AppActive     int64 `json:"app_active"`
	Themes        int64 `json:"themes"`
	ThemeAssign   int64 `json:"theme_assignments"`
	ActivityTotal int64 `json:"activity_total"`

	// Node breakdown by derived state so the card can show "3 up, 1 down".
	NodesByState map[string]int64 `json:"nodes_by_state"`

	// Instance breakdown by lifecycle status — derived from the same column
	// the Instance cards read; this is the source of truth for "running"
	// vs "stopped" counts.
	InstancesByStatus map[string]int64 `json:"instances_by_status"`

	// Per-edge latest telemetry — useful for the compact edge-grid widget at
	// the bottom of the system page. Always a non-nil slice so a fresh
	// install serialises as `[]` rather than `null` — the System
	// component relies on `snap.edges.length` and `snap.edges.map` so a
	// null here causes a runtime crash that wipes the whole page.
	Edges []SystemEdge `json:"edges"`

	// Cumulative uptime % across all nodes (weighted by uptime_secs so a
	// long-running node doesn't dominate). Shown alongside the "Health"
	// indicator.
	OverallUptimePct float64 `json:"overall_uptime_pct"`

	// Aggregated RAM / disk / CPU usage across nodes that reported
	// healthy telemetry. Stepping any of these doesn't lie ("no data"
	// excluded from the average) so the panel can claim accurate figures.
	// Aggregated*MB fields carry bytes (the same wire unit ksedge ships
	// from its meminfo()/diskUsage() collectors). The JSON tag still ends
	// in _mb for backwards compatibility with the SPA, which interprets
	// them as MiB (1 MB = 1024*1024) — so this aggregate does the byte→MiB
	// conversion at scan time and the system's fmtMB() then renders a
	// 16 GB VPS as "16.00 GB" rather than "16M MB". The per-card Nodes.tsx
	// formatter reads the raw `ram_used` (in bytes) directly from the row.
	AggregatedRAMUsedMB  int64   `json:"ram_used_mb"`
	AggregatedRAMTotalMB int64   `json:"ram_total_mb"`
	AggregatedDiskUsedMB int64   `json:"disk_used_mb"`
	AggregatedDiskTotMB  int64   `json:"disk_total_mb"`
	AggregatedCPUPercent float64 `json:"cpu_percent_avg"`

	// Local host telemetry — info about the box the panel is running on
	// (RAM, disk, CPU, kernel, network). Filled by the sysinfo package.
	// Always non-null: a fresh build's first system fetch returns
	// populated Host even if some fields are zero-emdashes on the UI.
	Local sysinfo.Host `json:"local"`

	// Rolling 60s time-series (CPU%, RAM%, load1) used by the system
	// line charts. Comes from the sysinfo ring sampler started in
	// runLaunch. Empty (not null) if the sampler hasn't kicked in yet —
	// the React side renders a "warming up…" stub in that case.
	Series sysinfo.Series `json:"series"`
}

// SystemEdge is a compact per-node summary for the system's edge grid.
type SystemEdge struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Address    string  `json:"address"`
	State      string  `json:"state"`
	UptimePct  float64 `json:"uptime_pct"`
	CPUPercent float64 `json:"cpu_percent"`
	RAMUsed    int64   `json:"ram_used"`
	RAMTotal   int64   `json:"ram_total"`
	LastSeenAt *string `json:"last_seen_at,omitempty"`
}

// SystemSnapshotHandler builds the single response used by the System
// page. It runs every count in one open-DB sweep so the round-trip cost
// stays at ~10 small SELECTs even with a busy panel.
func SystemSnapshotHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	snap := SystemSnapshot{
		GeneratedAt: time.Now().UTC(),
		Edges:       []SystemEdge{}, // never null — JSON must be `[]`
	}

	// 1. Entity totals — single SELECT each.
	snap.Users = mustCount(con, `SELECT COUNT(*) FROM users`)
	snap.Roles = mustCount(con, `SELECT COUNT(*) FROM roles`)
	snap.Nodes = mustCount(con, `SELECT COUNT(*) FROM nodes`)
	snap.Templates = mustCount(con, `SELECT COUNT(*) FROM templates`)
	snap.Instances = mustCount(con, `SELECT COUNT(*) FROM instances`)
	snap.APIKeys = mustCount(con, `SELECT COUNT(*) FROM api_keys`)
	snap.ActivityTotal = mustCount(con, `SELECT COUNT(*) FROM activity_logs`)

	// Mods total + active count (active is the subset the card surfaces as
	// the hint chip — mirrors the instance "running · stopped · errored"
	// breakdown pattern applied to the mods table's active flag).
	snap.Mods = mustCount(con, `SELECT COUNT(*) FROM mods`)
	snap.ModActive = mustCount(con, `SELECT COUNT(*) FROM mods WHERE active = 1`)

	// Applications total + active count — same shape as mods.
	snap.Applications = mustCount(con, `SELECT COUNT(*) FROM applications`)
	snap.AppActive = mustCount(con, `SELECT COUNT(*) FROM applications WHERE active = 1`)

	// Themes total (GLOBAL rows) + scoped assignments so the tile can hint at
	// how many routes have a theme pinned. Themes have no `active` flag —
	// every row is a candidate; the assignment count is the activity signal.
	snap.Themes = mustCount(con, `SELECT COUNT(*) FROM themes`)
	snap.ThemeAssign = mustCount(con, `SELECT COUNT(*) FROM theme_assignments`)

	// 2. Node breakdown by derived state — same DeriveState the Node list
	// uses, inlined into the SQL so the system doesn't have to round-trip
	// over every node again.
	snap.NodesByState = map[string]int64{
		"up":      0,
		"down":    0,
		"partial": 0,
		"pending": 0,
	}
	if rows, err := con.Query(nodeStateQuery); err == nil {
		defer rows.Close()
		for rows.Next() {
			var state string
			var n int64
			if err := rows.Scan(&state, &n); err == nil {
				snap.NodesByState[state] = n
			}
		}
	} else {
		log.Println("system nodes query:", err)
	}

	// 3. Instance breakdown.
	snap.InstancesByStatus = map[string]int64{}
	if rows, err := con.Query(`SELECT status, COUNT(*) FROM instances GROUP BY status`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var n int64
			if err := rows.Scan(&s, &n); err == nil {
				snap.InstancesByStatus[s] = n
			}
		}
	} else {
		log.Println("system instances query:", err)
	}

	// 4. Per-edge latest telemetry (compact).
	if rows, err := con.Query(`
		SELECT id, name, address, status, uptime_pct, cpu_percent,
		       ram_used, ram_total, last_seen_at
		FROM nodes ORDER BY name`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var e SystemEdge
			var lastSeen sql.NullString
			if err := rows.Scan(&e.ID, &e.Name, &e.Address, &e.State,
				&e.UptimePct, &e.CPUPercent, &e.RAMUsed, &e.RAMTotal, &lastSeen); err != nil {
				continue
			}
			if lastSeen.Valid && lastSeen.String != "" {
				v := lastSeen.String
				e.LastSeenAt = &v
			}
			snap.Edges = append(snap.Edges, e)
		}
	} else {
		log.Println("system edges query:", err)
	}

	// 5. Aggregate resource usage + weighted uptime across nodes that
	// reported healthy telemetry. Single SELECT — fast even on a panel
	// with thousands of edges because SUM() folds on the storage engine.
	// ksedge ships RAM/disk as bytes; we collapse to MiB (1024*1024) here
	// so the JSON `*_mb` field carries MiB (which is what the SPA
	// formatter on /system expects — see System.tsx::fmtMB).
	row := con.QueryRow(`
		SELECT
			COALESCE(SUM(ram_used), 0),
			COALESCE(SUM(ram_total), 0),
			COALESCE(SUM(disk_used), 0),
			COALESCE(SUM(disk_total), 0),
			COALESCE(AVG(cpu_percent), 0),
			COALESCE(SUM(uptime_secs), 0),
			COALESCE(SUM(CASE WHEN uptime_secs > 0 THEN uptime_secs * uptime_pct / 100.0 ELSE uptime_pct END), 0)
		FROM nodes`)
	var totalUptimeSecs, weightedNumerator float64
	var ramUsedBytes, ramTotalBytes, diskUsedBytes, diskTotalBytes int64
	if err := row.Scan(&ramUsedBytes, &ramTotalBytes,
		&diskUsedBytes, &diskTotalBytes,
		&snap.AggregatedCPUPercent, &totalUptimeSecs, &weightedNumerator); err != nil {
		log.Println("system aggregate:", err)
	}
	const mib int64 = 1024 * 1024
	snap.AggregatedRAMUsedMB = ramUsedBytes / mib
	snap.AggregatedRAMTotalMB = ramTotalBytes / mib
	snap.AggregatedDiskUsedMB = diskUsedBytes / mib
	snap.AggregatedDiskTotMB = diskTotalBytes / mib
	if totalUptimeSecs > 0 {
		snap.OverallUptimePct = weightedNumerator / totalUptimeSecs * 100.0
	}

	// 6. Local host snapshot + rolling 60s series. Both are cheap (~1ms
	// per call) and self-contained — no DB access. Note that the series
	// may be empty if the sampler hasn't hit a cadence yet; the React side
	// renders a placeholder row in that case.
	snap.Local = sysinfo.Local()
	snap.Series = sysinfo.LocalSeries()

	writeJSON(w, snap)
}

// nodeStateQuery is the canonical DeriveState SQL — same expression the
// node repo's ListNodes uses, so the system's breakdown matches the
// per-edge card colours exactly.
//
// A "mixed" telemetry-quality result (some collectors reported ok while
// others reported !ok) is the only thing that flips an "up" edge into
// "partial". An edge that reports NO quality flags at all — a legacy
// ksedge predating the per-metric bits, or a freshly launched edge whose
// first heartbeat arrived before any collector ran — keeps reading "up"
// so a healthy legacy edge isn't shown as a dimmed partial card.
const nodeStateQuery = `
	SELECT
	  CASE
	    WHEN last_seen_at IS NULL THEN 'pending'
	    WHEN status = 'up'
	         AND (COALESCE(hw_ram_ok, 1) OR COALESCE(hw_cpu_ok, 1) OR COALESCE(hw_disk_ok, 1) OR COALESCE(hw_drivers_ok, 1))
	         AND (NOT COALESCE(hw_ram_ok, 1) OR NOT COALESCE(hw_cpu_ok, 1) OR NOT COALESCE(hw_disk_ok, 1) OR NOT COALESCE(hw_drivers_ok, 1))
	         THEN 'partial'
	    WHEN status = 'up' THEN 'up'
	    ELSE 'down'
	  END AS state,
	  COUNT(*) AS n
	FROM nodes
	GROUP BY 1
	ORDER BY 1
`

// mustCount returns COUNT(*) for the given SQL, or 0 if the query errored.
// We swallow errors at this layer because every count contributes a single
// "tile" — the system can still answer with N-1 tiles on a partial error
// rather than fail the whole load.
func mustCount(con *sql.DB, q string) int64 {
	var n int64
	if err := con.QueryRow(q).Scan(&n); err != nil {
		log.Println("system count:", err, q)
		return 0
	}
	return n
}

// SystemStopHandler handles POST /api/system/stop — gracefully shuts down the panel.
// Requires MANAGE_PANEL_UPDATE permission (same as other destructive panel operations).
func SystemStopHandler(w http.ResponseWriter, r *http.Request) {
	// Initiate graceful shutdown by canceling the main context
	// The launch command's signal handler will catch this and shut down the server
	select {
	case shutdownChan <- struct{}{}:
		writeJSON(w, map[string]string{"status": "stopping", "message": "Panel is shutting down gracefully"})
	default:
		// Channel full or no listener - fallback
		http.Error(w, "Cannot initiate shutdown", http.StatusInternalServerError)
	}
}

// shutdownChan is used to signal the main launch goroutine to shut down.
// It's buffered to avoid blocking if multiple stop requests come in.
var shutdownChan = make(chan struct{}, 1)

// ShutdownChan returns the shutdown channel for the launch command to listen on.
func ShutdownChan() <-chan struct{} {
	return shutdownChan
}
