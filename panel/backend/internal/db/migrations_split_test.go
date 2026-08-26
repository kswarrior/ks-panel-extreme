package db

import (
	"io/fs"
	"strings"
	"testing"
)

// TestSplitSQLStatementsAcrossEmbeddedMigrations feeds every shipped
// migration file of every dialect through the splitter and asserts the
// invariants the runner depends on: every statement is non-empty and no
// quote is left unbalanced (i.e. quoting was tracked to a matched end).
//
// This is the offline guard for the MySQL/pgx constraint that migrations must
// execute one statement at a time — go-sql-driver rejects multi-statement
// batches without multiStatements=true (Error 1064) and pgx's extended
// protocol rejects them when parameters are bound.
func TestSplitSQLStatementsAcrossEmbeddedMigrations(t *testing.T) {
	for _, dir := range []string{"migrations/sqlite", "migrations/mysql", "migrations/postgres"} {
		sub, err := fs.Sub(migrationsFS, dir)
		if err != nil {
			t.Fatalf("%s: %v", dir, err)
		}
		entries, err := fs.ReadDir(sub, ".")
		if err != nil {
			t.Fatalf("%s: %v", dir, err)
		}
		if len(entries) == 0 {
			t.Fatalf("%s: no migration files found", dir)
		}
		for _, e := range entries {
			body, err := fs.ReadFile(sub, e.Name())
			if err != nil {
				t.Fatalf("%s/%s: %v", dir, e.Name(), err)
			}
			stmts := splitSQLStatements(string(body))
			if len(stmts) == 0 {
				t.Errorf("%s/%s: split produced zero statements", dir, e.Name())
			}
			for i, s := range stmts {
				if strings.TrimSpace(s) == "" {
					t.Errorf("%s/%s stmt %d: empty", dir, e.Name(), i)
				}
				if !balancedQuotes(s) {
					t.Errorf("%s/%s stmt %d: unbalanced quotes: %q", dir, e.Name(), i, truncate(s))
				}
			}
		}
	}
}

// TestSplitSQLStatementsQuotingSemantics pins the exact cases that make the
// splitter safe for the shipped corpus.
func TestSplitSQLStatementsQuotingSemantics(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			"semicolon inside single-quoted literal",
			"INSERT INTO t VALUES ('a;b');SELECT 1;",
			[]string{"INSERT INTO t VALUES ('a;b')", "SELECT 1"},
		},
		{
			"escaped quote stays inside string",
			"INSERT INTO t VALUES ('it''s;fine');",
			[]string{"INSERT INTO t VALUES ('it''s;fine')"},
		},
		{
			"double-quoted identifier with semicolon",
			`CREATE TABLE "weird;name" (id INT);`,
			[]string{`CREATE TABLE "weird;name" (id INT)`},
		},
		{
			"backtick identifier with semicolon (MySQL)",
			"CREATE TABLE `weird;name` (`key` TEXT);",
			[]string{"CREATE TABLE `weird;name` (`key` TEXT)"},
		},
		{
			"line comment hides semicolon",
			"-- note; not a statement\nSELECT 1;",
			[]string{"-- note; not a statement\nSELECT 1"},
		},
		{
			"block comment hides semicolon",
			"/* a;b */SELECT 1;",
			[]string{"/* a;b */SELECT 1"},
		},
	}
	for _, tc := range cases {
		got := splitSQLStatements(tc.in)
		if len(got) != len(tc.want) {
			t.Errorf("%s: got %d statements %q, want %d %q", tc.name, len(got), got, len(tc.want), tc.want)
			continue
		}
		for i := range got {
			if strings.TrimSpace(got[i]) != tc.want[i] {
				t.Errorf("%s: stmt %d = %q, want %q", tc.name, i, got[i], tc.want[i])
			}
		}
	}
}

// TestTopoSortCreatesParentsFirst verifies 001-style files reorder so
// FK-referenced parents are created before their children — Postgres and
// MySQL validate inline REFERENCES targets at CREATE time and the shipped
// files declare users (→ roles) before roles exists.
func TestTopoSortCreatesParentsFirst(t *testing.T) {
	script := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY,
		role_id INTEGER NOT NULL,
		FOREIGN KEY (role_id) REFERENCES roles(id)
	);
	CREATE TABLE roles (id INTEGER PRIMARY KEY);
	CREATE INDEX idx_users_role ON users(role_id);
	`
	stmts := splitSQLStatements(script)
	var creates []*createTableRef
	for i, s := range stmts {
		if ct := parseCreateTable(s, i); ct != nil {
			creates = append(creates, ct)
		}
	}
	ordered, ok := topoSortCreates(creates)
	if !ok {
		t.Fatal("topoSortCreates reported an unresolvable graph")
	}
	if len(ordered) != 2 {
		t.Fatalf("got %d creates, want 2", len(ordered))
	}
	if ordered[0].name != "roles" || ordered[1].name != "users" {
		t.Errorf("order = [%s, %s], want [roles users]", ordered[0].name, ordered[1].name)
	}
}

func balancedQuotes(s string) bool {
	var sq, dq, bt bool
	rs := []rune(s)
	for i := 0; i < len(rs); i++ {
		switch rs[i] {
		case '\'':
			if !dq && !bt {
				if sq && i+1 < len(rs) && rs[i+1] == '\'' {
					i++
				} else {
					sq = !sq
				}
			}
		case '"':
			if !sq && !bt {
				dq = !dq
			}
		case '`':
			if !sq && !dq {
				bt = !bt
			}
		}
	}
	return !sq && !dq && !bt
}

func truncate(s string) string {
	if len(s) > 80 {
		return s[:80] + "..."
	}
	return s
}
