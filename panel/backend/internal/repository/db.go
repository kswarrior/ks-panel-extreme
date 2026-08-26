package repository

import (
	"database/sql"
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
