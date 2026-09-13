package repository

import (
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func newIPCTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	stmts := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL)`,
		`CREATE TABLE instance_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'custom', category TEXT NOT NULL DEFAULT '', page_type TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'markdown', content_html TEXT NOT NULL DEFAULT '', content_markdown TEXT NOT NULL DEFAULT '', content_blocks TEXT NOT NULL DEFAULT '', source_tsx TEXT, bundle_js TEXT, bundle_css TEXT, build_status VARCHAR(16) NOT NULL DEFAULT '', build_log TEXT, icon_svg TEXT NOT NULL DEFAULT '', icon_color TEXT NOT NULL DEFAULT '', actions TEXT NOT NULL DEFAULT '', sub_pages TEXT NOT NULL DEFAULT '', components TEXT NOT NULL DEFAULT '', configure TEXT NOT NULL DEFAULT '', owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, source TEXT NOT NULL DEFAULT 'studio', market_id TEXT NOT NULL DEFAULT '', market_version TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`INSERT INTO users (id, username) VALUES (1, 'alice')`,
	}
	for _, s := range stmts {
		if _, err := conn.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return conn
}

func TestIPCReproGetMasksDBError(t *testing.T) {
	conn := newIPCTestDB(t)
	r := NewInstancePageRepository(conn)
	id, err := r.Create(InstancePageInput{Name: "A", Slug: "a"})
	if err != nil || id == 0 {
		t.Fatalf("create: %v %d", err, id)
	}
	conn.Close() // force a real transport error
	err = func() error { _, e := r.Get(id); return e }()
	if err == nil {
		t.Fatalf("expected error on closed db, got nil")
	}
	t.Logf("REPRO Get-on-closed-db err=%q", err.Error())
	if err.Error() == "instance page not found" {
		t.Logf("REPRO CONFIRMED: transport error masked as not-found")
	}
}

func TestIPCReproDuplicateSlugRaw(t *testing.T) {
	conn := newIPCTestDB(t)
	r := NewInstancePageRepository(conn)
	if _, err := r.Create(InstancePageInput{Name: "A", Slug: "dup"}); err != nil {
		t.Fatalf("first create: %v", err)
	}
	_, err := r.Create(InstancePageInput{Name: "B", Slug: "dup"})
	if err == nil {
		t.Fatalf("expected duplicate error, got nil")
	}
	t.Logf("REPRO dup-create err=%q", err.Error())
	if !strings.Contains(strings.ToLower(err.Error()), "already exists") {
		t.Logf("REPRO CONFIRMED: duplicate slug leaks raw driver error (no friendly already-exists mapping)")
	}
}
