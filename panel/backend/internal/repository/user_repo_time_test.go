package repository

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// newUserTimeTestDB builds the minimal users schema ListUsers selects from.
func newUserTimeTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	stmts := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
			password_hash TEXT NOT NULL DEFAULT '', role_id INTEGER NOT NULL DEFAULT 0, created_at DATETIME,
			suspended INTEGER NOT NULL DEFAULT 0, suspended_until TEXT, suspension_count INTEGER NOT NULL DEFAULT 0,
			suspension_history TEXT NOT NULL DEFAULT '[]', display_name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
			pronouns TEXT NOT NULL DEFAULT '', accent_color TEXT NOT NULL DEFAULT '', avatar_symbol TEXT NOT NULL DEFAULT '',
			avatar_mime TEXT, avatar_filename TEXT, banner_mime TEXT, banner_filename TEXT, social_links TEXT NOT NULL DEFAULT '[]')`,
		`INSERT INTO users (username, email, password_hash, role_id, created_at) VALUES ('alice', 'a@x.io', 'h', 1, '2026-09-08 16:04:05')`,
		`INSERT INTO users (username, email, password_hash, role_id, created_at) VALUES ('bob', 'b@x.io', 'h', 1, '2026-09-08T16:04:05Z')`,
		`INSERT INTO users (username, email, password_hash, role_id, created_at) VALUES ('carol', 'c@x.io', 'h', 1, '0001-01-01 00:00:00')`,
		`INSERT INTO users (username, email, password_hash, role_id, created_at) VALUES ('dave', 'd@x.io', 'h', 1, NULL)`,
	}
	for _, s := range stmts {
		if _, err := conn.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return conn
}

// TestUserListNeverEmitsYearOne is the regression test for the users page
// cards rendering "Created 1/1/1": whatever spelling (or NULL/garbage) the
// row carries, ListUsers must never hand the card a year-1 timestamp,
// because toLocaleDateString renders Go zero time as 1/1/1.
func TestUserListNeverEmitsYearOne(t *testing.T) {
	conn := newUserTimeTestDB(t)
	repo := NewUserRepository(conn)
	rows, err := repo.ListUsers()
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(rows) != 4 {
		t.Fatalf("ListUsers returned %d rows, want 4", len(rows))
	}
	floor := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, u := range rows {
		if u.CreatedAt.Before(floor) {
			t.Errorf("%s.CreatedAt = %v, want >= 2000 (never year 1)", u.Username, u.CreatedAt)
		}
		raw, _ := json.Marshal(u)
		if strings.Contains(string(raw), "0001-01-01") {
			t.Errorf("%s JSON contains year-1: %s", u.Username, raw)
		}
	}
}

// TestUserGetByIDParsesEngineSpellings proves the detail/profile path
// (GetByID, shared by GetByUsername and the public profile endpoints)
// parses non-SQLite spellings instead of zeroing out, and degrades corrupt
// values to now rather than year 1.
func TestUserGetByIDParsesEngineSpellings(t *testing.T) {
	conn := newUserTimeTestDB(t)
	repo := NewUserRepository(conn)
	bob, err := repo.GetByID(2)
	if err != nil {
		t.Fatalf("GetByID(2): %v", err)
	}
	if bob.CreatedAt.Year() != 2026 {
		t.Errorf("bob.CreatedAt = %v, want RFC3339 2026 parse", bob.CreatedAt)
	}
	carol, err := repo.GetByID(3)
	if err != nil {
		t.Fatalf("GetByID(3): %v", err)
	}
	floor := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	if carol.CreatedAt.Before(floor) {
		t.Errorf("carol.CreatedAt = %v, want sane fallback (never year 1)", carol.CreatedAt)
	}
}
