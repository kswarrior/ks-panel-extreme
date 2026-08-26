package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"strconv"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/stdlib"
)

// The repository layer writes every query with "?" placeholders (the
// SQLite/MySQL convention). pgx's stdlib driver passes SQL through to the
// server verbatim and PostgreSQL only accepts "$1, $2, ..." ordinal
// placeholders — so without rewriting, every parameterized query fails on
// Postgres. Rewriting each call site is not viable (~27 repo files), so the
// rewrite happens here, once, at the driver boundary: "pgxrebind" wraps
// "pgx" and renumbers every "?" that sits outside string/comment context
// into sequential "$n" ordinals before the statement reaches pgx.
//
// Literal "$n" placeholders that already exist in a query (the migration
// runner and SeedCore build some) pass through untouched; mixing both
// styles in one query is not something the codebase does.

const pgxRebindDriverName = "pgxrebind"

var registerRebindOnce sync.Once

// registerPgxRebindDriver registers the wrapped pgx driver exactly once.
// sql.Register panics on duplicate names, hence the guard.
func registerPgxRebindDriver() {
	registerRebindOnce.Do(func() {
		sql.Register(pgxRebindDriverName, &rebindDriver{inner: &stdlib.Driver{}})
	})
}

type rebindDriver struct {
	inner driver.Driver
}

func (d *rebindDriver) Open(name string) (driver.Conn, error) {
	conn, err := d.inner.Open(name)
	if err != nil {
		return nil, err
	}
	return &rebindConn{inner: conn}, nil
}

type rebindConn struct {
	inner driver.Conn
}

func (c *rebindConn) Prepare(query string) (driver.Stmt, error) {
	stmt, err := c.inner.Prepare(rebindPostgres(query))
	if err != nil {
		return nil, err
	}
	return &rebindStmt{inner: stmt}, nil
}

func (c *rebindConn) Close() error { return c.inner.Close() }

func (c *rebindConn) Begin() (driver.Tx, error) { return c.inner.Begin() }

func (c *rebindConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if bt, ok := c.inner.(driver.ConnBeginTx); ok {
		return bt.BeginTx(ctx, opts)
	}
	return c.inner.Begin()
}

func (c *rebindConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	if pc, ok := c.inner.(driver.ConnPrepareContext); ok {
		stmt, err := pc.PrepareContext(ctx, rebindPostgres(query))
		if err != nil {
			return nil, err
		}
		return &rebindStmt{inner: stmt}, nil
	}
	return c.Prepare(query)
}

func (c *rebindConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if ec, ok := c.inner.(driver.ExecerContext); ok {
		return ec.ExecContext(ctx, rebindPostgres(query), args)
	}
	stmt, err := c.PrepareContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer stmt.Close()
	return execStmtContext(stmt, args)
}

func (c *rebindConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if qc, ok := c.inner.(driver.QueryerContext); ok {
		return qc.QueryContext(ctx, rebindPostgres(query), args)
	}
	stmt, err := c.PrepareContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer stmt.Close()
	rows, err := queryStmtContext(stmt, args)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// ResetSession forwards driver.SessionResetter when the inner connection
// supports it so pool health checks keep working.
func (c *rebindConn) ResetSession(ctx context.Context) error {
	if rs, ok := c.inner.(driver.SessionResetter); ok {
		return rs.ResetSession(ctx)
	}
	return driver.ErrSkip
}

// IsValid forwards driver.Validator when the inner connection supports it.
func (c *rebindConn) IsValid() bool {
	if v, ok := c.inner.(driver.Validator); ok {
		return v.IsValid()
	}
	return true
}

type rebindStmt struct {
	inner driver.Stmt
}

func (s *rebindStmt) Close() error  { return s.inner.Close() }
func (s *rebindStmt) NumInput() int { return s.inner.NumInput() }

func (s *rebindStmt) Exec(args []driver.Value) (driver.Result, error) { return s.inner.Exec(args) }
func (s *rebindStmt) Query(args []driver.Value) (driver.Rows, error)  { return s.inner.Query(args) }

func (s *rebindStmt) ExecContext(ctx context.Context, args []driver.NamedValue) (driver.Result, error) {
	return execStmtContext(s.inner, args)
}

func (s *rebindStmt) QueryContext(ctx context.Context, args []driver.NamedValue) (driver.Rows, error) {
	return queryStmtContext(s.inner, args)
}

func execStmtContext(stmt driver.Stmt, args []driver.NamedValue) (driver.Result, error) {
	if sec, ok := stmt.(driver.StmtExecContext); ok {
		return sec.ExecContext(context.Background(), args)
	}
	values := namedValuesToValues(args)
	return stmt.Exec(values)
}

func queryStmtContext(stmt driver.Stmt, args []driver.NamedValue) (driver.Rows, error) {
	if sqc, ok := stmt.(driver.StmtQueryContext); ok {
		return sqc.QueryContext(context.Background(), args)
	}
	values := namedValuesToValues(args)
	rows, err := stmt.Query(values)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func namedValuesToValues(args []driver.NamedValue) []driver.Value {
	if len(args) == 0 {
		return nil
	}
	out := make([]driver.Value, len(args))
	for i, a := range args {
		out[i] = a.Value
	}
	return out
}

// rebindPostgres rewrites "?" placeholders into "$1..$N" ordinals. A "?"
// inside a single-quoted string (with '' escapes), double-quoted identifier,
// -- line comment or /* */ block comment is left alone, because there it is
// data, not a placeholder. Existing "$n" tokens are preserved verbatim and
// the ordinal counter starts above the highest one so a query that mixes
// both styles cannot collide.
func rebindPostgres(query string) string {
	var (
		out     strings.Builder
		n       int
		inSq    bool // '...'
		inDq    bool // "..."
		inLine  bool // -- comment
		inBlock bool // /* comment */
	)
	writeOrdinal := func() {
		// Consume "$<digits>" verbatim and keep the counter above it.
		j := i + 1
		val := 0
		for j < len(runes) && runes[j] >= '0' && runes[j] <= '9' {
			val = val*10 + int(runes[j]-'0')
			j++
		}
		if j > i+1 { // at least one digit
			if val > n {
				n = val
			}
			out.WriteString(string(runes[i:j]))
			i = j - 1
			return
		}
		out.WriteRune('$')
	}
	runes := []rune(query)
	for i := 0; i < len(runes); i++ {
		c := runes[i]
		switch {
		case inLine:
			if c == '\n' {
				inLine = false
			}
			out.WriteRune(c)
		case inBlock:
			if c == '*' && i+1 < len(runes) && runes[i+1] == '/' {
				inBlock = false
				out.WriteRune(c)
				i++
				out.WriteRune('/')
				continue
			}
			out.WriteRune(c)
		case inSq:
			if c == '\'' {
				if i+1 < len(runes) && runes[i+1] == '\'' { // '' escape
					out.WriteRune(c)
					i++
					out.WriteRune('\'')
					continue
				}
				inSq = false
			}
			out.WriteRune(c)
		case inDq:
			if c == '"' {
				if i+1 < len(runes) && runes[i+1] == '"' { // "" escape
					out.WriteRune(c)
					i++
					out.WriteRune('"')
					continue
				}
				inDq = false
			}
			out.WriteRune(c)
		case c == '\'':
			inSq = true
			out.WriteRune(c)
		case c == '"':
			inDq = true
			out.WriteRune(c)
		case c == '-' && i+1 < len(runes) && runes[i+1] == '-':
			inLine = true
			out.WriteString("--")
			i++
		case c == '/' && i+1 < len(runes) && runes[i+1] == '*':
			inBlock = true
			out.WriteString("/*")
			i++
		case c == '$':
			writeOrdinal()
		case c == '?':
			n++
			out.WriteString("$")
			out.WriteString(strconv.Itoa(n))
		default:
			out.WriteRune(c)
		}
	}
	return out.String()
}
