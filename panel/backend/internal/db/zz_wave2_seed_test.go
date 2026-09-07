package db

import (
	"testing"
)

// TEMPORARY Wave-2 seed check (deleted after use).
func TestTempWave2SeedMySQL(t *testing.T) {
	d, err := NewDialect("mysql")
	if err != nil {
		t.Fatal(err)
	}
	con, err := d.Open("wave2:wave2pass@tcp(127.0.0.1:3306)/ks_wave2?parseTime=true&loc=UTC&multiStatements=false")
	if err != nil {
		t.Fatal(err)
	}
	defer con.Close()
	if err := EnsureSchemaAndSeed(d, con); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := EnsureSchemaAndSeed(d, con); err != nil {
		t.Fatalf("seed twice: %v", err)
	}
}
