package backup

import "testing"

func TestReproAliasMismatch(t *testing.T) {
	t.Logf("isSQLiteEngine(sqlite3)=%v (NewDialect accepts sqlite3)", isSQLiteEngine("sqlite3"))
	t.Logf("NativeToolAvailable(postgresql)=%v NativeToolAvailable(pg)=%v NativeToolAvailable(mariadb)=%v",
		NativeToolAvailable("postgresql"), NativeToolAvailable("pg"), NativeToolAvailable("mariadb"))
	if err := NativeDump("mariadb", "u:p@tcp(h:3306)/d", t.TempDir()+"/x.sql"); err != nil {
		t.Logf("REPRO NativeDump(mariadb) err=%v", err)
	}
	if err := NativeDump("postgresql", "postgres://u@h/d", t.TempDir()+"/y.sql"); err != nil {
		t.Logf("REPRO NativeDump(postgresql) err=%v", err)
	}
}
