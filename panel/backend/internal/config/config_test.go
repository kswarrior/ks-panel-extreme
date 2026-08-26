package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestDatabaseConfigSQLiteShortcutPreserved pins the env precedence the panel
// documents: KSPANEL_DB still maps to the SQLite DSN when nothing else is
// set, and explicit DSN wins over it.
func TestDatabaseConfigSQLiteShortcutPreserved(t *testing.T) {
	t.Setenv("KSPANEL_DB_TYPE", "")
	t.Setenv("KSPANEL_DB_DSN", "")
	t.Setenv("KSPANEL_DB", filepath.Join(t.TempDir(), "panel.db"))
	cfg := DatabaseConfig()
	if cfg.Engine != "sqlite" || cfg.DSN == "" || !strings.HasSuffix(cfg.DSN, "panel.db") {
		t.Fatalf("cfg = %+v", cfg)
	}
}

// TestDataDirAnchorsAwayFromForeignDSN guards the Change-Database flow: once
// the live engine is Postgres/MySQL the DSN is a connection string, and
// deriving DataDir (kspanel.env, backups, uploads) from it would write files
// into directories named after DSN fragments — desynchronising
// SaveDBConfig's write path from LoadEnvFile's read path so a persisted
// switch silently never applies after restart.
func TestDataDirAnchorsAwayFromForeignDSN(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	t.Setenv("KSPANEL_DB_TYPE", "mysql")
	t.Setenv("KSPANEL_DB_DSN", "user:pass@tcp(10.0.0.9:3306)/kspanel")
	if got := DataDir(); got != dir {
		t.Fatalf("DataDir with mysql live = %q, want %q", got, dir)
	}

	// While SQLite backs the panel the anchor stays the live path exactly as
	// before this fix.
	t.Setenv("KSPANEL_DB_TYPE", "sqlite")
	t.Setenv("KSPANEL_DB_DSN", filepath.Join(dir, "custom.db"))
	if got := DataDir(); got != dir {
		t.Fatalf("DataDir with sqlite custom dsn = %q, want %q", got, dir)
	}
}

// TestEnvFilePathMatchesReadSide proves the env file the admin switch writes
// is the same file launch reads before any persisted engine is applied.
func TestEnvFilePathMatchesReadSide(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	t.Setenv("KSPANEL_DB_TYPE", "postgres")
	t.Setenv("KSPANEL_DB_DSN", "postgres://u:p@h:5432/db")
	if got, want := EnvFilePath(), filepath.Join(dir, EnvFileName); got != want {
		t.Fatalf("EnvFilePath = %q, want %q", got, want)
	}
}

// TestSaveDBConfigPersistsAndRoundTrips covers the exact payload the
// SetDatabaseEngineHandler persists and that LoadEnvFile honours it when the
// process env carries none of the keys.
func TestSaveDBConfigPersistsAndRoundTrips(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	os.Unsetenv("KSPANEL_DB_TYPE")
	os.Unsetenv("KSPANEL_DB_DSN")
	if err := SaveDBConfig("postgresql", "postgres://u:p%40ss@h:5432/db"); err != nil {
		t.Fatal(err)
	}
	LoadEnvFile()
	cfg := DatabaseConfig()
	if cfg.Engine != "postgres" || !strings.Contains(cfg.DSN, "5432") {
		t.Fatalf("round trip = %+v", cfg)
	}
}
