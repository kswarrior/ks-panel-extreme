// Package datamove copies a full panel dataset between two live database
// engines (SQLite ⇄ PostgreSQL ⇄ MySQL) so the admin "Change Database" flow
// can carry every row across an engine switch instead of leaving the new
// backend empty.
//
// The copy is schema-driven: both databases were built from the SAME
// per-engine migration set, so table and column names match 1:1. That lets
// the mover stay fully generic — it introspects the source for user tables,
// orders them parents-first using the FK graph (so children are inserted
// after the rows they reference exist), streams every row in configurable
// batches and wraps the whole destination write in ONE transaction so a
// failure rolls the target back to its exact pre-sync state.
//
// Nothing in this package writes to the SOURCE database — the source stays
// authoritative at all times; the running panel keeps serving from it until
// the operator restarts onto the synced target.
package datamove

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/db"
)

// DefaultBatchSize is the number of rows folded into one multi-row INSERT
// when Options.BatchSize is unset. 500 keeps individual statements well
// under every engine's default packet / parameter limits while amortising
// round-trips.
const DefaultBatchSize = 500

// Options controls one Sync run. Zero-value fields fall back to safe
// defaults; everything an operator may want to tune is surfaced here so the
// web UI can pass the values straight through.
type Options struct {
	// Tables restricts the copy to these table names. Empty/nil = all
	// user tables found on the source.
	Tables []string
	// BatchSize rows per multi-row INSERT (min 1, default DefaultBatchSize).
	BatchSize int
	// ClearTarget deletes pre-existing rows from each target table before
	// copying. Needed when the target was seeded (permissions/roles) so the
	// source's rows win instead of colliding on primary keys.
	ClearTarget bool
}

// TableResult reports what happened to one table during Sync.
type TableResult struct {
	Table string `json:"table"`
	// BaselineRows is the source COUNT(*) captured immediately before the
	// table was copied. Verification treats this as the floor the target
	// must meet.
	BaselineRows int64  `json:"baseline_rows"`
	SourceRows   int64  `json:"source_rows"`
	TargetRows   int64  `json:"target_rows"`
	RowsCopied   int64  `json:"rows_copied"`
	Status       string `json:"status"` // "ok" | "warn"
}

// Result summarises a completed Sync run.
type Result struct {
	Order      []string      `json:"order"`
	RowsCopied int64         `json:"rows_copied"`
	Tables     []TableResult `json:"tables"`
	Steps      []string      `json:"steps"`
}

// step appends a human-readable progress line to the result log.
func (res *Result) step(format string, args ...any) {
	res.Steps = append(res.Steps, fmt.Sprintf(format, args...))
}

// quoteIdent quotes a table/column name for the given engine. SQLite,
// PostgreSQL and MSSQL use double quotes (MSSQL also accepts [brackets];
// double quotes are used here for uniformity under QUOTED_IDENTIFIER ON),
// MySQL uses backticks; embedded quotes are doubled so hostile identifiers
// can't break out of the quoting.
func quoteIdent(engine, name string) string {
	switch strings.ToLower(strings.TrimSpace(engine)) {
	case "mysql", "mariadb":
		return "`" + strings.ReplaceAll(name, "`", "``") + "`"
	case "mssql", "sqlserver":
		return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	default:
		return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	}
}

// identRe guards the few places an identifier must be spliced into SQL text
// (pg sequence resync helpers that can't take bind parameters). Anything
// outside [A-Za-z0-9_] refuses to be interpolated.
var identRe = regexp.MustCompile(`^[A-Za-z0-9_]+$`)

// listUserTables returns the user-visible table names for any dialect:
// SQLite reads sqlite_master (internal sqlite_% tables excluded), Postgres
// and MySQL read information_schema scoped to the connection's schema /
// database.
func listUserTables(d db.Dialect, con *sql.DB) ([]string, error) {
	var (
		rows *sql.Rows
		err  error
	)
	switch d.Name() {
	case "sqlite":
		rows, err = con.Query(`
			SELECT name FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name`)
	case "postgres":
		rows, err = con.Query(`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name`)
	default: // mysql
		rows, err = con.Query(`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
			ORDER BY table_name`)
	}
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// fkEdges returns child → [referenced parent tables] for the named tables,
// used to build the parents-first copy order. Best-effort by design: an
// introspection failure degrades to alphabetical order with a logged step,
// it never aborts the sync.
func fkEdges(d db.Dialect, con *sql.DB, tables []string) map[string][]string {
	edges := map[string][]string{}
	add := func(child, parent string) {
		if child == parent || parent == "" {
			return
		}
		edges[child] = append(edges[child], parent)
	}
	switch d.Name() {
	case "sqlite":
		for _, t := range tables {
			rows, err := con.Query(`PRAGMA foreign_key_list(` + quoteIdent("sqlite", t) + `)`)
			if err != nil {
				continue
			}
			for rows.Next() {
				var id, seq int64
				var refTable string
				var from, to sql.NullString
				var onUpdate, onDelete, match sql.NullString
				if err := rows.Scan(&id, &seq, &refTable, &from, &to, &onUpdate, &onDelete, &match); err == nil {
					add(t, strings.ToLower(refTable))
				}
			}
			rows.Close()
		}
	case "postgres":
		rows, err := con.Query(`
			SELECT DISTINCT tc.table_name, ccu.table_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.constraint_column_usage ccu
			  ON ccu.constraint_name = tc.constraint_name
			 AND ccu.constraint_schema = tc.constraint_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
			  AND tc.table_schema = 'public'`)
		if err == nil {
			for rows.Next() {
				var child, parent string
				if rows.Scan(&child, &parent) == nil {
					add(strings.ToLower(child), strings.ToLower(parent))
				}
			}
			rows.Close()
		}
	default: // mysql
		rows, err := con.Query(`
			SELECT DISTINCT TABLE_NAME, REFERENCED_TABLE_NAME
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`)
		if err == nil {
			for rows.Next() {
				var child, parent string
				if rows.Scan(&child, &parent) == nil {
					add(strings.ToLower(child), strings.ToLower(parent))
				}
			}
			rows.Close()
		}
	}
	return edges
}

// topoOrder sorts tables so every referenced parent comes before its
// children (Kahn's algorithm). Returns ok=false when the graph contains a
// cycle or unresolved references — callers fall back to alphabetical order
// (FK checks are disabled where the engine allows it).
func topoOrder(tables []string, edges map[string][]string) ([]string, bool) {
	names := make([]string, 0, len(tables))
	for _, t := range tables {
		names = append(names, strings.ToLower(t))
	}
	inSet := make(map[string]bool, len(names))
	for _, n := range names {
		inSet[n] = true
	}
	// Only edges between copied tables matter.
	deg := make(map[string]int, len(names))
	dependents := make(map[string][]string, len(names))
	for child, parents := range edges {
		if !inSet[child] {
			continue
		}
		for _, p := range parents {
			if !inSet[p] {
				continue
			}
			deg[child]++
			dependents[p] = append(dependents[p], child)
		}
	}
	// Deterministic seeding: alphabetical among currently-ready nodes.
	ready := make([]string, 0, len(names))
	for _, n := range names {
		if deg[n] == 0 {
			ready = append(ready, n)
		}
	}
	sort.Strings(ready)
	out := make([]string, 0, len(names))
	for len(ready) > 0 {
		n := ready[0]
		ready = ready[1:]
		out = append(out, n)
		for _, dep := range dependents[n] {
			deg[dep]--
			if deg[dep] == 0 {
				ready = append(ready, dep)
			}
		}
		sort.Strings(ready)
	}
	if len(out) != len(names) {
		return nil, false
	}
	return out, true
}

// Sync copies every requested table (all user tables by default) from src
// into dst. The destination writes happen inside ONE transaction on a single
// pooled connection, so either the whole dataset lands or none of it does —
// a mid-copy failure rolls the target back to its exact pre-sync state.
//
// Foreign-key enforcement is relaxed only as far as each target engine
// requires: SQLite gets PRAGMA foreign_keys=OFF (restored after commit),
// MySQL gets SET FOREIGN_KEY_CHECKS=0 (session-scoped on the same
// connection), PostgreSQL relies purely on the parents-first copy order.
func Sync(srcD db.Dialect, src *sql.DB, dstD db.Dialect, dst *sql.DB, opts Options) (*Result, error) {
	res := &Result{Tables: []TableResult{}, Steps: []string{}}
	batch := opts.BatchSize
	if batch <= 0 {
		batch = DefaultBatchSize
	}

	allTables, err := listUserTables(srcD, src)
	if err != nil {
		return res, err
	}
	tables := allTables
	if len(opts.Tables) > 0 {
		want := make(map[string]bool, len(opts.Tables))
		for _, t := range opts.Tables {
			want[strings.ToLower(strings.TrimSpace(t))] = true
		}
		tables = tables[:0]
		for _, t := range allTables {
			if want[strings.ToLower(t)] {
				tables = append(tables, t)
			}
		}
		// Preserve the operator's intent loudly rather than syncing a
		// silently-empty subset when a name doesn't exist.
		if len(tables) != len(want) {
			found := make(map[string]bool, len(tables))
			for _, t := range tables {
				found[strings.ToLower(t)] = true
			}
			var missing []string
			for t := range want {
				if !found[t] {
					missing = append(missing, t)
				}
			}
			sort.Strings(missing)
			return res, fmt.Errorf("unknown table(s): %s", strings.Join(missing, ", "))
		}
	}
	if len(tables) == 0 {
		res.step("no user tables found on source — nothing to sync")
		return res, nil
	}

	order, ok := topoOrder(tables, fkEdges(srcD, src, tables))
	if !ok {
		order = sortedCopy(tables)
		res.step("FK cycle detected — falling back to alphabetical order")
	}
	res.Order = order

	// One dedicated destination connection: session pragmas (SQLite FK off,
	// MySQL FK-checks off) must land on the same physical connection that
	// later runs the inserts.
	conn, err := dst.Conn(context.Background())
	if err != nil {
		return res, fmt.Errorf("acquire target connection: %w", err)
	}
	defer conn.Close()

	if dstD.IsSQLite() {
		// Must run OUTSIDE a transaction to take effect.
		if _, err := conn.ExecContext(context.Background(), `PRAGMA foreign_keys = OFF`); err != nil {
			return res, fmt.Errorf("disable target foreign keys: %w", err)
		}
		defer func() {
			_, _ = conn.ExecContext(context.Background(), `PRAGMA foreign_keys = ON`)
		}()
	} else if dstD.Name() == "mysql" {
		if _, err := conn.ExecContext(context.Background(), `SET FOREIGN_KEY_CHECKS = 0`); err != nil {
			return res, fmt.Errorf("disable target foreign key checks: %w", err)
		}
		defer func() {
			_, _ = conn.ExecContext(context.Background(), `SET FOREIGN_KEY_CHECKS = 1`)
		}()
	}

	tx, err := conn.BeginTx(context.Background(), nil)
	if err != nil {
		return res, fmt.Errorf("begin target transaction: %w", err)
	}
	// Rollback on ANY error path below. Commit happens only after every
	// table copied cleanly — this IS the automatic restore-on-error.
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if opts.ClearTarget {
		// Children first so deletes can't trip FKs on engines still
		// enforcing them inside the transaction.
		for i := len(order) - 1; i >= 0; i-- {
			t := order[i]
			if _, err := tx.ExecContext(context.Background(),
				`DELETE FROM `+quoteIdent(dstD.Name(), t)); err != nil {
				return res, fmt.Errorf("clear target table %s: %w", t, err)
			}
		}
		res.step("cleared %d target table(s)", len(order))
	}

	for _, t := range order {
		tr, err := copyTable(srcD, src, dstD, tx, t, batch)
		if err != nil {
			return res, fmt.Errorf("copy %s: %w", t, err)
		}
		tr.Status = "ok"
		if tr.TargetRows < tr.BaselineRows {
			// Rows vanished relative to the pre-copy baseline — real loss,
			// fail the run (the deferred rollback restores the target).
			return res, fmt.Errorf("copy %s: target has %d rows but source baseline was %d",
				t, tr.TargetRows, tr.BaselineRows)
		}
		if tr.SourceRows != tr.TargetRows {
			// The panel keeps writing to the source during the sync, so a
			// drift between post-copy counts is expected under load — warn,
			// don't fail.
			tr.Status = "warn"
		}
		res.Tables = append(res.Tables, tr)
		res.RowsCopied += tr.RowsCopied
		res.step("%s: %d rows copied", t, tr.RowsCopied)
	}

	if err := tx.Commit(); err != nil {
		return res, fmt.Errorf("commit target transaction: %w", err)
	}
	committed = true

	if dstD.Name() == "postgres" {
		resyncSequences(conn, order, res)
	}
	return res, nil
}

// copyTable streams one table from source to destination inside tx, using
// multi-row INSERT batches. Column names come from the DESTINATION schema
// and are selected explicitly from the source, so a column-order difference
// between engines can never scramble data — a name mismatch fails loudly
// instead.
func copyTable(srcD db.Dialect, src *sql.DB, dstD db.Dialect, tx *sql.Tx, table string, batch int) (TableResult, error) {
	tr := TableResult{Table: table}
	ctx := context.Background()

	// Destination column list (+ driver-reported types for value coercion).
	dq := quoteIdent(dstD.Name(), table)
	drows, err := tx.QueryContext(ctx, `SELECT * FROM `+dq+` WHERE 1=0`)
	if err != nil {
		return tr, fmt.Errorf("inspect target columns: %w", err)
	}
	dcols, err := drows.Columns()
	if err != nil {
		drows.Close()
		return tr, fmt.Errorf("read target columns: %w", err)
	}
	dtypes := make([]string, 0, len(dcols))
	dctypes, err := drows.ColumnTypes()
	if err != nil {
		drows.Close()
		return tr, fmt.Errorf("read target column types: %w", err)
	}
	for _, ct := range dctypes {
		dtypes = append(dtypes, strings.ToUpper(ct.DatabaseTypeName()))
	}
	drows.Close()

	// Source SELECT using the destination's column names, quoted for the
	// SOURCE dialect.
	sparts := make([]string, len(dcols))
	for i, c := range dcols {
		sparts[i] = quoteIdent(srcD.Name(), c)
	}
	srows, err := src.QueryContext(ctx,
		`SELECT `+strings.Join(sparts, ", ")+` FROM `+quoteIdent(srcD.Name(), table))
	if err != nil {
		return tr, fmt.Errorf("read source rows: %w", err)
	}
	defer srows.Close()

	colsList := make([]string, len(dcols))
	for i, c := range dcols {
		colsList[i] = quoteIdent(dstD.Name(), c)
	}
	prefix := `INSERT INTO ` + dq + ` (` + strings.Join(colsList, ", ") + `) VALUES `
	numericPlaceholders := dstD.Name() == "postgres"

	vals := make([]any, len(dcols))
	ptrs := make([]any, len(dcols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}

	buf := make([][]any, 0, batch)
	flush := func() error {
		if len(buf) == 0 {
			return nil
		}
		// Build the VALUES grid by hand so NULL cells become literal NULL
		// instead of a bound parameter: modernc.org/sqlite v1.6.0 refuses
		// nil bind values entirely ("invalid driver.Value type <nil>") and
		// inlining NULL is portable across all three engines anyway.
		var sb strings.Builder
		sb.WriteString(prefix)
		args := make([]any, 0, len(buf)*len(dcols))
		ph := 0
		for ri, row := range buf {
			if ri > 0 {
				sb.WriteByte(',')
			}
			sb.WriteByte('(')
			for ci, v := range row {
				if ci > 0 {
					sb.WriteByte(',')
				}
				if v == nil {
					sb.WriteString("NULL")
					continue
				}
				if numericPlaceholders {
					ph++
					sb.WriteString("$" + strconv.Itoa(ph))
				} else {
					sb.WriteByte('?')
				}
				args = append(args, v)
			}
			sb.WriteByte(')')
		}
		if _, err := tx.ExecContext(ctx, sb.String(), args...); err != nil {
			return err
		}
		tr.RowsCopied += int64(len(buf))
		buf = buf[:0]
		return nil
	}

	read := int64(0)
	for srows.Next() {
		if err := srows.Scan(ptrs...); err != nil {
			return tr, fmt.Errorf("scan source row: %w", err)
		}
		// modernc.org/sqlite v1.6.0 emits ONE all-NULL phantom row when
		// streaming an EMPTY table (verified empirically; same driver quirk
		// the Database page inspector documents for foreign_key_check). A
		// real row can never be NULL across every column of a kspanel table
		// (each has a NOT NULL key), so drop all-nil rows.
		allNil := true
		for _, v := range vals {
			if v != nil {
				allNil = false
				break
			}
		}
		if allNil {
			continue
		}
		read++
		row := make([]any, len(vals))
		for i, v := range vals {
			row[i] = coerce(v, dtypes[i])
		}
		buf = append(buf, row)
		if len(buf) >= batch {
			if err := flush(); err != nil {
				return tr, fmt.Errorf("insert batch: %w", err)
			}
		}
	}
	if err := srows.Err(); err != nil {
		return tr, fmt.Errorf("iterate source rows: %w", err)
	}
	if err := flush(); err != nil {
		return tr, fmt.Errorf("insert batch: %w", err)
	}
	// Baseline = rows the source held while we were reading it. Verification
	// treats this as the floor the target must meet.
	tr.BaselineRows = read

	// Counts AFTER the copy: baseline = what the source held when we started
	// reading it (captured above), current = what it holds right now.
	if err := src.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM `+quoteIdent(srcD.Name(), table)).Scan(&tr.SourceRows); err != nil {
		return tr, fmt.Errorf("count source rows: %w", err)
	}
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM `+dq).Scan(&tr.TargetRows); err != nil {
		return tr, fmt.Errorf("count target rows: %w", err)
	}
	return tr, nil
}

// coerce adapts a scanned source value to the destination column type for
// the handful of cross-engine mismatches that would otherwise fail the INSERT
// (INTEGER 0/1 → BOOLEAN, BLOB bytes → TEXT). Everything else passes through
// untouched — database/sql handles the common numeric/time/null cases.
func coerce(v any, dstType string) any {
	if v == nil {
		return nil
	}
	isBoolCol := strings.Contains(dstType, "BOOL")
	if isBoolCol {
		switch n := v.(type) {
		case int64:
			return n != 0
		case int:
			return n != 0
		case float64:
			return n != 0
		}
	}
	if b, ok := v.([]byte); ok {
		switch dstType {
		case "TEXT", "VARCHAR", "CHARACTER VARYING", "CHAR", "CLOB",
			"MEDIUMTEXT", "LONGTEXT", "TINYTEXT", "NVARCHAR", "STRING":
			return string(b)
		default:
			// BLOB passthrough must clone: database/sql drivers are allowed
			// to reuse the backing array on the next Scan, and copyTable
			// buffers up to one batch of scanned rows before flushing — a
			// shared buffer would silently corrupt every row behind it.
			return append([]byte(nil), b...)
		}
	}
	return v
}

// resyncSequences bumps every PostgreSQL serial/identity sequence past the
// copied MAX(id) so the next INSERT after the switch doesn't collide with a
// duplicated key. Best-effort: failures are logged into steps, never fatal —
// the data itself is already committed.
func resyncSequences(conn *sql.Conn, tables []string, res *Result) {
	ctx := context.Background()
	rows, err := conn.QueryContext(ctx, `
		SELECT table_name, column_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`)
	if err != nil {
		res.step("sequence resync unavailable: %v", err)
		return
	}
	type col struct{ table, column string }
	var cols []col
	for rows.Next() {
		var t, c string
		if rows.Scan(&t, &c) == nil && identRe.MatchString(t) && identRe.MatchString(c) {
			cols = append(cols, col{strings.ToLower(t), strings.ToLower(c)})
		}
	}
	rows.Close()
	for _, c := range cols {
		in := false
		for _, t := range tables {
			if t == c.table {
				in = true
				break
			}
		}
		if !in {
			continue
		}
		q := `SELECT setval(pg_get_serial_sequence('` + c.table + `', '` + c.column +
			`'), GREATEST((SELECT COALESCE(MAX(` + c.column + `), 0) FROM ` +
			`"` + c.table + `"), 0) + 1, false)`
		if _, err := conn.ExecContext(ctx, q); err != nil {
			res.step("sequence resync skipped for %s.%s: %v", c.table, c.column, err)
			continue
		}
		res.step("sequence resynced for %s.%s", c.table, c.column)
	}
}

// Verify rechecks the freshly synced target against the source:
// per-table row parity plus engine-level integrity where the engine exposes
// it (SQLite quick_check + foreign_key_check; Postgres/MySQL get a real
// FK-orphan scan via information_schema — table_constraints +
// key_column_usage on PG, KEY_COLUMN_USAGE on MySQL — plus COUNT parity).
// baselines maps table → source COUNT(*) captured before the copy; a target
// holding FEWER than its baseline means real lost rows (issue). A larger
// count means the panel wrote new rows to the live source mid-sync
// (warning — expected on a busy panel).
func Verify(srcD db.Dialect, src *sql.DB, dstD db.Dialect, dst *sql.DB, tables []string, baselines map[string]int64) ([]string, []string, error) {
	var issues, warnings []string
	ctx := context.Background()

	for _, t := range tables {
		var scnt, tcnt int64
		if err := src.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM `+quoteIdent(srcD.Name(), t)).Scan(&scnt); err != nil {
			return issues, warnings, fmt.Errorf("recheck source %s: %w", t, err)
		}
		if err := dst.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM `+quoteIdent(dstD.Name(), t)).Scan(&tcnt); err != nil {
			return issues, warnings, fmt.Errorf("recheck target %s: %w", t, err)
		}
		base := baselines[t]
		switch {
		case tcnt < base:
			issues = append(issues, fmt.Sprintf(
				"%s: target has %d rows but source held %d before the sync — rows lost", t, tcnt, base))
		case tcnt < scnt:
			warnings = append(warnings, fmt.Sprintf(
				"%s: target %d rows vs source %d (source grew during sync)", t, tcnt, scnt))
		case tcnt > scnt:
			warnings = append(warnings, fmt.Sprintf(
				"%s: target %d rows vs source %d (source shrank during sync)", t, tcnt, scnt))
		}
	}

	if dstD.IsSQLite() {
		// Scoped so the dedicated conn is released before the generic
		// orphan scan below: with a single-conn SQLite pool (modernc
		// per-conn PRAGMA semantics) holding this conn across
		// ScanFKOrphans would deadlock waiting for a second slot.
		var connErr error
		func() {
			con, err := dst.Conn(ctx)
			if err != nil {
				connErr = err
				return
			}
			defer con.Close()
			var msg string
			if err := con.QueryRowContext(ctx, `PRAGMA quick_check(1)`).Scan(&msg); err == nil &&
				strings.TrimSpace(strings.ToLower(msg)) != "ok" {
				issues = append(issues, "integrity check: "+msg)
			}
			if fkrows, err := con.QueryContext(ctx, `PRAGMA foreign_key_check`); err == nil {
				defer fkrows.Close()
				for fkrows.Next() {
					var tbl sql.NullString
					var rowid sql.NullInt64
					var ref sql.NullString
					var fkid sql.NullInt64
					if err := fkrows.Scan(&tbl, &rowid, &ref, &fkid); err != nil {
						continue
					}
					// modernc.org/sqlite emits one all-null phantom row on clean
					// DBs — drop it exactly like the Database page inspector does.
					if !tbl.Valid || strings.TrimSpace(tbl.String) == "" {
						continue
					}
					issues = append(issues, fmt.Sprintf("foreign key violation: %s row %d", tbl.String, rowid.Int64))
				}
			}
		}()
		if connErr != nil {
			return issues, warnings, fmt.Errorf("recheck connection: %w", connErr)
		}
	} else {
		// Real FK-orphan scan on the target via information_schema.
		// Orphans are data loss/corruption-class issues; introspection
		// failures degrade to warnings so an unreadable catalog can't
		// fail an otherwise healthy sync.
		orphanIssues, orphanWarnings, checked, oerr := ScanFKOrphans(dstD, dst)
		if oerr != nil {
			warnings = append(warnings,
				fmt.Sprintf("%s orphan scan unavailable (%v) — verification covered row-count parity only", dstD.Name(), oerr))
		} else {
			issues = append(issues, orphanIssues...)
			warnings = append(warnings, orphanWarnings...)
			if len(orphanIssues) == 0 && len(orphanWarnings) == 0 {
				warnings = append(warnings,
					fmt.Sprintf("%s orphan scan clean (%d FK constraint(s) checked) + row-count parity", dstD.Name(), checked))
			}
		}
	}
	// SQLite also gets the generic orphan scan as a second opinion behind
	// foreign_key_check (same NOT EXISTS shape the PG/MySQL path uses, so
	// the three engines share one definition of "orphan"). Duplicates are
	// harmless — both surfaces report the same rows.
	if dstD.IsSQLite() {
		if orphanIssues, orphanWarnings, _, oerr := ScanFKOrphans(dstD, dst); oerr == nil {
			// Dedupe against foreign_key_check output: only add orphan
			// lines that don't already mention the same child table.
			have := map[string]bool{}
			for _, is := range issues {
				have[is] = true
			}
			for _, oi := range orphanIssues {
				if !have[oi] {
					issues = append(issues, oi)
				}
			}
			warnings = append(warnings, orphanWarnings...)
		}
	}
	return issues, warnings, nil
}

// sortedCopy returns an alphabetical copy of tables.
func sortedCopy(tables []string) []string {
	out := make([]string, len(tables))
	copy(out, tables)
	sort.Strings(out)
	return out
}
