package datamove

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"github.com/example/kspanel/internal/db"
)

// fkCol pairs one child column with its referenced parent column.
type fkCol struct {
	Child  string
	Parent string
}

// fkConstraint is one FOREIGN KEY constraint (single- or multi-column).
// Name is the constraint name where the engine exposes one (PG/MySQL) or
// "table#id" for SQLite's PRAGMA grouping.
type fkConstraint struct {
	Name   string
	Child  string
	Parent string
	Cols   []fkCol
}

// listFKConstraints discovers every FOREIGN KEY via the engine's
// information_schema surface (PG: table_constraints+key_column_usage,
// MySQL: KEY_COLUMN_USAGE) or SQLite's PRAGMA foreign_key_list.
// Best-effort: introspection failure returns an error the caller turns
// into a warning — it never fabricates constraints.
func listFKConstraints(d db.Dialect, con *sql.DB) ([]fkConstraint, error) {
	switch d.Name() {
	case "sqlite":
		return listSQLiteFKs(con)
	case "postgres":
		return listPostgresFKs(con)
	case "mysql", "mariadb":
		return listMySQLFKs(con)
	default:
		return nil, fmt.Errorf("orphan scan unsupported for engine %q", d.Name())
	}
}

func listSQLiteFKs(con *sql.DB) ([]fkConstraint, error) {
	d, derr := db.NewDialect("sqlite")
	if derr != nil {
		return nil, derr
	}
	tables, lerr := listUserTables(d, con)
	if lerr != nil {
		return nil, lerr
	}
	var out []fkConstraint
	for _, t := range tables {
		rows, err := con.Query(`PRAGMA foreign_key_list(` + quoteIdent("sqlite", t) + `)`)
		if err != nil {
			continue
		}
		// Group by FK id for composite keys.
		groups := map[int64]*fkConstraint{}
		var order []int64
		for rows.Next() {
			var id, seq int64
			var refTable string
			var from, to sql.NullString
			var onUpdate, onDelete, match sql.NullString
			if err := rows.Scan(&id, &seq, &refTable, &from, &to, &onUpdate, &onDelete, &match); err != nil {
				continue
			}
			if refTable == "" || !from.Valid || !to.Valid || from.String == "" || to.String == "" {
				continue
			}
			g, ok := groups[id]
			if !ok {
				g = &fkConstraint{
					Name:   fmt.Sprintf("%s#%d", t, id),
					Child:  t,
					Parent: refTable,
				}
				groups[id] = g
				order = append(order, id)
			}
			g.Cols = append(g.Cols, fkCol{Child: from.String, Parent: to.String})
		}
		rows.Close()
		if rerr := rows.Err(); rerr != nil {
			continue
		}
		sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
		for _, id := range order {
			g := groups[id]
			if g.Parent == "" || len(g.Cols) == 0 {
				continue
			}
			out = append(out, *g)
		}
	}
	return out, nil
}

func listPostgresFKs(con *sql.DB) ([]fkConstraint, error) {
	rows, err := con.Query(`
		SELECT tc.constraint_name, tc.table_name, kcu.column_name,
		       ccu.table_name, ccu.column_name, kcu.ordinal_position
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON kcu.constraint_name = tc.constraint_name
		 AND kcu.constraint_schema = tc.constraint_schema
		 AND kcu.table_name = tc.table_name
		JOIN information_schema.constraint_column_usage ccu
		  ON ccu.constraint_name = tc.constraint_name
		 AND ccu.constraint_schema = tc.constraint_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_schema = 'public'
		ORDER BY tc.constraint_name, kcu.ordinal_position`)
	if err != nil {
		return nil, fmt.Errorf("list postgres FKs: %w", err)
	}
	defer rows.Close()
	type key struct{ name, child string }
	groups := map[key]*fkConstraint{}
	var order []key
	for rows.Next() {
		var cname, child, childCol, parent, parentCol string
		var ord sql.NullInt64
		if err := rows.Scan(&cname, &child, &childCol, &parent, &parentCol, &ord); err != nil {
			continue
		}
		if child == "" || parent == "" || childCol == "" || parentCol == "" {
			continue
		}
		k := key{cname, child}
		g, ok := groups[k]
		if !ok {
			g = &fkConstraint{Name: cname, Child: child, Parent: parent}
			groups[k] = g
			order = append(order, k)
		}
		// Guard against the information_schema cross-product on composite
		// keys producing duplicate pairs: keep first occurrence of each
		// child column.
		dup := false
		for _, c := range g.Cols {
			if c.Child == childCol {
				dup = true
				break
			}
		}
		if !dup {
			g.Cols = append(g.Cols, fkCol{Child: childCol, Parent: parentCol})
		}
		// Parent side of a composite may legitimately repeat the same
		// parent table with different columns; the child-col dedupe above
		// keeps the pairing 1:1 in ordinal order.
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate postgres FKs: %w", err)
	}
	out := make([]fkConstraint, 0, len(order))
	for _, k := range order {
		g := groups[k]
		if len(g.Cols) == 0 {
			continue
		}
		out = append(out, *g)
	}
	return out, nil
}

func listMySQLFKs(con *sql.DB) ([]fkConstraint, error) {
	rows, err := con.Query(`
		SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
		       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
		FROM information_schema.KEY_COLUMN_USAGE
		WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
		ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`)
	if err != nil {
		return nil, fmt.Errorf("list mysql FKs: %w", err)
	}
	defer rows.Close()
	type key struct{ name, child string }
	groups := map[key]*fkConstraint{}
	var order []key
	for rows.Next() {
		var cname, child, childCol, parent, parentCol string
		var ord sql.NullInt64
		if err := rows.Scan(&cname, &child, &childCol, &parent, &parentCol, &ord); err != nil {
			continue
		}
		if child == "" || parent == "" || childCol == "" || parentCol == "" {
			continue
		}
		k := key{cname, child}
		g, ok := groups[k]
		if !ok {
			g = &fkConstraint{Name: cname, Child: child, Parent: parent}
			groups[k] = g
			order = append(order, k)
		}
		g.Cols = append(g.Cols, fkCol{Child: childCol, Parent: parentCol})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate mysql FKs: %w", err)
	}
	out := make([]fkConstraint, 0, len(order))
	for _, k := range order {
		g := groups[k]
		if len(g.Cols) == 0 {
			continue
		}
		out = append(out, *g)
	}
	return out, nil
}



// countOrphans returns the number of child rows whose FK columns are all
// NOT NULL yet have no matching parent row. NULL child columns are never
// orphans (SQL treats a NULL FK part as "not checked").
func countOrphans(ctx context.Context, engine string, con *sql.DB, fk fkConstraint) (int64, error) {
	if len(fk.Cols) == 0 || fk.Child == "" || fk.Parent == "" {
		return 0, fmt.Errorf("empty FK constraint")
	}
	childQ := quoteIdent(engine, fk.Child)
	parentQ := quoteIdent(engine, fk.Parent)
	var sb strings.Builder
	sb.WriteString(`SELECT COUNT(*) FROM ` + childQ + ` AS c WHERE `)
	for i, col := range fk.Cols {
		if i > 0 {
			sb.WriteString(` AND `)
		}
		sb.WriteString(`c.` + quoteIdent(engine, col.Child) + ` IS NOT NULL`)
	}
	sb.WriteString(` AND NOT EXISTS (SELECT 1 FROM ` + parentQ + ` AS p WHERE `)
	for i, col := range fk.Cols {
		if i > 0 {
			sb.WriteString(` AND `)
		}
		sb.WriteString(`p.` + quoteIdent(engine, col.Parent) + ` = c.` + quoteIdent(engine, col.Child))
	}
	sb.WriteString(`)`)
	var n int64
	if err := con.QueryRowContext(ctx, sb.String()).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// ScanFKOrphans checks every FOREIGN KEY on con and reports orphaned rows
// as issue strings ("fk orphan: child.col → parent.col: N row(s)").
// checked is the number of constraints successfully probed. Introspection
// failure returns err (caller turns it into a warning); per-constraint
// COUNT failures become warnings, never issues, so one unreadable table
// can't fail the whole verification.
func ScanFKOrphans(d db.Dialect, con *sql.DB) (issues []string, warnings []string, checked int, err error) {
	ctx := context.Background()
	fks, lerr := listFKConstraints(d, con)
	if lerr != nil {
		return nil, nil, 0, lerr
	}
	for _, fk := range fks {
		n, cerr := countOrphans(ctx, d.Name(), con, fk)
		if cerr != nil {
			warnings = append(warnings, fmt.Sprintf("orphan scan skipped for %s: %v", fk.Child, cerr))
			continue
		}
		checked++
		if n > 0 {
			cols := make([]string, 0, len(fk.Cols))
			for _, c := range fk.Cols {
				cols = append(cols, c.Child+"→"+c.Parent)
			}
			issues = append(issues, fmt.Sprintf("fk orphan: %s(%s) → %s: %d orphan row(s)",
				fk.Child, strings.Join(cols, ", "), fk.Parent, n))
		}
	}
	return issues, warnings, checked, nil
}
