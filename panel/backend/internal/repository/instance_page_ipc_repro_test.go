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

// Get must not mask transport errors as not-found (fail closed with context).
func TestIPCGetSurfacesDBError(t *testing.T) {
	conn := newIPCTestDB(t)
	r := NewInstancePageRepository(conn)
	id, err := r.Create(InstancePageInput{Name: "A", Slug: "a"})
	if err != nil || id == 0 {
		t.Fatalf("create: %v %d", err, id)
	}
	if _, err := r.Get(999999); err == nil || err.Error() != "instance page not found" {
		t.Fatalf("missing row must be not-found, got %v", err)
	}
	conn.Close() // force a real transport error
	_, err = r.Get(id)
	if err == nil {
		t.Fatalf("expected error on closed db, got nil")
	}
	if err.Error() == "instance page not found" {
		t.Fatalf("transport error masked as not-found: %q", err.Error())
	}
	if !strings.Contains(err.Error(), "get instance page") {
		t.Fatalf("error must carry context, got %q", err.Error())
	}
}

// Duplicate slug (concurrent link-same-slug twice) must fail closed with a
// friendly conflict, mirroring isPanelPageConflict — never a raw driver blob.
func TestIPCDuplicateSlugConflict(t *testing.T) {
	conn := newIPCTestDB(t)
	r := NewInstancePageRepository(conn)
	if _, err := r.Create(InstancePageInput{Name: "A", Slug: "dup"}); err != nil {
		t.Fatalf("first create: %v", err)
	}
	_, err := r.Create(InstancePageInput{Name: "B", Slug: "dup"})
	if err == nil {
		t.Fatalf("expected duplicate error, got nil")
	}
	if !strings.Contains(err.Error(), `slug "dup" already exists`) {
		t.Fatalf("want friendly conflict, got %q", err.Error())
	}
	id2, err := r.Create(InstancePageInput{Name: "C", Slug: "other"})
	if err != nil {
		t.Fatalf("create other: %v", err)
	}
	if err := r.Update(id2, InstancePageInput{Name: "C", Slug: "dup"}); err == nil ||
		!strings.Contains(err.Error(), `slug "dup" already exists`) {
		t.Fatalf("update onto taken slug must conflict, got %v", err)
	}
}

// Update/Delete on a missing row stay not-found; build columns survive Update.
func TestIPCUpdateDeleteNotFoundAndBuildPreserved(t *testing.T) {
	conn := newIPCTestDB(t)
	r := NewInstancePageRepository(conn)
	if err := r.Update(999999, InstancePageInput{Name: "x", Slug: "x"}); err == nil ||
		err.Error() != "instance page not found" {
		t.Fatalf("update missing must be not-found, got %v", err)
	}
	if err := r.Delete(999999); err == nil || err.Error() != "instance page not found" {
		t.Fatalf("delete missing must be not-found, got %v", err)
	}
	if err := r.UpdateBuild(999999, "js", "css", "ok", "log"); err == nil ||
		err.Error() != "instance page not found" {
		t.Fatalf("updatebuild missing must be not-found, got %v", err)
	}
	id, err := r.Create(InstancePageInput{Name: "A", Slug: "a"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := r.UpdateBuild(id, "JS", "CSS", "ok", "log"); err != nil {
		t.Fatalf("updatebuild: %v", err)
	}
	if err := r.Update(id, InstancePageInput{Name: "A2", Slug: "a"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, err := r.Get(id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.BundleJS != "JS" || got.BundleCSS != "CSS" || got.BuildStatus != "ok" {
		t.Fatalf("Update clobbered build columns: %+v", got)
	}
	if got.Name != "A2" {
		t.Fatalf("Update did not persist name, got %q", got.Name)
	}
}
