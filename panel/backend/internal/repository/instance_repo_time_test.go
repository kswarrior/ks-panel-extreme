package repository

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// newInstanceTimeTestDB builds the minimal schema List() selects from
// (instances + the three LEFT JOIN parents).
func newInstanceTimeTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	stmts := []string{
		`CREATE TABLE nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE instances (id INTEGER PRIMARY KEY AUTOINCREMENT, node_id INTEGER NOT NULL, template_id INTEGER, owner_id INTEGER,
			name TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'creating', external_id TEXT NOT NULL DEFAULT '', config TEXT NOT NULL DEFAULT '{}',
			error TEXT NOT NULL DEFAULT '', install_state TEXT NOT NULL DEFAULT '', install_id TEXT NOT NULL DEFAULT '', install_step INTEGER NOT NULL DEFAULT -1,
			install_error TEXT NOT NULL DEFAULT '', install_steps_json TEXT NOT NULL DEFAULT '', install_kind TEXT NOT NULL DEFAULT '',
			install_auto_stop INTEGER NOT NULL DEFAULT 0, install_action_id TEXT NOT NULL DEFAULT '',
			suspended INTEGER NOT NULL DEFAULT 0, suspended_until TEXT, suspension_count INTEGER NOT NULL DEFAULT 0, suspension_history TEXT NOT NULL DEFAULT '[]',
			started_at TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`INSERT INTO nodes (id, name) VALUES (1, 'edge-1')`,
		`INSERT INTO templates (id, name) VALUES (1, 'tpl')`,
		`INSERT INTO users (id, username) VALUES (1, 'alice')`,
	}
	for _, s := range stmts {
		if _, err := conn.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return conn
}

// TestParseDBTimeLayouts proves every timestamp spelling the fleet has been
// observed to carry parses to the same instant, and that empty / garbage /
// year-1 values report false instead of a zero time.
func TestParseDBTimeLayouts(t *testing.T) {
	want := time.Date(2026, 9, 8, 16, 4, 5, 0, time.UTC)
	spellings := []string{
		"2026-09-08 16:04:05",
		"2026-09-08 16:04:05.123456789",
		"2026-09-08T16:04:05",
		"2026-09-08T16:04:05Z",
		"2026-09-08T16:04:05.123456789Z",
		"2026-09-08 16:04:05+00:00",
		"2026-09-08 18:04:05+02:00",
	}
	for _, s := range spellings {
		got, ok := parseDBTime(s)
		if !ok {
			t.Errorf("parseDBTime(%q) reported false, want true", s)
			continue
		}
		if !got.Equal(want) {
			t.Errorf("parseDBTime(%q) = %v, want %v", s, got, want)
		}
	}
	for _, s := range []string{"", "   ", "not-a-time", "0001-01-01 00:00:00", "0001-01-01T00:00:00Z", "2026-13-99 99:99:99"} {
		if _, ok := parseDBTime(s); ok {
			t.Errorf("parseDBTime(%q) reported true, want false (must never yield year-1)", s)
		}
	}
}

// TestInstanceListNeverEmitsYearOne is the regression test for the
// "739866d 16h uptime on a just-started instance" report: whatever spelling
// (or garbage) the row carries, List must never hand the card a year-1
// timestamp, because the card renders now-minus-timestamp as uptime.
func TestInstanceListNeverEmitsYearOne(t *testing.T) {
	conn := newInstanceTimeTestDB(t)
	seed := []string{
		// Freshly started: NULL started_at is fine (falls back to updated_at).
		`INSERT INTO instances (node_id, template_id, owner_id, name, kind, status, started_at, created_at, updated_at)
			VALUES (1, 1, 1, 'fresh', 'docker', 'running', NULL, '2026-09-08 16:04:00', '2026-09-08 16:04:05')`,
		// Engine-skew spellings (RFC3339 / tz offset) must parse, not zero out.
		`INSERT INTO instances (node_id, template_id, owner_id, name, kind, status, started_at, created_at, updated_at)
			VALUES (1, 1, 1, 'skewed', 'docker', 'running', '2026-09-08T16:04:05Z', '2026-09-08 16:04:05+00:00', '2026-09-08T16:04:05Z')`,
		// Corrupt row: garbage everywhere. StartedAt must stay nil and the
		// non-nullable pair must degrade to something sane, never year 1.
		`INSERT INTO instances (node_id, template_id, owner_id, name, kind, status, started_at, created_at, updated_at)
			VALUES (1, 1, 1, 'corrupt', 'docker', 'running', '0001-01-01 00:00:00', 'garbage', '')`,
	}
	for _, s := range seed {
		if _, err := conn.Exec(s); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	repo := NewInstanceRepository(conn)
	rows, err := repo.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("List returned %d rows, want 3", len(rows))
	}
	byName := map[string]int{}
	for i, r := range rows {
		byName[r.Name] = i
	}
	fresh := rows[byName["fresh"]]
	if fresh.StartedAt != nil {
		t.Errorf("fresh.StartedAt = %v, want nil (NULL stays nil)", fresh.StartedAt)
	}
	skewed := rows[byName["skewed"]]
	if skewed.StartedAt == nil || skewed.StartedAt.Year() != 2026 {
		t.Errorf("skewed.StartedAt = %v, want 2026 RFC3339 parse", skewed.StartedAt)
	}
	corrupt := rows[byName["corrupt"]]
	if corrupt.StartedAt != nil {
		t.Errorf("corrupt.StartedAt = %v, want nil (year-1 must not flow through)", corrupt.StartedAt)
	}
	floor := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, r := range rows {
		if r.CreatedAt.Before(floor) {
			t.Errorf("%s.CreatedAt = %v, want >= 2000 (never year 1)", r.Name, r.CreatedAt)
		}
		if r.UpdatedAt.Before(floor) {
			t.Errorf("%s.UpdatedAt = %v, want >= 2000 (never year 1)", r.Name, r.UpdatedAt)
		}
		raw, _ := json.Marshal(r)
		if strings.Contains(string(raw), "0001-01-01") {
			t.Errorf("%s JSON contains year-1: %s", r.Name, raw)
		}
	}
}
