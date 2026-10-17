package modengine

import (
	"strings"
	"testing"
)

// TestValidateModSQL covers the policy gate for ks.db.query / ks.db.exec.
// The contract: single statement, no comments, direction-appropriate verb,
// deny-listed keywords rejected. NOTE the scan is deliberately conservative:
// keywords inside string literals are still flagged, which keeps the guard
// simple at the cost of rejecting odd-but-legit literals like 'drop me'.
func TestValidateModSQL(t *testing.T) {
	allowed := []struct {
		name string
		sql  string
		read bool
	}{
		{"select plain", "SELECT id, slug FROM mods", true},
		{"select with args", "SELECT id FROM mods WHERE slug = ? AND active = ?", true},
		{"select join", "SELECT m.id FROM mods m JOIN mod_permissions p ON p.mod_id = m.id", true},
		{"with select", "WITH recent AS (SELECT id FROM mods) SELECT * FROM recent", true},
		{"lowercase select", "select * from mods", true},
		{"insert", "INSERT INTO mod_reports (mod_id, body) VALUES (?, ?)", false},
		{"update with set", "UPDATE mod_reports SET body = ? WHERE id = ?", false},
		{"update with subquery", "UPDATE mod_reports SET body = (SELECT 'x') WHERE id = ?", false},
		{"delete", "DELETE FROM mod_reports WHERE created_at < ?", false},
		{"insert select", "INSERT INTO mod_archive (id) SELECT id FROM mod_reports", false},
	}
	for _, tc := range allowed {
		if err := ValidateModSQL(tc.sql, tc.read); err != nil {
			t.Errorf("%s: expected allowed, got %v", tc.name, err)
		}
	}

	rejected := []struct {
		name string
		sql  string
		read bool
	}{
		{"empty", "   ", true},
		{"multi statement", "SELECT 1; DROP TABLE mods", true},
		{"line comment", "SELECT 1 -- trailing", true},
		{"block comment", "SELECT /* x */ 1", true},
		{"pragma", "PRAGMA table_info(mods)", true},
		{"attach", "ATTACH DATABASE '/tmp/x' AS x", true},
		{"vacuum", "VACUUM", true},
		{"write in read", "INSERT INTO mods (slug) VALUES ('x')", true},
		{"delete in read", "DELETE FROM mods", true},
		{"update in read", "UPDATE mods SET slug = 'x'", true},
		{"set in read", "SET search_path = public", true},
		{"create in write", "CREATE TABLE hacked (id int)", false},
		{"drop in write", "DROP TABLE mods", false},
		{"alter in write", "ALTER TABLE mods ADD COLUMN x int", false},
		{"truncate in write", "TRUNCATE TABLE mods", false},
		{"select in write", "SELECT * FROM mods", false},
		{"attach in write", "INSERT INTO x VALUES (1) /* attach */", false},
		{"load_file", "SELECT LOAD_FILE('/etc/passwd')", true},
		{"into outfile", "SELECT 1 INTO OUTFILE '/tmp/x'", true},
		{"sleep", "SELECT SLEEP(10)", true},
		{"nul byte", "SELECT 1\x00", true},
		{"unknown verb", "EXPLAIN SELECT * FROM mods", true},
	}
	for _, tc := range rejected {
		err := ValidateModSQL(tc.sql, tc.read)
		if err == nil {
			t.Errorf("%s: expected rejection, statement passed", tc.name)
			continue
		}
		if !strings.Contains(err.Error(), "mod SQL rejected") {
			t.Errorf("%s: error should wrap ErrModSQLRejected, got %v", tc.name, err)
		}
	}
}
