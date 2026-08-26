package repository

import (
	"database/sql"
	"fmt"
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

// qKey returns the settings/instance_secrets column name for "key", quoted
// for engines that reject it unquoted in DML. MySQL's grammar accepts KEY as
// a column definition but not inside INSERT column lists or WHERE clauses.
func qKey() string {
	if engineName() == "mysql" {
		return "`key`"
	}
	return "key"
}

// upsertSet builds the dialect-appropriate upsert suffix that follows an
// INSERT ... VALUES clause. conflictTarget is the unique constraint's
// column list including parentheses, e.g. "(instance_id, key)". Every name
// in cols is overwritten from the VALUES row ("excluded.col" on
// SQLite/Postgres, "VALUES(col)" on MySQL); extraSets are appended verbatim
// so callers can bump timestamps ("updated_at = CURRENT_TIMESTAMP").
//
// Without this, the PostgreSQL-flavoured ON CONFLICT clauses previously
// hardcoded at the call sites were syntax errors on MySQL — every settings,
// heartbeat, secret, theme and authority write failed on that engine.
func upsertSet(conflictTarget string, cols []string, extraSets ...string) string {
	mysql := engineName() == "mysql"
	sets := make([]string, 0, len(cols)+len(extraSets))
	for _, c := range cols {
		if mysql {
			sets = append(sets, fmt.Sprintf("%s = VALUES(%s)", c, c))
		} else {
			sets = append(sets, fmt.Sprintf("%s = excluded.%s", c, c))
		}
	}
	sets = append(sets, extraSets...)
	if mysql {
		return " ON DUPLICATE KEY UPDATE " + strings.Join(sets, ", ")
	}
	return " ON CONFLICT" + conflictTarget + " DO UPDATE SET " + strings.Join(sets, ", ")
}
