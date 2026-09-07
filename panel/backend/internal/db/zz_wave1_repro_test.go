package db

import (
	"database/sql"
	"testing"
)

// Temporary Wave-1 repro: run the panel's own migration runner against live
// MySQL + Postgres and report the first failure. Deleted after the fix.
func TestWave1ReproLiveEngines(t *testing.T) {
	if testing.Short() {
		t.Skip("skip live repro in short mode")
	}
	for _, tc := range []struct{ engine, dsn string }{
		{"mysql", "kstest:kstestpw@tcp(127.0.0.1:3306)/kspanel_test?parseTime=true&loc=UTC&timeout=10s"},
		{"postgres", "postgres://kstest:kstestpw@127.0.0.1:5432/kspanel_test?sslmode=disable&connect_timeout=10"},
	} {
		t.Run(tc.engine, func(t *testing.T) {
			d, err := NewDialect(tc.engine)
			if err != nil {
				t.Fatalf("NewDialect: %v", err)
			}
			con, err := d.Open(tc.dsn)
			if err != nil {
				t.Fatalf("open: %v", err)
			}
			defer con.Close()
			if err := RunMigrations(d, con); err != nil {
				t.Fatalf("FIRST RunMigrations failed: %v", err)
			}
			t.Logf("first run ok")
			if err := RunMigrations(d, con); err != nil {
				t.Fatalf("SECOND RunMigrations failed: %v", err)
			}
			t.Logf("second run ok")
			if err := EnsureSchemaAndSeed(d, con); err != nil {
				t.Fatalf("EnsureSchemaAndSeed failed: %v", err)
			}
			t.Logf("seed ok")
			if err := EnsureSchemaAndSeed(d, con); err != nil {
				t.Fatalf("SECOND EnsureSchemaAndSeed failed: %v", err)
			}
			t.Logf("second seed ok")
			var n int
			_ = con.QueryRow("SELECT COUNT(*) FROM permissions").Scan(&n)
			t.Logf("permissions rows=%d", n)
			_ = sql.ErrNoRows
		})
	}
}
