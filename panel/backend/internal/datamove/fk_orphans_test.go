package datamove

import (
	"database/sql"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/db"
	_ "modernc.org/sqlite"
)

// openOrphanFixture builds an in-memory SQLite DB with a parent→child FK
// and enforcement OFF so an orphan row can be inserted deterministically.
// MaxOpenConns(1) pins the :memory: database to a single connection.
func openOrphanFixture(t *testing.T, withOrphan bool) (*sql.DB, db.Dialect) {
	t.Helper()
	d, err := db.NewDialect("sqlite")
	if err != nil {
		t.Fatalf("dialect: %v", err)
	}
	con, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open memory: %v", err)
	}
	con.SetMaxOpenConns(1)
	if _, err := con.Exec(`PRAGMA foreign_keys = OFF`); err != nil {
		con.Close()
		t.Fatalf("fk off: %v", err)
	}
	if _, err := con.Exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY)`); err != nil {
		con.Close()
		t.Fatalf("create parent: %v", err)
	}
	if _, err := con.Exec(`CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE)`); err != nil {
		con.Close()
		t.Fatalf("create child: %v", err)
	}
	if _, err := con.Exec(`INSERT INTO parent (id) VALUES (1)`); err != nil {
		con.Close()
		t.Fatalf("insert parent: %v", err)
	}
	if _, err := con.Exec(`INSERT INTO child (id, parent_id) VALUES (1, 1)`); err != nil {
		con.Close()
		t.Fatalf("insert valid child: %v", err)
	}
	if _, err := con.Exec(`INSERT INTO child (id, parent_id) VALUES (2, NULL)`); err != nil {
		con.Close()
		t.Fatalf("insert null child: %v", err)
	}
	if withOrphan {
		if _, err := con.Exec(`INSERT INTO child (id, parent_id) VALUES (3, 999)`); err != nil {
			con.Close()
			t.Fatalf("insert orphan child: %v", err)
		}
	}
	return con, d
}

func TestScanFKOrphansFindsSQLiteOrphan(t *testing.T) {
	con, d := openOrphanFixture(t, true)
	defer con.Close()
	issues, _, checked, err := ScanFKOrphans(d, con)
	if err != nil {
		t.Fatalf("scan error: %v", err)
	}
	if checked == 0 {
		t.Fatal("expected at least 1 FK constraint checked")
	}
	if len(issues) == 0 {
		t.Fatal("expected orphan issue, got none")
	}
	found := false
	for _, is := range issues {
		if strings.Contains(is, "child") && strings.Contains(is, "parent") {
			found = true
		}
	}
	if !found {
		t.Fatalf("orphan issue missing child→parent reference: %v", issues)
	}
}

func TestScanFKOrphansCleanWhenNoOrphan(t *testing.T) {
	con, d := openOrphanFixture(t, false)
	defer con.Close()
	issues, _, checked, err := ScanFKOrphans(d, con)
	if err != nil {
		t.Fatalf("scan error: %v", err)
	}
	if checked == 0 {
		t.Fatal("expected at least 1 FK constraint checked")
	}
	if len(issues) != 0 {
		t.Fatalf("expected no orphans, got %v", issues)
	}
}

func TestVerifyReportsSQLiteOrphan(t *testing.T) {
	src, srcD := openOrphanFixture(t, true)
	defer src.Close()
	dst, dstD := openOrphanFixture(t, true)
	defer dst.Close()
	tables := []string{"parent", "child"}
	baselines := map[string]int64{"parent": 1, "child": 3}
	issues, _, verr := Verify(srcD, src, dstD, dst, tables, baselines)
	if verr != nil {
		t.Fatalf("verify error: %v", verr)
	}
	found := false
	for _, is := range issues {
		if strings.Contains(strings.ToLower(is), "orphan") || strings.Contains(is, "child") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected Verify to report orphan issue, got %v", issues)
	}
}
