package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestDataDirAnchorsAwayFromForeignDSN guards the Change-Database flow: once
// the live engine is Postgres/MySQL the DSN is a connection string, and
// deriving DataDir (kspanel.env, backups, uploads) from it would write files
// into directories named after DSN fragments — desynchronising SaveDBConfig's
// write path from LoadEnvFile's read path so a persisted switch silently
// never applies after restart.
func TestDataDirAnchorsAwayFromForeignDSN(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	t.Setenv("KSPANEL_DB_TYPE", "mysql")
	t.Setenv("KSPANEL_DB_DSN", "user:pass@tcp(10.0.0.9:3306)/kspanel")
	if got := DataDir(); got != dir {
		t.Fatalf("DataDir with mysql live = %q, want %q", got, dir)
	}
	t.Setenv("KSPANEL_DB_TYPE", "sqlite")
	t.Setenv("KSPANEL_DB_DSN", filepath.Join(dir, "custom.db"))
	if got := DataDir(); got != dir {
		t.Fatalf("DataDir with sqlite custom dsn = %q, want %q", got, dir)
	}
}

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
// SetDatabaseEngineHandler persists (canonical engine name) and that
// LoadEnvFile honours it. The password contains '@' to prove FormatDSN escaping.
func TestSaveDBConfigPersistsAndRoundTrips(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	os.Unsetenv("KSPANEL_DB_TYPE")
	os.Unsetenv("KSPANEL_DB_DSN")
	dsn, ok := BuildDSNFromURL("mysql", "127.0.0.1:3306", "ks", "p@ss:w/rd", "kspanel")
	if !ok || !strings.Contains(dsn, "tcp(127.0.0.1:3306)") {
		t.Fatalf("BuildDSNFromURL = %q ok=%v", dsn, ok)
	}
	if err := SaveDBConfig("mysql", dsn); err != nil {
		t.Fatal(err)
	}
	LoadEnvFile()
	cfg := DatabaseConfig()
	if cfg.Engine != "mysql" || !strings.Contains(cfg.DSN, "tcp(127.0.0.1:3306)") {
		t.Fatalf("round trip = %+v", cfg)
	}
}
