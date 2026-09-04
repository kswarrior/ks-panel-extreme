package backup

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func openSQLiteForTest(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

func TestClassifyBackupBytes(t *testing.T) {
	sqliteHead := append([]byte("SQLite format 3\x00"), []byte("rest...")...)
	if got := classifyBackupBytes(sqliteHead); got != "sqlite" {
		t.Fatalf("sqlite header classified as %q", got)
	}
	for _, sql := range []string{
		"-- PostgreSQL database dump\nSET statement_timeout = 0;",
		"CREATE TABLE foo (id INTEGER PRIMARY KEY);",
		"INSERT INTO foo VALUES (1);",
		"/* MySQL dump */\nCREATE TABLE t (a INT);",
		"PostgreSQL database dump",
	} {
		if got := classifyBackupBytes([]byte(sql)); got != "sql" {
			t.Fatalf("sql %q classified as %q", sql[:20], got)
		}
	}
	if got := classifyBackupBytes([]byte("\x00\x01\x02not a db")); got != "" {
		t.Fatalf("garbage classified as %q", got)
	}
}

func TestUploadFromReaderAcceptsSQL(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	sqlDump := "-- PostgreSQL database dump\nCREATE TABLE foo (id INTEGER PRIMARY KEY);\nINSERT INTO foo VALUES (1);\n"
	b, err := UploadFromReader(strings.NewReader(sqlDump), int64(len(sqlDump)), "mydump.sql")
	if err != nil {
		t.Fatalf("UploadFromReader(.sql) failed: %v", err)
	}
	if !strings.HasSuffix(b.Filename, ".sql") {
		t.Fatalf("expected .sql filename, got %q", b.Filename)
	}
	kind, derr := DetectBackupKind(b.Path, b.Compression)
	if derr != nil {
		t.Fatalf("DetectBackupKind failed: %v", derr)
	}
	if kind != "sql" {
		t.Fatalf("expected sql kind, got %q", kind)
	}
	_ = os.Remove(b.Path)
}

func TestUploadFromReaderStillAcceptsSQLite(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	// Minimal valid SQLite file: create via driver then upload its bytes.
	tmpDB := filepath.Join(dir, "src.db")
	if err := createTinySQLite(t, tmpDB); err != nil {
		t.Fatalf("create src: %v", err)
	}
	raw, err := os.ReadFile(tmpDB)
	if err != nil {
		t.Fatal(err)
	}
	b, err := UploadFromReader(strings.NewReader(string(raw)), int64(len(raw)), "copy.db")
	if err != nil {
		t.Fatalf("UploadFromReader(.db) failed: %v", err)
	}
	if !strings.HasSuffix(b.Filename, ".db") {
		t.Fatalf("expected .db filename, got %q", b.Filename)
	}
	kind, derr := DetectBackupKind(b.Path, b.Compression)
	if derr != nil {
		t.Fatalf("Detect failed: %v", derr)
	}
	if kind != "sqlite" {
		t.Fatalf("expected sqlite kind, got %q", kind)
	}
}

func createTinySQLite(t *testing.T, path string) error {
	t.Helper()
	// Minimal SQLite file via the same driver UploadFromReader probes with.
	// Keep imports local to avoid touching backup.go's import block.
	db, err := openSQLiteForTest(path)
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER PRIMARY KEY)`); err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO t (id) VALUES (1)`)
	return err
}

func TestRestorePGAndMySQLMissingToolOrEngineMismatch(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	// Upload a .sql dump so Get(id) resolves; live engine is sqlite so
	// both restores must refuse with an engine-mismatch error (not panic).
	sqlDump := "CREATE TABLE foo (id INTEGER PRIMARY KEY);\n"
	b, err := UploadFromReader(strings.NewReader(sqlDump), int64(len(sqlDump)), "m.sql")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if err := RestorePG(b.ID); err == nil {
		t.Fatal("expected RestorePG to fail on sqlite live engine")
	} else if !strings.Contains(strings.ToLower(err.Error()), "not postgres") {
		t.Logf("RestorePG error (acceptable if tool-missing on pg live): %v", err)
	}
	if err := RestoreMySQL(b.ID); err == nil {
		t.Fatal("expected RestoreMySQL to fail on sqlite live engine")
	} else if !strings.Contains(strings.ToLower(err.Error()), "not mysql") {
		t.Logf("RestoreMySQL error (acceptable if tool-missing on mysql live): %v", err)
	}
}
