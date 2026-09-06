package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/db"
)

// This file owns the Postgres/MySQL compatibility helpers for the ticket
// repositories: placeholder rebinding ("?" -> "$N" on Postgres) and
// engine-portable INSERT id retrieval (pgx has no LastInsertId, so
// Postgres uses INSERT ... RETURNING id).
//
// The engine is resolved per repository: an explicit dialect (see
// NewTicketRepositoryWithDialect) wins; otherwise the live connection's
// driver type is sniffed so existing callers that construct a repository
// with only *sql.DB keep working unchanged. Unknown drivers default to
// the historical "?" + LastInsertId behaviour (SQLite/MySQL).

// detectEngine infers the engine name from the connection's driver type:
// modernc.org/sqlite reports *sqlite.Driver, pgx/v5/stdlib reports
// *stdlib.Driver, go-sql-driver/mysql reports *mysql.MySQLDriver.
func detectEngine(conn *sql.DB) string {
	if conn == nil {
		return "sqlite"
	}
	t := strings.ToLower(fmt.Sprintf("%T", conn.Driver()))
	switch {
	case strings.Contains(t, "mysql"):
		return "mysql"
	case strings.Contains(t, "pgx"), strings.Contains(t, "stdlib"), strings.Contains(t, "pq"):
		return "postgres"
	default:
		return "sqlite"
	}
}

// engineOf resolves the effective engine for a TicketRepository.
func (r *TicketRepository) engineOf() string {
	if r != nil && r.dialect != nil {
		return r.dialect.Name()
	}
	if r == nil || r.db == nil {
		return "sqlite"
	}
	return detectEngine(r.db)
}

// rebind rewrites "?" binds to the repository engine's placeholders.
// Pass every statement through it before Exec/QueryRow/Query.
func (r *TicketRepository) rebind(query string) string {
	return db.Rebind(r.engineOf(), query)
}

// execInsertGetID runs an INSERT and returns the new row id on any engine.
// Postgres appends RETURNING id and scans it (pgx returns only
// driver.RowsAffected, so LastInsertId always errors there); every other
// engine uses Exec + LastInsertId with the error propagated, never
// swallowed.
func (r *TicketRepository) execInsertGetID(query string, args ...any) (int64, error) {
	if r.engineOf() == "postgres" {
		var id int64
		if err := r.db.QueryRow(r.rebind(query+" RETURNING id"), args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	res, err := r.db.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// execInsertGetIDTx is the *sql.Tx variant for transactional creates.
func (r *TicketRepository) execInsertGetIDTx(tx *sql.Tx, query string, args ...any) (int64, error) {
	if r.engineOf() == "postgres" {
		var id int64
		if err := tx.QueryRow(r.rebind(query+" RETURNING id"), args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	res, err := tx.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// isMissingTableErr reports whether err is a "table does not exist"
// failure on any engine: "no such table" (SQLite), SQLSTATE 42P01 /
// "does not exist" (Postgres), 1146 / "doesn't exist" (MySQL). Used to
// keep optional sidecars (ticket_sla on pre-065 databases) at zero state
// while every other query error is propagated.
func isMissingTableErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "no such table"),
		strings.Contains(msg, "does not exist"),
		strings.Contains(msg, "doesn't exist"),
		strings.Contains(msg, "42p01"),
		strings.Contains(msg, "1146"):
		return true
	default:
		return false
	}
}
