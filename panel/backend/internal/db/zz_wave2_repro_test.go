package db

import (
	"database/sql"
	"testing"
)

// TEMPORARY Wave-2 reproducer (deleted after use, not part of the change).
func TestTempWave2ReproMySQL(t *testing.T) {
	dsn := "wave2:wave2pass@tcp(127.0.0.1:3306)/ks_wave2?parseTime=true&loc=UTC&multiStatements=false"
	d, err := NewDialect("mysql")
	if err != nil {
		t.Fatal(err)
	}
	con, err := sql.Open(d.DriverName(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer con.Close()
	if err := RunMigrations(d, con); err != nil {
		t.Fatalf("REPRODUCED: %v", err)
	}
}
