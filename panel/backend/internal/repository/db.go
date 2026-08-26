package repository

import (
	"database/sql"
	"strings"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

// OpenDB opens the configured database using the dialect-aware opener. It no
// longer hardcodes the SQLite driver, so callers transparently talk to
// whatever engine the operator picked (SQLite / Postgres / MySQL). The
// returned *sql.DB inherits the dialiect's pool tuning from db.Open.
func OpenDB() (*sql.DB, error) {
	con, _, err := db.Open(config.DatabaseConfig())
	if err != nil {
		return nil, err
	}
	return con, nil
}

// engineName returns the active engine as "sqlite", "postgres" or "mysql"
// (MariaDB normalises to mysql — same wire grammar for the statements this
// package builds). Repositories consult it only where SQL genuinely differs
// between engines, e.g. the upsert suffix (ON CONFLICT vs ON DUPLICATE KEY).
func engineName() string {
	switch strings.ToLower(strings.TrimSpace(config.DatabaseConfig().Engine)) {
	case "postgres", "postgresql", "pg":
		return "postgres"
	case "mysql", "mariadb":
		return "mysql"
	default:
		return "sqlite"
	}
}
