package repository

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func newTestUpdateWindowDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	// Mirror of migration 068 (sqlite dialect).
	schema := `CREATE TABLE update_windows (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target        TEXT     NOT NULL DEFAULT 'panel' CHECK (target IN ('panel','fleet')),
    name          TEXT     NOT NULL DEFAULT '',
    cron          TEXT     NOT NULL DEFAULT '',
    enabled       INTEGER  NOT NULL DEFAULT 1,
    window_start  TEXT     NOT NULL DEFAULT '',
    window_end    TEXT     NOT NULL DEFAULT '',
    next_run_at   DATETIME NULL,
    last_run_at   DATETIME NULL,
    last_status   TEXT     NOT NULL DEFAULT '',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("create update_windows: %v", err)
	}
	return db
}

func TestUpdateWindowCRUDScopedByTarget(t *testing.T) {
	db := newTestUpdateWindowDB(t)
	repo := NewUpdateWindowRepository(db)

	next := time.Date(2026, 9, 4, 3, 0, 0, 0, time.UTC)
	id, err := repo.Create(UpdateWindowInput{
		Target: "panel", Name: "nightly", Cron: "0 3 * * *", Enabled: true,
		WindowStart: "02:00", WindowEnd: "04:00", NextRunAt: &next,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := repo.Get(id, "panel")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "nightly" || got.Cron != "0 3 * * *" || !got.Enabled {
		t.Fatalf("unexpected row: %+v", got)
	}
	if got.NextRunAt == nil || !got.NextRunAt.Equal(next) {
		t.Fatalf("next_run_at not preserved: %+v", got.NextRunAt)
	}
	// Target scoping: the fleet surface must not see panel rows.
	if _, err := repo.Get(id, "fleet"); err != sql.ErrNoRows {
		t.Fatalf("cross-target get must 404, got %v", err)
	}
	if err := repo.Update(id, UpdateWindowInput{
		Target: "panel", Name: "nightly", Cron: "30 3 * * *", Enabled: false,
		WindowStart: "02:00", WindowEnd: "05:00", NextRunAt: &next,
	}); err != nil {
		t.Fatalf("update: %v", err)
	}
	updated, err := repo.Get(id, "panel")
	if err != nil {
		t.Fatalf("get after update: %v", err)
	}
	if updated.Cron != "30 3 * * *" || updated.Enabled || updated.WindowEnd != "05:00" {
		t.Fatalf("update not applied: %+v", updated)
	}
	if err := repo.Delete(id, "fleet"); err != sql.ErrNoRows {
		t.Fatalf("cross-target delete must 404, got %v", err)
	}
	if err := repo.Delete(id, "panel"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := repo.Get(id, "panel"); err != sql.ErrNoRows {
		t.Fatalf("deleted row must 404, got %v", err)
	}
}

func TestUpdateWindowDueAndMarkRan(t *testing.T) {
	db := newTestUpdateWindowDB(t)
	repo := NewUpdateWindowRepository(db)

	past := time.Now().UTC().Add(-time.Minute).Truncate(time.Second)
	future := time.Now().UTC().Add(time.Hour).Truncate(time.Second)
	dueID, err := repo.Create(UpdateWindowInput{Target: "fleet", Name: "due", Cron: "* * * * *", Enabled: true, NextRunAt: &past})
	if err != nil {
		t.Fatalf("create due: %v", err)
	}
	if _, err := repo.Create(UpdateWindowInput{Target: "fleet", Name: "later", Cron: "* * * * *", Enabled: true, NextRunAt: &future}); err != nil {
		t.Fatalf("create future: %v", err)
	}
	disabledPast := past
	if _, err := repo.Create(UpdateWindowInput{Target: "panel", Name: "off", Cron: "* * * * *", Enabled: false, NextRunAt: &disabledPast}); err != nil {
		t.Fatalf("create disabled: %v", err)
	}

	due, err := repo.Due(time.Now().UTC())
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 1 || due[0].ID != dueID {
		t.Fatalf("expected only the due row, got %+v", due)
	}
	next := time.Now().UTC().Add(time.Hour)
	if err := repo.MarkRan(dueID, &next, "skipped: outside maintenance window"); err != nil {
		t.Fatalf("mark ran: %v", err)
	}
	got, err := repo.Get(dueID, "fleet")
	if err != nil {
		t.Fatalf("get after mark: %v", err)
	}
	if got.LastStatus != "skipped: outside maintenance window" {
		t.Fatalf("last_status not recorded: %q", got.LastStatus)
	}
	if got.NextRunAt == nil || got.NextRunAt.Before(time.Now().UTC()) {
		t.Fatalf("next_run_at not re-armed: %+v", got.NextRunAt)
	}
	// Re-armed rows are no longer due.
	due, err = repo.Due(time.Now().UTC())
	if err != nil {
		t.Fatalf("due after rearm: %v", err)
	}
	if len(due) != 0 {
		t.Fatalf("expected nothing due after re-arm, got %+v", due)
	}
}
