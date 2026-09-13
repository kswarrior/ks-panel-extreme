package repository

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// newAutomationNullTestDB mirrors the instance_automation schema
// (022 + 073 kind/payload + 074 steps) for NULL next_run_at pinning.
func newAutomationNullTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	schema := `CREATE TABLE instance_automation (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		instance_id INTEGER NOT NULL,
		name TEXT NOT NULL,
		command TEXT NOT NULL,
		kind TEXT NOT NULL DEFAULT 'shell',
		payload TEXT NOT NULL DEFAULT '',
		schedule TEXT NOT NULL DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 1,
		secret_refs TEXT NOT NULL DEFAULT '[]',
		timeout_sec INTEGER NOT NULL DEFAULT 300,
		steps TEXT,
		last_run_at DATETIME,
		next_run_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`
	if _, err := conn.Exec(schema); err != nil {
		t.Fatalf("create instance_automation: %v", err)
	}
	return conn
}

func rawNextRunNull(t *testing.T, conn *sql.DB, id int64) bool {
	t.Helper()
	var ns sql.NullString
	if err := conn.QueryRow(`SELECT next_run_at FROM instance_automation WHERE id = ?`, id).Scan(&ns); err != nil {
		t.Fatalf("select next_run_at: %v", err)
	}
	return !ns.Valid
}

// TestAutomationZeroNextNullsAndDuePinned locks the NULL contract: a zero
// next via MarkRan/ScheduleNext persists next_run_at IS NULL (never due,
// excluded from Due), while a non-zero past next persists and Due
// includes it.
func TestAutomationZeroNextNullsAndDuePinned(t *testing.T) {
	conn := newAutomationNullTestDB(t)
	repo := NewAutomationRepository(conn)

	id, err := repo.Create(AutomationUpsertInput{
		InstanceID: 1, Name: "pinned", Command: "echo hi",
		Schedule: "* * * * *", Enabled: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Non-zero past next persists and Due includes it.
	past := time.Now().UTC().Add(-time.Minute).Truncate(time.Second)
	if err := repo.ScheduleNext(id, past); err != nil {
		t.Fatalf("schedule next past: %v", err)
	}
	if rawNextRunNull(t, conn, id) {
		t.Fatal("non-zero ScheduleNext must persist a value, got NULL")
	}
	due, err := repo.Due(time.Now().UTC())
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	if len(due) != 1 || due[0].ID != id {
		t.Fatalf("past-due job must be in Due, got %+v", due)
	}

	// MarkRan with zero parks as NULL and Due excludes it.
	if err := repo.MarkRan(id, time.Time{}); err != nil {
		t.Fatalf("mark ran zero: %v", err)
	}
	if !rawNextRunNull(t, conn, id) {
		t.Fatal("MarkRan zero must persist next_run_at IS NULL")
	}
	got, err := repo.Get(id)
	if err != nil {
		t.Fatalf("get after zero mark: %v", err)
	}
	if got.NextRunAt != nil {
		t.Fatalf("Get NextRunAt = %v, want nil after zero MarkRan", got.NextRunAt)
	}
	due, err = repo.Due(time.Now().UTC())
	if err != nil {
		t.Fatalf("due after zero mark: %v", err)
	}
	if len(due) != 0 {
		t.Fatalf("zero-marked job must be excluded from Due, got %+v", due)
	}

	// ScheduleNext with zero also clears to NULL and stays excluded.
	if err := repo.ScheduleNext(id, past); err != nil {
		t.Fatalf("re-arm past: %v", err)
	}
	if err := repo.ScheduleNext(id, time.Time{}); err != nil {
		t.Fatalf("schedule next zero: %v", err)
	}
	if !rawNextRunNull(t, conn, id) {
		t.Fatal("ScheduleNext zero must persist next_run_at IS NULL")
	}
	due, err = repo.Due(time.Now().UTC())
	if err != nil {
		t.Fatalf("due after zero schedule: %v", err)
	}
	if len(due) != 0 {
		t.Fatalf("zero-scheduled job must be excluded from Due, got %+v", due)
	}
}
