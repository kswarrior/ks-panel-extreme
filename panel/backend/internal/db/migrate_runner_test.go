package db

import (
	"path/filepath"
	"testing"
)

// Regression tests for the statement-level migration runner
// (execMigrationBody). Pure unit tests — no live Postgres/MySQL needed —
// plus a SQLite end-to-end double-run proving the split never regresses
// the default engine.

func TestSplitSQLStatements(t *testing.T) {
	body := []byte("-- header; with semicolon\n" +
		"CREATE TABLE IF NOT EXISTS a (id INTEGER);\n" +
		"-- trailing comment\n" +
		"INSERT INTO a (id) VALUES (1), (2);  -- inline comment\n" +
		"INSERT INTO a (id) VALUES ('it''s; quoted');\n")
	got := splitSQLStatements(body)
	if len(got) != 3 {
		t.Fatalf("want 3 statements, got %d: %q", len(got), got)
	}
	if got[0] != "CREATE TABLE IF NOT EXISTS a (id INTEGER)" {
		t.Fatalf("stmt1 = %q", got[0])
	}
	if got[2] != "INSERT INTO a (id) VALUES ('it''s; quoted')" {
		t.Fatalf("quoted semicolon must not split, got %q", got[2])
	}
	if len(splitSQLStatements([]byte("-- only a comment;\n  \n"))) != 0 {
		t.Fatal("comment-only body must yield zero statements")
	}
}

func TestParseCreateIndex(t *testing.T) {
	for _, tc := range []struct {
		in       string
		idx, tbl string
		ok       bool
	}{
		{"CREATE INDEX foo ON bar(x)", "foo", "bar", true},
		{"CREATE INDEX IF NOT EXISTS foo ON bar(x, y)", "foo", "bar", true},
		{"CREATE UNIQUE INDEX `foo` ON `bar`(x)", "foo", "bar", true},
		{`CREATE INDEX "foo" ON "bar"(x)`, "foo", "bar", true},
		{"create index foo on bar(x)", "foo", "bar", true},
		{"CREATE TABLE foo (id INTEGER)", "", "", false},
		{"CREATE INDEX", "", "", false},
	} {
		idx, tbl, ok := parseCreateIndex(tc.in)
		if idx != tc.idx || tbl != tc.tbl || ok != tc.ok {
			t.Fatalf("parseCreateIndex(%q) = (%q,%q,%v), want (%q,%q,%v)",
				tc.in, idx, tbl, ok, tc.idx, tc.tbl, tc.ok)
		}
	}
}

func TestRewriteInsertOrIgnoreForPostgres(t *testing.T) {
	in := "INSERT OR IGNORE INTO permissions (key, description) VALUES\n('A', 'a'),\n('B', 'b')"
	want := "INSERT INTO permissions (key, description) VALUES\n('A', 'a'),\n('B', 'b') ON CONFLICT DO NOTHING"
	if got := rewriteInsertOrIgnoreForPostgres(in); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	// Already-converted and unrelated statements pass through byte-identical.
	for _, s := range []string{
		"INSERT INTO settings (key, value) VALUES ('x', 'y') ON CONFLICT DO NOTHING",
		"CREATE TABLE IF NOT EXISTS a (id INTEGER)",
		"INSERTOR IGNORE INTO a (id) VALUES (1)",
	} {
		if got := rewriteInsertOrIgnoreForPostgres(s); got != s {
			t.Fatalf("passthrough changed %q -> %q", s, got)
		}
	}
}

func TestRewriteBlobForPostgres(t *testing.T) {
	in := "CREATE TABLE t (value_blob BLOB NOT NULL, note TEXT DEFAULT 'a blob here')"
	got := rewriteBlobForPostgres(in)
	want := "CREATE TABLE t (value_blob BYTEA NOT NULL, note TEXT DEFAULT 'a blob here')"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

// TestSQLiteMigrationsTwice runs the full shipped set against a scratch
// SQLite file two times in a row: migrations re-run on every launch, so a
// second run must converge with no error.
func TestSQLiteMigrationsTwice(t *testing.T) {
	dir := t.TempDir()
	dsn := filepath.Join(dir, "twice.db")
	d, err := NewDialect("sqlite")
	if err != nil {
		t.Fatal(err)
	}
	con, err := d.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer con.Close()
	if err := RunMigrations(d, con); err != nil {
		t.Fatalf("first run: %v", err)
	}
	if err := RunMigrations(d, con); err != nil {
		t.Fatalf("second run: %v", err)
	}
	if err := EnsureSchemaAndSeed(d, con); err != nil {
		t.Fatalf("seed: %v", err)
	}
}
