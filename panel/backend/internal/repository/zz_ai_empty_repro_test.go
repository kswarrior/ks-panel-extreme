package repository

import (
	"database/sql"
	"os"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// Repro: List / LastMessages against EMPTY tables using the real 066 schema.
func TestZZAIEmptyTables(t *testing.T) {
	raw, err := os.ReadFile("../db/migrations/sqlite/066_ai_persistence.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL)`); err != nil {
		t.Fatalf("users: %v", err)
	}
	// Apply only DDL (skip settings INSERTs — no settings table here).
	for _, stmt := range splitStmts(string(raw)) {
		up := strings.ToUpper(strings.TrimSpace(stmt))
		if !strings.HasPrefix(up, "CREATE TABLE") && !strings.HasPrefix(up, "CREATE INDEX") {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("exec %q: %v", stmt[:40], err)
		}
	}
	if _, err := db.Exec(`INSERT INTO users (id, username) VALUES (1, 'alice')`); err != nil {
		t.Fatal(err)
	}
	repo := NewAIThreadRepository(db)
	list, err := repo.List(1)
	if err != nil {
		t.Fatalf("List on empty: %v", err)
	}
	t.Logf("List on empty ok: %+v", list)
	th, err := repo.Create(1, "t")
	if err != nil {
		t.Fatal(err)
	}
	msgs, err := repo.LastMessages(1, th, 50)
	if err != nil {
		t.Fatalf("LastMessages on empty: %v", err)
	}
	t.Logf("LastMessages on empty ok: %+v", msgs)
}

func splitStmts(s string) []string {
	var out []string
	cur := ""
	for _, line := range strings.Split(s, "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "--") {
			continue
		}
		cur += line + "\n"
		if strings.HasSuffix(t, ";") {
			out = append(out, cur)
			cur = ""
		}
	}
	return out
}
