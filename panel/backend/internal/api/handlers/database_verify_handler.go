package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/cron"
	"github.com/example/kspanel/internal/datamove"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// DatabaseVerifyResult is the JSON shape for GET /api/database/verify
// (run now) and the verify_* fields on DatabaseInfo. Issues fail the run
// (ok=false); warnings are informational (e.g. "no portable integrity
// pragma on this engine").
type DatabaseVerifyResult struct {
	OK         bool     `json:"ok"`
	Engine     string   `json:"engine"`
	CheckedAt  string   `json:"checked_at"`
	TableCount int      `json:"table_count"`
	DurationMs int64    `json:"duration_ms"`
	Issues     []string `json:"issues"`
	Warnings   []string `json:"warnings"`
	Cron       string   `json:"cron"`
	NextRunAt  string   `json:"next_run_at,omitempty"`
}

// RunDatabaseCheck runs the engine-appropriate integrity probe with no side
// effects (no persistence, no audit, no notifications). Callers persist +
// fan out separately so the HTTP handler and the scheduler sweep share one
// check implementation:
//
//   - SQLite: PRAGMA quick_check + foreign_key_check (phantom-row safe,
//     same as DatabaseInfoHandler) + generic FK-orphan scan (PRAGMA
//     foreign_key_list + NOT EXISTS) + table-count sanity.
//   - Postgres/MySQL: connection probe (Ping + SELECT 1) + per-table
//     COUNT(*) sanity via information_schema + real FK-orphan scan via
//     information_schema (PG: table_constraints+key_column_usage, MySQL:
//     KEY_COLUMN_USAGE). Orphans are issues; scan failures degrade to
//     warnings.
func RunDatabaseCheck() DatabaseVerifyResult {
	started := time.Now()
	cfg := config.DatabaseConfig()
	d, err := db.NewDialect(cfg.Engine)
	if err != nil {
		return DatabaseVerifyResult{
			OK: false, Engine: cfg.Engine,
			CheckedAt: started.UTC().Format(time.RFC3339),
			Issues:    []string{"unknown database engine: " + err.Error()},
			Warnings:  []string{},
		}
	}
	con, err := repository.OpenDB()
	if err != nil {
		return DatabaseVerifyResult{
			OK: false, Engine: d.Name(),
			CheckedAt: started.UTC().Format(time.RFC3339),
			Issues:    []string{"connection probe failed: " + err.Error()},
			Warnings:  []string{},
		}
	}
	defer con.Close()
	var issues, warnings []string
	tableCount := 0
	switch {
	case d.IsSQLite():
		issues, warnings, tableCount = checkSQLite(con)
		// Generic orphan scan as second opinion behind foreign_key_check.
		if oi, ow, _, oerr := datamove.ScanFKOrphans(d, con); oerr == nil {
			have := map[string]bool{}
			for _, is := range issues {
				have[is] = true
			}
			for _, s := range oi {
				if !have[s] {
					issues = append(issues, s)
				}
			}
			warnings = append(warnings, ow...)
		} else {
			warnings = append(warnings, "orphan scan unavailable: "+oerr.Error())
		}
	case d.Name() == "postgres":
		issues, warnings, tableCount = checkPostgresCounts(con)
		if oi, ow, checked, oerr := datamove.ScanFKOrphans(d, con); oerr == nil {
			issues = append(issues, oi...)
			warnings = append(warnings, ow...)
			if len(oi) == 0 && len(ow) == 0 {
				warnings = append(warnings, fmt.Sprintf("postgres orphan scan clean (%d FK constraint(s) checked) + row-count parity", checked))
			}
		} else {
			warnings = append(warnings, "postgres orphan scan unavailable ("+oerr.Error()+") — verification covered connection probe + row-count parity only")
		}
	case d.Name() == "mysql":
		issues, warnings, tableCount = checkMySQLCounts(con)
		if oi, ow, checked, oerr := datamove.ScanFKOrphans(d, con); oerr == nil {
			issues = append(issues, oi...)
			warnings = append(warnings, ow...)
			if len(oi) == 0 && len(ow) == 0 {
				warnings = append(warnings, fmt.Sprintf("mysql orphan scan clean (%d FK constraint(s) checked) + row-count parity", checked))
			}
		} else {
			warnings = append(warnings, "mysql orphan scan unavailable ("+oerr.Error()+") — verification covered connection probe + row-count parity only")
		}
	default:
		issues = append(issues, "unsupported engine "+d.Name())
	}
	if issues == nil {
		issues = []string{}
	}
	if warnings == nil {
		warnings = []string{}
	}
	return DatabaseVerifyResult{
		OK:         len(issues) == 0,
		Engine:     d.Name(),
		CheckedAt:  time.Now().UTC().Format(time.RFC3339),
		TableCount: tableCount,
		DurationMs: time.Since(started).Milliseconds(),
		Issues:     issues,
		Warnings:   warnings,
	}
}

func checkSQLite(con *sql.DB) (issues, warnings []string, tableCount int) {
	// quick_check is O(pages) but cheap vs full integrity_check.
	if rows, err := con.Query(`PRAGMA quick_check`); err == nil {
		for rows.Next() {
			var msg string
			if serr := rows.Scan(&msg); serr == nil && strings.TrimSpace(strings.ToLower(msg)) != "ok" {
				issues = append(issues, "integrity: "+msg)
			}
		}
		if rerr := rows.Err(); rerr != nil {
			issues = append(issues, "integrity check read failed: "+rerr.Error())
		}
		rows.Close()
	} else {
		if v := scalar(con, `PRAGMA integrity_check(1)`); v != "" && strings.ToLower(v) != "ok" {
			issues = append(issues, "integrity: "+v)
		}
	}
	if rows, err := con.Query(`PRAGMA foreign_key_check`); err == nil {
		for rows.Next() {
			var tbl sql.NullString
			var rowid sql.NullInt64
			var ref sql.NullString
			var fkid sql.NullInt64
			if serr := rows.Scan(&tbl, &rowid, &ref, &fkid); serr != nil {
				continue
			}
			if !tbl.Valid || strings.TrimSpace(tbl.String) == "" {
				continue
			}
			issues = append(issues, fmt.Sprintf("foreign key violation: %s row %d", tbl.String, rowid.Int64))
		}
		if rerr := rows.Err(); rerr != nil {
			issues = append(issues, "foreign key check read failed: "+rerr.Error())
		}
		rows.Close()
	}
	// Table-count sanity: at least one user table must exist and be countable.
	var names []string
	if rows, err := con.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`); err == nil {
		for rows.Next() {
			var n string
			if serr := rows.Scan(&n); serr == nil {
				names = append(names, n)
			}
		}
		if rerr := rows.Err(); rerr != nil {
			issues = append(issues, "table listing read failed: "+rerr.Error())
			rows.Close()
			return issues, warnings, 0
		}
		rows.Close()
	} else {
		issues = append(issues, "table listing failed: "+err.Error())
		return issues, warnings, 0
	}
	if len(names) == 0 {
		issues = append(issues, "no user tables found")
		return issues, warnings, 0
	}
	for _, n := range names {
		nIdent := strings.ReplaceAll(n, `"`, `""`)
		var cnt int64
		if err := con.QueryRow(`SELECT COUNT(*) FROM "` + nIdent + `"`).Scan(&cnt); err != nil {
			issues = append(issues, fmt.Sprintf("count %s failed: %v", n, err))
		}
	}
	return issues, warnings, len(names)
}

func checkPostgresCounts(con *sql.DB) (issues, warnings []string, tableCount int) {
	if err := con.Ping(); err != nil {
		return []string{"connection probe failed: " + err.Error()}, warnings, 0
	}
	var one int
	if err := con.QueryRow(`SELECT 1`).Scan(&one); err != nil {
		return []string{"probe SELECT 1 failed: " + err.Error()}, warnings, 0
	}
	rows, err := con.Query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`)
	if err != nil {
		return []string{"table listing failed: " + err.Error()}, warnings, 0
	}
	names := []string{}
	for rows.Next() {
		var n string
		if serr := rows.Scan(&n); serr == nil {
			names = append(names, n)
		}
	}
	rows.Close()
	if rerr := rows.Err(); rerr != nil {
		return []string{"table listing failed: " + rerr.Error()}, warnings, 0
	}
	if len(names) == 0 {
		return []string{"no user tables found in schema public"}, warnings, 0
	}
	for _, n := range names {
		nIdent := strings.ReplaceAll(n, `"`, `""`)
		var cnt int64
		if err := con.QueryRow(`SELECT COUNT(*) FROM "` + nIdent + `"`).Scan(&cnt); err != nil {
			issues = append(issues, fmt.Sprintf("count %s failed: %v", n, err))
		}
	}
	return issues, warnings, len(names)
}

func checkMySQLCounts(con *sql.DB) (issues, warnings []string, tableCount int) {
	if err := con.Ping(); err != nil {
		return []string{"connection probe failed: " + err.Error()}, warnings, 0
	}
	var one int
	if err := con.QueryRow(`SELECT 1`).Scan(&one); err != nil {
		return []string{"probe SELECT 1 failed: " + err.Error()}, warnings, 0
	}
	rows, err := con.Query(`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`)
	if err != nil {
		return []string{"table listing failed: " + err.Error()}, warnings, 0
	}
	names := []string{}
	for rows.Next() {
		var n string
		if serr := rows.Scan(&n); serr == nil {
			names = append(names, n)
		}
	}
	rows.Close()
	if rerr := rows.Err(); rerr != nil {
		return []string{"table listing failed: " + rerr.Error()}, warnings, 0
	}
	if len(names) == 0 {
		return []string{"no user tables found"}, warnings, 0
	}
	for _, n := range names {
		nIdent := strings.ReplaceAll(n, "`", "``")
		var cnt int64
		if err := con.QueryRow("SELECT COUNT(*) FROM `" + nIdent + "`").Scan(&cnt); err != nil {
			issues = append(issues, fmt.Sprintf("count %s failed: %v", n, err))
		}
	}
	return issues, warnings, len(names)
}

// persistVerifyResult stores the check outcome + recomputed next-run in the
// verify-state KV. Never fails the HTTP path — persistence errors are
// logged, not returned, so a settings-table blip can't turn a healthy
// verify into a 500.
func persistVerifyResult(res DatabaseVerifyResult, cronExpr string) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("database verify: open db for persist:", err)
		return
	}
	defer con.Close()
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		return
	}
	cronExpr = strings.TrimSpace(cronExpr)
	if cronExpr == "" {
		// Preserve the stored cron when the caller didn't supply one.
		st := repository.GetDatabaseVerifyState(con, d)
		cronExpr = st.Cron
		if strings.TrimSpace(cronExpr) == "" {
			cronExpr = repository.DefaultDBVerifyCron
		}
	}
	next := nextVerifyRun(cronExpr, time.Now())
	checkedAt, _ := time.Parse(time.RFC3339, res.CheckedAt)
	if checkedAt.IsZero() {
		checkedAt = time.Now().UTC()
	}
	ok := res.OK
	st := repository.DatabaseVerifyState{
		CheckedAt:  &checkedAt,
		Ok:         &ok,
		Issues:     res.Issues,
		Warnings:   res.Warnings,
		Engine:     res.Engine,
		TableCount: int64(res.TableCount),
		DurationMs: res.DurationMs,
		Cron:       cronExpr,
		NextRun:    &next,
	}
	if next.IsZero() {
		st.NextRun = nil
	}
	if err := repository.SetDatabaseVerifyState(con, d, st); err != nil {
		log.Println("database verify: persist failed:", err)
	}
}

func nextVerifyRun(cronExpr string, from time.Time) time.Time {
	cronExpr = strings.TrimSpace(cronExpr)
	if cronExpr == "" {
		cronExpr = repository.DefaultDBVerifyCron
	}
	s, err := cron.Parse(cronExpr)
	if err != nil {
		return from.Add(24 * time.Hour)
	}
	n := s.Next(from)
	if n.IsZero() {
		return from.Add(24 * time.Hour)
	}
	return n
}

// adminIDsForVerify lists ACCESS_ADMIN_PANEL holders for breach fan-out.
// Mirrors the ticket sweep's staff lookup without importing scheduler.
func adminIDsForVerify(con *sql.DB) []int64 {
	rows, err := con.Query(
		`SELECT DISTINCT u.id FROM users u
		 JOIN role_permissions rp ON rp.role_id = u.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 WHERE p.key = 'ACCESS_ADMIN_PANEL'`,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			out = append(out, id)
		}
	}
	return out
}

// notifyVerifyFailure fans out to every admin on a failed run: WS push +
// email per prefs via EmitNotification (NotifyHub). Best-effort, never
// fails the caller.
func notifyVerifyFailure(res DatabaseVerifyResult) {
	con, err := repository.OpenDB()
	if err != nil {
		return
	}
	defer con.Close()
	ids := adminIDsForVerify(con)
	if len(ids) == 0 {
		return
	}
	title := fmt.Sprintf("Database verification failed (%s)", res.Engine)
	msg := "Issues: " + strings.Join(res.Issues, "; ")
	if len(msg) > 2000 {
		msg = msg[:2000] + "…"
	}
	for _, uid := range ids {
		EmitNotification(uid, nil, "system", models.NotificationCategorySystem,
			models.NotificationPriorityHigh, title, msg, "/database", "Open database", "")
	}
}

// recordVerifyActivity writes the audit row for a failed run from the HTTP
// path (has *http.Request for actor/IP). The scheduler path writes
// directly via ActivityRepository (no request in scope).
func recordVerifyActivity(r *http.Request, res DatabaseVerifyResult) {
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "database_verify_failed",
		TargetLabel: res.Engine,
		Message:     fmt.Sprintf("database verification failed on %s: %s", res.Engine, strings.Join(res.Issues, "; ")),
	})
}

// DatabaseVerifyHandler runs verification now (GET) and returns the result.
// Persisted as the new last-verify status; failures also write activity_logs
// + notify every ACCESS_ADMIN_PANEL holder. Gated by ACCESS_ADMIN_PANEL in
// server.go; mutations are audit-logged.
func DatabaseVerifyHandler(w http.ResponseWriter, r *http.Request) {
	res := RunDatabaseCheck()
	// Attach the configured cron + computed next-run for the response.
	con, err := repository.OpenDB()
	cronExpr := repository.DefaultDBVerifyCron
	if err == nil {
		cfg := config.DatabaseConfig()
		if d, derr := db.NewDialect(cfg.Engine); derr == nil {
			st := repository.GetDatabaseVerifyState(con, d)
			if strings.TrimSpace(st.Cron) != "" {
				cronExpr = strings.TrimSpace(st.Cron)
			}
		}
		con.Close()
	}
	res.Cron = cronExpr
	if n := nextVerifyRun(cronExpr, time.Now()); !n.IsZero() {
		res.NextRunAt = n.UTC().Format(time.RFC3339)
	}
	persistVerifyResult(res, cronExpr)
	if !res.OK {
		recordVerifyActivity(r, res)
		notifyVerifyFailure(res)
	}
	writeJSON(w, res)
}

// DatabaseVerifyConfigHandler returns the verify schedule + last status
// without running a check (cheap status read for the Database page).
func DatabaseVerifyConfigHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	st := repository.GetDatabaseVerifyState(con, d)
	out := map[string]any{
		"cron":             st.Cron,
		"next_run_at":      nil,
		"last_at":          nil,
		"last_ok":          nil,
		"last_issues":      st.Issues,
		"last_warnings":    st.Warnings,
		"last_engine":      st.Engine,
		"last_table_count": st.TableCount,
		"last_duration_ms": st.DurationMs,
	}
	if out["last_issues"] == nil {
		out["last_issues"] = []string{}
	}
	if out["last_warnings"] == nil {
		out["last_warnings"] = []string{}
	}
	if st.Cron == "" {
		out["cron"] = repository.DefaultDBVerifyCron
	}
	if st.NextRun != nil {
		out["next_run_at"] = st.NextRun.UTC().Format(time.RFC3339)
	}
	if st.CheckedAt != nil {
		out["last_at"] = st.CheckedAt.UTC().Format(time.RFC3339)
	}
	if st.Ok != nil {
		out["last_ok"] = *st.Ok
	}
	writeJSON(w, out)
}

// UpdateDatabaseVerifyConfigHandler sets the verify cron (5-field).
// Validated via cron.Parse; recomputes next_run; audit-logged.
func UpdateDatabaseVerifyConfigHandler(w http.ResponseWriter, r *http.Request) {
	var dto struct {
		Cron string `json:"cron"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	dto.Cron = strings.TrimSpace(dto.Cron)
	if dto.Cron == "" {
		http.Error(w, "cron is required (5-field, e.g. \"0 3 * * *\")", http.StatusBadRequest)
		return
	}
	sched, err := cron.Parse(dto.Cron)
	if err != nil {
		http.Error(w, "invalid cron: "+err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	next := sched.Next(time.Now())
	if err := repository.SetDatabaseVerifyCron(con, d, dto.Cron, next); err != nil {
		log.Println("database verify config save failed:", err)
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "database_verify_config",
		TargetLabel: dto.Cron,
		Message:     fmt.Sprintf("updated database verify schedule to %q by user %d", dto.Cron, uid),
	})
	writeJSON(w, map[string]any{"ok": true, "cron": dto.Cron, "next_run_at": next.UTC().Format(time.RFC3339)})
}
