package datamove

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

// openTestDB brings up a real SQLite database with the full kspanel schema
// (migrations + idempotent seed) in a temp path.
func openTestDB(t *testing.T, name string) (*sql.DB, db.Dialect) {
	t.Helper()
	d, err := db.NewDialect("sqlite")
	if err != nil {
		t.Fatalf("dialect: %v", err)
	}
	path := filepath.Join(t.TempDir(), name)
	con, _, err := db.Open(config.DBConfig{Engine: "sqlite", DSN: path})
	if err != nil {
		t.Fatalf("open %s: %v", name, err)
	}
	if err := db.EnsureSchemaAndSeed(d, con); err != nil {
		t.Fatalf("schema+seed %s: %v", name, err)
	}
	return con, d
}

func TestTopoOrderParentsFirst(t *testing.T) {
	tables := []string{"users", "role_permissions", "roles", "permissions"}
	edges := map[string][]string{
		"users":            {"roles"},
		"role_permissions": {"roles", "permissions"},
	}
	got, ok := topoOrder(tables, edges)
	if !ok {
		t.Fatal("expected acyclic order")
	}
	pos := map[string]int{}
	for i, n := range got {
		pos[n] = i
	}
	for child, parents := range edges {
		for _, p := range parents {
			if pos[child] <= pos[p] {
				t.Fatalf("%s must come after parent %s (order: %v)", child, p, got)
			}
		}
	}
	if len(got) != len(tables) {
		t.Fatalf("order lost tables: %v", got)
	}
}

func TestTopoOrderCycleFallsBack(t *testing.T) {
	_, ok := topoOrder([]string{"a", "b"}, map[string][]string{
		"a": {"b"},
		"b": {"a"},
	})
	if ok {
		t.Fatal("cycle should be reported as unresolvable")
	}
}

func TestSyncCopiesAllRowsAndVerifies(t *testing.T) {
	src, srcD := openTestDB(t, "src.db")
	defer src.Close()
	dst, dstD := openTestDB(t, "dst.db")
	defer dst.Close()

	// Real rows with FK relationships: role → users.
	if _, err := src.Exec(`INSERT INTO roles (name, description) VALUES ('moved-role', 'x')`); err != nil {
		t.Fatalf("seed role: %v", err)
	}
	var roleID int64
	if err := src.QueryRow(`SELECT id FROM roles WHERE name='moved-role'`).Scan(&roleID); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 7; i++ {
		if _, err := src.Exec(
			`INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, 'h', ?)`,
			"u"+string(rune('a'+i)), "u"+string(rune('a'+i))+"@t.local", roleID); err != nil {
			t.Fatalf("seed user: %v", err)
		}
	}

	res, err := Sync(srcD, src, dstD, dst, Options{ClearTarget: true})
	if err != nil {
		t.Fatalf("sync: %v steps=%v", err, res.Steps)
	}
	if res.RowsCopied == 0 {
		t.Fatal("expected rows to be copied")
	}

	// Every copied table must land with at least its baseline row count.
	for _, tr := range res.Tables {
		if tr.TargetRows < tr.BaselineRows {
			t.Errorf("table %s: target %d < baseline %d", tr.Table, tr.TargetRows, tr.BaselineRows)
		}
		if tr.Status != "ok" && tr.Status != "warn" {
			t.Errorf("table %s: unexpected status %q", tr.Table, tr.Status)
		}
	}

	// Baselines = source counts captured during the copy.
	baselines := make(map[string]int64, len(res.Tables))
	for _, tr := range res.Tables {
		baselines[tr.Table] = tr.BaselineRows
	}
	issues, _, verr := Verify(srcD, src, dstD, dst, res.Order, baselines)
	if verr != nil {
		t.Fatalf("verify error: %v", verr)
	}
	if len(issues) != 0 {
		t.Errorf("unexpected verify issues: %v", issues)
	}

	// Spot-check copied rows actually made it across with relationships intact.
	var n int
	if err := dst.QueryRow(`SELECT COUNT(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='moved-role'`).Scan(&n); err != nil {
		t.Fatalf("join query on target: %v", err)
	}
	if n != 7 {
		t.Fatalf("expected 7 moved users on target, got %d", n)
	}
}

func TestSyncUnknownTableIsAnError(t *testing.T) {
	src, srcD := openTestDB(t, "src2.db")
	defer src.Close()
	dst, dstD := openTestDB(t, "dst2.db")
	defer dst.Close()

	if _, err := Sync(srcD, src, dstD, dst, Options{Tables: []string{"nope"}, ClearTarget: true}); err == nil {
		t.Fatal("expected unknown-table error")
	}
}

func TestCoerceBoolFromInt(t *testing.T) {
	if v := coerce(int64(1), "BOOLEAN"); v != true {
		t.Fatalf("int64(1) → %v, want true", v)
	}
	if v := coerce(nil, "BOOL"); v != nil {
		t.Fatalf("nil should stay nil, got %v", v)
	}
	if v := coerce([]byte("txt"), "TEXT"); v != "txt" {
		t.Fatalf("blob→text failed: %v", v)
	}
}
