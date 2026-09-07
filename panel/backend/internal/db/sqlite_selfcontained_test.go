package db

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Regression test for the Kaggle/minimal-container startup panic:
//
//	panic: open /etc/protocols: no such file or directory
//	honnef.co/go/netdb.init.0()
//
// The old modernc.org/sqlite v1.6.0 pulled modernc.org/libc v1.2.0, which
// imported honnef.co/go/netdb — a package whose init() panics when
// /etc/protocols or /etc/services is absent. That made the kspanel binary
// depend on host files outside its control (present on a full VM, missing
// on stripped images like Kaggle's).
//
// modernc.org/sqlite >= v1.21.0 (libc without the netdb import) removed
// that init-time file read, so the binary is self-sufficient again. These
// tests pin that property two ways:
//
//  1. TestSQLiteDriverSelfContained opens a real SQLite database through
//     the dialect and runs a query — the functional proof the default
//     engine works end to end.
//  2. TestNoNetdbDependency fails if honnef.co/go/netdb ever re-enters
//     the module graph (e.g. via a sqlite downgrade), which is the exact
//     condition that reintroduces the /etc/protocols init panic.
func TestSQLiteDriverSelfContained(t *testing.T) {
	dir := t.TempDir()
	d, err := NewDialect("sqlite")
	if err != nil {
		t.Fatalf("NewDialect(sqlite): %v", err)
	}
	db, err := d.Open(filepath.Join(dir, "selfcontained.db"))
	if err != nil {
		t.Fatalf("sqlite Open: %v", err)
	}
	defer db.Close()

	var one int
	if err := db.QueryRow("SELECT 1").Scan(&one); err != nil {
		t.Fatalf("SELECT 1: %v", err)
	}
	if one != 1 {
		t.Fatalf("SELECT 1 = %d, want 1", one)
	}
	if _, err := db.Exec("CREATE TABLE selfcheck (id INTEGER PRIMARY KEY, v TEXT)"); err != nil {
		t.Fatalf("CREATE TABLE: %v", err)
	}
	if _, err := db.Exec("INSERT INTO selfcheck (v) VALUES (?)", "kaggle"); err != nil {
		t.Fatalf("INSERT: %v", err)
	}
	var v string
	if err := db.QueryRow("SELECT v FROM selfcheck WHERE id = 1").Scan(&v); err != nil {
		t.Fatalf("SELECT: %v", err)
	}
	if v != "kaggle" {
		t.Fatalf("v = %q, want %q", v, "kaggle")
	}
}

func TestNoNetdbDependency(t *testing.T) {
	goBin, err := exec.LookPath("go")
	if err != nil {
		t.Skip("go tool not on PATH — cannot inspect module graph")
	}
	out, err := exec.Command(goBin, "list", "-m", "all").CombinedOutput()
	if err != nil {
		t.Fatalf("go list -m all: %v\n%s", err, out)
	}
	for _, line := range strings.Split(string(out), "\n") {
		if mod := strings.Fields(line); len(mod) > 0 && mod[0] == "honnef.co/go/netdb" {
			t.Fatalf("honnef.co/go/netdb is back in the module graph — its init() panics when /etc/protocols or /etc/services is missing (minimal containers like Kaggle). Refusing: %q", line)
		}
	}
}
