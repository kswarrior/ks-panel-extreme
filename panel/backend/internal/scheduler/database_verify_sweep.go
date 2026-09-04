package scheduler

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/cron"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// sweepDatabaseVerify drives the scheduled integrity verification. It runs
// inside the minute tick (after automation + backups + tickets) and never
// fails the tick: every error is logged, never returned.
//
// Cadence is cron-based and configurable (settings KV db_verify_cron,
// default daily "0 3 * * *"). The check itself is
// handlers.RunDatabaseCheck: PRAGMA quick_check (SQLite) + connection probe
// + table-count sanity (all engines; PG/MySQL get a warning that no
// portable integrity pragma exists). On failure the sweep writes one
// activity_logs row + notifies every ACCESS_ADMIN_PANEL holder via
// handlers.EmitNotification (NotifyHub WS push + email per prefs), mirroring
// sweepTicketSLA's overdue → breach mark + notify pattern.
func sweepDatabaseVerify(ctx context.Context) {
	select {
	case <-ctx.Done():
		return
	default:
	}
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("database verify sweep: open db:", err)
		return
	}
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		con.Close()
		return
	}
	st := repository.GetDatabaseVerifyState(con, d)
	cronExpr := strings.TrimSpace(st.Cron)
	if cronExpr == "" {
		cronExpr = repository.DefaultDBVerifyCron
	}
	// Due when never verified, or next_run elapsed, or next_run missing
	// (legacy rows that pre-date the scheduler). Otherwise re-arm a missing
	// next_run without running so a clock-skewed row doesn't fire every tick.
	now := time.Now().UTC()
	if st.CheckedAt == nil {
		// Never verified — run now to populate the Database page status.
		con.Close()
		runAndRecordVerify(cronExpr)
		return
	}
	if st.NextRun == nil {
		next := nextVerifyFromCron(cronExpr, now)
		_ = repository.SetDatabaseVerifyCron(con, d, cronExpr, next)
		con.Close()
		return
	}
	if now.Before(*st.NextRun) {
		con.Close()
		return
	}
	con.Close()
	runAndRecordVerify(cronExpr)
}

func nextVerifyFromCron(cronExpr string, from time.Time) time.Time {
	s, err := cron.Parse(strings.TrimSpace(cronExpr))
	if err != nil {
		return from.Add(24 * time.Hour)
	}
	n := s.Next(from)
	if n.IsZero() {
		return from.Add(24 * time.Hour)
	}
	return n
}

// runAndRecordVerify executes one check, persists it as the new last-verify
// status, and on failure writes activity_logs + notifies admins. The HTTP
// handler (DatabaseVerifyHandler) does the same for manual runs; this is
// the scheduler's request-less equivalent.
func runAndRecordVerify(cronExpr string) {
	res := handlers.RunDatabaseCheck()
	now := time.Now().UTC()
	checkedAt, _ := time.Parse(time.RFC3339, res.CheckedAt)
	if checkedAt.IsZero() {
		checkedAt = now
	}
	ok := res.OK
	next := nextVerifyFromCron(cronExpr, now)
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("database verify sweep: open db for persist:", err)
		return
	}
	defer con.Close()
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		return
	}
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
	if serr := repository.SetDatabaseVerifyState(con, d, st); serr != nil {
		log.Println("database verify sweep: persist failed:", serr)
	}
	if res.OK {
		return
	}
	// Failure: audit + admin fan-out (same contract as the HTTP path).
	if _, aerr := repository.NewActivityRepository(con).Create(repository.ActivityInput{
		Username:    "system",
		Role:        "system",
		Category:    models.ActivityCategorySystem,
		Action:      "database_verify_failed",
		TargetLabel: res.Engine,
		Message:     "scheduled database verification failed on " + res.Engine + ": " + strings.Join(res.Issues, "; "),
		IPAddress:   "127.0.0.1",
		UserAgent:   "kspanel-scheduler",
	}); aerr != nil {
		log.Println("database verify sweep: activity failed:", aerr)
	}
	for _, uid := range adminIDsForVerifySweep(con) {
		handlers.EmitNotification(uid, nil, "system", models.NotificationCategorySystem,
			models.NotificationPriorityHigh,
			"Database verification failed ("+res.Engine+")",
			"Scheduled verify: "+strings.Join(res.Issues, "; "),
			"/database", "Open database", "")
	}
	log.Printf("database verify sweep: FAILED on %s: %s", res.Engine, strings.Join(res.Issues, "; "))
}

// adminIDsForVerifySweep lists ACCESS_ADMIN_PANEL holders (panel admins).
func adminIDsForVerifySweep(con *sql.DB) []int64 {
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
