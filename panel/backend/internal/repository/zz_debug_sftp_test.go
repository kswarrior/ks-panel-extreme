package repository

import (
	"os"
	"testing"
)

// Temp debug: open the retest DB and Get a missing SFTP row.
func TestDebugSFTPGetMissing(t *testing.T) {
	os.Setenv("KSPANEL_DATA_DIR", "/tmp/kspanel-retest")
	// NOTE: OpenDB location depends on implementation; this test only
	// prints the resolution path on failure.
	con, err := OpenDB()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer con.Close()
	repo := NewSFTPRepository(con)
	cfg, err := repo.Get(1)
	t.Logf("cfg=%+v err=%v", cfg, err)
}
