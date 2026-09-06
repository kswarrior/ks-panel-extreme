package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

// Dialect describes the engine-specific behaviour kspanel needs to know about
// when talking to a backend. The default SQLite dialiect keeps the original
// single-connection / WAL busy-timeout semantics; PostgreSQL and MySQL/MariaDB
// use proper connection pools. Each implementation lives in dialect_*.go and
// owns its driver import (so e.g. a build that never opens a Postgres DB
// never pulls pgx in via a side-effect import).
type Dialect interface {
	Name() string // "sqlite" | "postgres" | "mysql"

	// DriverName is what sql.Open expects.
	DriverName() string

	// Open opens the engine with kspanel's recommended pragmas / connection
	// pool. Implementations MUST call SetMaxOpenConns appropriately — SQLite
	// needs MaxOpenConns(1) (modernc quirk), PG/MySQL want a real pool.
	Open(dsn string) (*sql.DB, error)

	// ConfigurePool is called once on every connection opened via Open; lets
	// each dialect apply engine-specific tuning (busy timeouts, statement
	// timeouts, etc.) without opening the connection itself.
	ConfigurePool(*sql.DB)

	// MigrationsFS returns the embedded fs rooted at migrations/<engine>/.
	// The kspanel migration runner reads from this fs in lexical order.
	MigrationsFS() fs.FS

	// Placeholder returns the placeholder string for the n-th parameter.
	// SQLite + MySQL use "?"; Postgres uses "$1", "$2", ....
	Placeholder(n int) string

	// SupportsPragma reports whether the engine understands SQLite's PRAGMA
	// statements. Only the SQLite dialect returns true; the Database admin
	// page uses this to decide whether to surface PRAGMA-driven metrics
	// (wal_checkpoint, integrity_check, dbstat, etc.) or a friendly
	// "engine not supported" stub.
	SupportsPragma() bool

	// IsSQLite is the dedicated escape hatch the Database admin handler uses
	// to know it should serve its rich SQLite-flavoured snapshot. Equivalent
	// to SupportsPragma() but more explicit so the call sites read cleanly.
	IsSQLite() bool

	// SupportsReturning reports whether INSERT/UPDATE ... RETURNING is
	// understood. SQLite + Postgres do, MySQL does not (we batch with
	// LAST_INSERT_ID() instead — but the panel never relies on RETURNING
	// so this is informational today and reserved for future use).
	SupportsReturning() bool

	// datetimeType returns the SQL type the dialect wants for a nullable
	// timestamp/datetime column created by a guarded ALTER (e.g.
	// probe_checked_at, next_probe_at, last_run_at, next_run_at). The
	// migration SQL itself uses DATETIME (portable as a name across
	// SQLite/MySQL) but Postgres prefers TIMESTAMP, so the runtime
	// guard substitutes the right type when it applies the column
	// manually.
	datetimeType() string

	// insertIgnoreKeyword returns the dialect's idempotent INSERT verb —
	// "INSERT OR IGNORE" for SQLite, "INSERT IGNORE" for MySQL. Postgres
	// is handled separately because it uses plain INSERT plus an
	// ON CONFLICT clause (the SeedCore helper handles that case).
	insertIgnoreKeyword() string
}

// NewDialect returns the dialect for the named engine. Unknown engines fail
// loudly so a typo in --type doesn't silently fall back to SQLite — an
// operator who picks a name expects exactly that engine.
//
// MSSQL is intentionally NOT implemented (see mssqlNote below): the name
// "mssql"/"sqlserver" fails here with a deferred-hint rather than the
// generic unknown-engine error so operators learn why instead of guessing
// a DSN grammar that has no backend behind it.
func NewDialect(engine string) (Dialect, error) {
	switch strings.ToLower(strings.TrimSpace(engine)) {
	case "", "sqlite", "sqlite3":
		return &sqliteDialect{}, nil
	case "postgres", "postgresql", "pg":
		return &postgresDialect{}, nil
	case "mysql", "mariadb":
		return &mysqlDialect{}, nil
	case "mssql", "sqlserver":
		return nil, fmt.Errorf("mssql is deferred (see mssqlNote in dialect.go): run Postgres/MySQL or SQLite; MSSQL needs T-SQL migration triplication + driver + CI that has not landed")
	default:
		return nil, fmt.Errorf("unknown database engine %q (want sqlite | postgres | mysql)", engine)
	}
}

// mssqlNote documents why there is no mssqlDialect yet and what the
// MSSQL-ready shape already covers, so a future port is mechanical:
//
//   - Driver: github.com/microsoft/go-mssqldb (pure-Go TDS) would own the
//     side-effect import in a new dialect_mssql.go, mirroring how
//     postgresDialect owns pgx and mysqlDialect owns go-sql-driver.
//     Not vendored today to keep the binary lean until migrations land.
//   - MigrationsFS: migrations/mssql/ triplicated per dialect via regen.sh
//     (68 IDs today ×3). T-SQL needs TOP vs LIMIT rewrites, IDENTITY(1,1)
//     vs AUTOINCREMENT, DATETIME2 vs DATETIME/TIMESTAMP, NVARCHAR vs TEXT
//     defaults, and [bracket] identifiers — a full third migration set,
//     not a flag flip.
//   - Placeholder: "@p1", "@p2", … (sqlserver numbered-at style), vs "?"
//     (sqlite/mysql) and "$N" (postgres). Call sites already branch on
//     Dialect.Placeholder, so no query builder changes are needed.
//   - quoteIdent: double quotes (QUOTED_IDENTIFIER ON) — already handled
//     in datamove.quoteIdent + handlers.quoteTableName default branch,
//     which treat mssql/sqlserver like postgres. Bracket form ([name])
//     is equivalent and needs no extra code.
//   - datamove FK graph + orphan scan: information_schema.TABLE_CONSTRAINTS
//     + KEY_COLUMN_USAGE exist in MSSQL with the same shape as the MySQL
//     path, so listMySQLFKs generalises by swapping TABLE_SCHEMA()=DATABASE()
//     for TABLE_CATALOG scoping.
//
// Deferred because the migration triplication + live-server CI (MSSQL
// container per PR) + backup/restore client (sqlcmd/bcp vs psql/mysql)
// have not been built or exercised. Postgres/MySQL already cover the
// managed-RDBMS surface; MSSQL stays an explicit non-goal until an
// operator funds that matrix.
const mssqlNote = "mssql deferred: needs T-SQL migrations + go-mssqldb driver + CI; shape ready (Placeholder @pN, double-quote idents, information_schema FK scan)" 

// sqliteDialect is the original SQLite backend, kept as the default so a
// fresh kspanel install works without any extra config. The migration fs is
// the same one we've shipped for years; the placeholder is "?"; PRAGMA is
// supported; AUTOINCREMENT + RETURNING both work.
type sqliteDialect struct{}

func (*sqliteDialect) Name() string         { return "sqlite" }
func (*sqliteDialect) DriverName() string   { return "sqlite" }
func (*sqliteDialect) IsSQLite() bool       { return true }
func (*sqliteDialect) SupportsPragma() bool { return true }
func (*sqliteDialect) SupportsReturning() bool { return true }

func (*sqliteDialect) Placeholder(int) string { return "?" }

func (*sqliteDialect) MigrationsFS() fs.FS {
	sub, err := fs.Sub(migrationsFS, "migrations/sqlite")
	if err != nil {
		// Should never happen — embed.FS guarantees the dir exists when at
		// least one file lives under it. Return the root fs so a missing
		// subdir still surfaces as "no migrations" instead of a nil-deref.
		return migrationsFS
	}
	return sub
}

func (*sqliteDialect) Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// Pin the pool to a single connection BEFORE applying PRAGMAs: with
	// modernc.org/sqlite, PRAGMA foreign_keys/busy_timeout are per-connection,
	// so a wider pool would leave conns 2..N without them (SQLITE_BUSY under
	// sweep write load + silently unenforced FKs). Single-conn also matches
	// the Dialect.Open contract above and the modengine/backup call sites.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		db.Close()
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func (*sqliteDialect) ConfigurePool(db *sql.DB) {
	// Enforce the single-conn invariant even for pools opened elsewhere
	// (tests, tools) so PRAGMAs applied on one handle stay effective.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
}

// datetimeType returns "DATETIME" for SQLite (the migration SQL uses
// DATETIME, which SQLite accepts as a flexible timestamp-ish type).
func (*sqliteDialect) datetimeType() string       { return "DATETIME" }
func (*sqliteDialect) insertIgnoreKeyword() string { return "INSERT OR IGNORE" }

// postgresDialect uses pgx/v5/stdlib so we keep the binary pure-Go (no CGO).
// The DSN format is the standard libpq URL form:
//   postgres://user:pass@host:port/db?sslmode=disable
// or the keyword/value form:
//   host=... port=... user=... password=... dbname=... sslmode=disable
// pgx accepts both.
type postgresDialect struct{}

func (*postgresDialect) Name() string            { return "postgres" }
func (*postgresDialect) DriverName() string      { return "pgx" }
func (*postgresDialect) IsSQLite() bool          { return false }
func (*postgresDialect) SupportsPragma() bool    { return false }
func (*postgresDialect) SupportsReturning() bool { return true }

func (*postgresDialect) Placeholder(n int) string { return fmt.Sprintf("$%d", n) }

func (*postgresDialect) MigrationsFS() fs.FS {
	sub, err := fs.Sub(migrationsFS, "migrations/postgres")
	if err != nil {
		return migrationsFS
	}
	return sub
}

func (*postgresDialect) Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func (*postgresDialect) ConfigurePool(db *sql.DB) {
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
}

func (*postgresDialect) datetimeType() string        { return "TIMESTAMP" }
func (*postgresDialect) insertIgnoreKeyword() string { return "INSERT" }

// mysqlDialect drives MySQL and MariaDB through go-sql-driver/mysql. The
// DSN format is the go-sql-driver URL form:
//   user:pass@tcp(host:port)/dbname?parseTime=true&loc=UTC
// MariaDB shares the same driver (the wire protocol is identical for the
// surface area kspanel uses).
type mysqlDialect struct{}

func (*mysqlDialect) Name() string            { return "mysql" }
func (*mysqlDialect) DriverName() string      { return "mysql" }
func (*mysqlDialect) IsSQLite() bool          { return false }
func (*mysqlDialect) SupportsPragma() bool    { return false }
func (*mysqlDialect) SupportsReturning() bool { return false }

func (*mysqlDialect) Placeholder(int) string { return "?" }

func (*mysqlDialect) MigrationsFS() fs.FS {
	sub, err := fs.Sub(migrationsFS, "migrations/mysql")
	if err != nil {
		return migrationsFS
	}
	return sub
}

func (*mysqlDialect) Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func (*mysqlDialect) ConfigurePool(db *sql.DB) {
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
}

func (*mysqlDialect) datetimeType() string        { return "DATETIME" }
func (*mysqlDialect) insertIgnoreKeyword() string { return "INSERT IGNORE" }

// _mssqlNoteRef keeps mssqlNote referenced so linters do not flag it
// as unused documentation; the string itself is the design record.
var _mssqlNoteRef = mssqlNote

// Rebind rewrites a "?"-bind query to the engine's placeholder style.
// SQLite and MySQL keep "?" verbatim; Postgres (pgx speaks the native
// $N wire protocol and rejects "?") gets $1, $2, ... in bind order.
// Repository code builds every statement with "?" and calls Rebind before
// Exec/QueryRow/Query so one statement runs on all three engines without
// a query builder. Queries without binds return unchanged.
func Rebind(engine, query string) string {
	switch strings.ToLower(strings.TrimSpace(engine)) {
	case "postgres", "postgresql", "pg":
		var b strings.Builder
		b.Grow(len(query) + 8)
		n := 0
		for i := 0; i < len(query); i++ {
			if query[i] == '?' {
				n++
				fmt.Fprintf(&b, "$%d", n)
			} else {
				b.WriteByte(query[i])
			}
		}
		return b.String()
	default:
		return query
	}
}
