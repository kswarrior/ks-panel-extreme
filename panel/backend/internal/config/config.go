package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// DefaultPort returns the default HTTP port for the API server.
func DefaultPort() int { return 5050 }

// DataDir returns the directory where KSPANEL keeps persistent files
// (database, uploaded logos, ...). Right now it lives next to the DB so
// backups stay co-located, but exposing it as a dedicated helper gives us a
// single place to swap in XXD_DATA_HOME later without touching every caller.
//
// The anchor is the DEFAULT SQLite location, deliberately NOT the live
// engine's DSN: once the panel runs on Postgres / MySQL the DSN is a
// connection string, and deriving directories from it would scatter
// kspanel.env, backups and uploads into folders named after DSN fragments
// (and desynchronise SaveDBConfig's write path from LoadEnvFile's read
// path, silently dropping persisted engine switches).
func DataDir() string {
	return filepath.Dir(DefaultSQLitePath())
}

// DBConfig bundles the engine selection + connection string that kspanel
// needs to dial its database. For the default SQLite backend the DSN is a
// plain file path (KSPANEL_DB or ./kspanel.db); for Postgres / MySQL it is the
// engine's standard connection string in KSPANEL_DB_DSN.
//
// Engine selection order (highest priority wins):
//   1. --type / --dsn CLI flags (seed/launch) injected via SetDatabaseType.
//   2. KSPANEL_DB_TYPE / KSPANEL_DB_DSN env vars.
//   3. SQLite default.
//
// The SQLite-shortcut KSPANEL_DB still maps to DSN when only it is set, so
// the env format operators have used for years keeps working untouched.
type DBConfig struct {
	Engine string // "sqlite" | "postgres" | "mysql"
	DSN    string // file path for sqlite; conn string for postgres / mysql
}

// databaseTypeOverride is set by the seed/launch CLI subcommands when the
// operator passes --type / --dsn. It wins over KSPANEL_DB_TYPE. Production
// paths that don't go through the CLI leave it empty.
var (
	databaseTypeOverride    string
	databaseDSNOverride     string
)

// SetDatabaseType records the --type / --dsn passed to seed or launch. Any
// non-empty value shadows the matching env var for the rest of the process.
func SetDatabaseType(engine, dsn string) {
	databaseTypeOverride = strings.ToLower(strings.TrimSpace(engine))
	databaseDSNOverride = dsn
}

// DatabaseConfig returns the effective DB configuration the panel should
// open. Callers should use this instead of probing env vars directly so the
// CLI flag precedence stays in one place.
func DatabaseConfig() DBConfig {
	engine := "sqlite"
	if v := strings.ToLower(strings.TrimSpace(os.Getenv("KSPANEL_DB_TYPE"))); v != "" {
		engine = v
	}
	dsn := ""
	if v := os.Getenv("KSPANEL_DB_DSN"); v != "" {
		dsn = v
	}

	// CLI overrides win.
	if databaseTypeOverride != "" {
		engine = databaseTypeOverride
	}
	if databaseDSNOverride != "" {
		dsn = databaseDSNOverride
	}

	// SQLite short-cut: KSPANEL_DB still works as the file path for ops
	// that haven't migrated to KSPANEL_DB_DSN. We only adopt it if the
	// DSN is still unset (so an explicit --dsn / KSPANEL_DB_DSN keeps
	// precedence).
	if dsn == "" && (engine == "sqlite" || engine == "") {
		if v := os.Getenv("KSPANEL_DB"); v != "" {
			dsn = v
		}
	}

	// SQLite default DSN: ./kspanel.db in the cwd. Postgres / MySQL
	// require an explicit DSN; we surface that loudly via an empty value
	// and let the opener fail with a useful error rather than guessing a
	// localhost default the operator didn't authorise.
	if engine == "" {
		engine = "sqlite"
	}
	if dsn == "" && engine == "sqlite" {
		dsn = defaultSQLitePath()
	}
	return DBConfig{Engine: engine, DSN: dsn}
}

// DatabasePath returns the SQLite DB path (or the explicit DSN target for
// non-SQLite engines) — kept as a backward-compat shim so the dozens of
// callers that already use it keep working without a refactor.
func DatabasePath() string {
	return DatabaseConfig().DSN
}

// defaultSQLitePath returns the file path the SQLite engine should open when
// no KSPANEL_DB / KSPANEL_DB_DSN is set. Falls back to a path next to the
// config source file only as a last resort (e.g. when Getwd fails — unlikely
// in normal use but defensive against weird CGO staging paths).
func defaultSQLitePath() string {
	if env := os.Getenv("KSPANEL_DB"); env != "" {
		return env
	}
	cwd, err := os.Getwd()
	if err == nil {
		return filepath.Join(cwd, "kspanel.db")
	}
	_, b, _, _ := runtime.Caller(0)
	base := filepath.Dir(b)
	return filepath.Join(base, "kspanel.db")
}

// DefaultSQLitePath is the exported form of defaultSQLitePath: the SQLite
// file the panel opens when no explicit DSN is configured. Callers that need
// a stable on-disk anchor independent of the live engine (the admin
// "Change Database" handler's one-click revert to SQLite) use this instead of
// DatabasePath(), which follows whatever engine is currently configured.
func DefaultSQLitePath() string { return defaultSQLitePath() }
