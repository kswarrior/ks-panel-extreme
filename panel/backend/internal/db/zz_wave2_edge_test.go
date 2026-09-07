package db

import (
	"strings"
	"testing"
)

// TEMPORARY Wave-2 edge cases (deleted after use).
func TestTempWave2Edge(t *testing.T) {
	cases := []struct{ in, want string }{
		// inline UNIQUE / DEFAULT tiers
		{"CREATE TABLE t (username TEXT NOT NULL UNIQUE)", "CREATE TABLE t (username VARCHAR(255) NOT NULL UNIQUE)"},
		{"CREATE TABLE t (password_hash TEXT NOT NULL)", "CREATE TABLE t (password_hash TEXT NOT NULL)"},
		{"CREATE TABLE t (spec TEXT NOT NULL DEFAULT '{}')", "CREATE TABLE t (spec VARCHAR(1024) NOT NULL DEFAULT '{}')"},
		{"CREATE TABLE t (status TEXT NOT NULL DEFAULT 'open')", "CREATE TABLE t (status VARCHAR(255) NOT NULL DEFAULT 'open')"},
		// literal containing keywords must not fire
		{"CREATE TABLE t (note TEXT, x TEXT NOT NULL DEFAULT 'a TEXT UNIQUE thing')", "CREATE TABLE t (note TEXT, x VARCHAR(255) NOT NULL DEFAULT 'a TEXT UNIQUE thing')"},
		// column named context / latest
		{"CREATE TABLE t (context TEXT NOT NULL DEFAULT 'x')", "CREATE TABLE t (context VARCHAR(255) NOT NULL DEFAULT 'x')"},
		// key_hash (substring of key + suffix) untouched
		{"CREATE TABLE t (key_hash TEXT NOT NULL)", "CREATE TABLE t (key_hash TEXT NOT NULL)"},
		// table-level PK/UNIQUE/FK force VARCHAR even without DEFAULT
		{"CREATE TABLE m (mod_slug TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY (mod_slug, key))", "CREATE TABLE m (mod_slug VARCHAR(255) NOT NULL, `key` VARCHAR(255) NOT NULL, PRIMARY KEY (mod_slug, `key`))"},
		{"CREATE TABLE s (instance_id INTEGER NOT NULL, key TEXT NOT NULL, UNIQUE (instance_id, key))", "CREATE TABLE s (instance_id INTEGER NOT NULL, `key` VARCHAR(255) NOT NULL, UNIQUE (instance_id, `key`))"},
		// CHECK preserved
		{"CREATE TABLE p (protocol TEXT NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('tcp','udp')))", "CREATE TABLE p (protocol VARCHAR(255) NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('tcp','udp')))"},
		// non-CREATE/ALTER passthrough
		{"INSERT INTO t (a) VALUES (1)", "INSERT INTO t (a) VALUES (1)"},
		{"CREATE INDEX i ON t(a)", "CREATE INDEX i ON t(a)"},
		// BIGINT PK scoped; counter untouched
		{"CREATE TABLE t (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)", "CREATE TABLE t (id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY)"},
		{"CREATE TABLE t (counter BIGINT NOT NULL DEFAULT 0)", "CREATE TABLE t (counter BIGINT NOT NULL DEFAULT 0)"},
		// reserved idents
		{"INSERT IGNORE INTO settings (key, value) VALUES ('a', 'b')", "INSERT IGNORE INTO settings (`key`, value) VALUES ('a', 'b')"},
		{"CREATE TABLE s (key TEXT PRIMARY KEY, value TEXT NOT NULL)", "CREATE TABLE s (`key` VARCHAR(255) PRIMARY KEY, value TEXT NOT NULL)"},
		{"SELECT akey, keyboard, monkey FROM t WHERE note='a key here'", "SELECT akey, keyboard, monkey FROM t WHERE note='a key here'"},
		{"CREATE TABLE t (a INTEGER, PRIMARY KEY (a), FOREIGN KEY (a) REFERENCES p(id))", "CREATE TABLE t (a INTEGER, PRIMARY KEY (a), FOREIGN KEY (a) REFERENCES p(id))"},
		{"CREATE TABLE r (trigger TEXT NOT NULL)", "CREATE TABLE r (`trigger` TEXT NOT NULL)"},
	}
	for i, c := range cases {
		got := c.in
		got = quoteMySQLReservedIdents(got)
		got = rewriteBigintPKForMySQL(got)
		got = rewriteTextColumnDefsForMySQL(got)
		if got != c.want {
			t.Errorf("case %d:\n got: %s\nwant: %s", i, got, c.want)
		}
	}
	// guarded def mapping
	gcases := []struct{ col, def, want string }{
		{"bio", "TEXT NOT NULL DEFAULT ''", "VARCHAR(1024) NOT NULL DEFAULT ''"},
		{"status", "TEXT NOT NULL DEFAULT 'x'", "VARCHAR(255) NOT NULL DEFAULT 'x'"},
		{"connection_mode", "VARCHAR(32) NOT NULL DEFAULT 'direct'", "VARCHAR(32) NOT NULL DEFAULT 'direct'"},
		{"n", "INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0"},
		{"avatar_mime", "TEXT", "TEXT"},
	}
	for i, c := range gcases {
		if got := mysqlGuardedColumnDef(c.col, c.def); got != c.want {
			t.Errorf("guarded %d: got %q want %q", i, got, c.want)
		}
	}
	if !strings.Contains("x", "x") {
		t.Fatal("unreachable")
	}
}
