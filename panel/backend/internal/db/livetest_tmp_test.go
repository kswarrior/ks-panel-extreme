package db

import (
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
)

// Throwaway live-verification harness (deleted after the fix is proven).
func TestTmpLiveMigrations(t *testing.T) {
	engine := os.Getenv("LIVE_ENGINE")
	dsn := os.Getenv("LIVE_DSN")
	if engine == "" || dsn == "" {
		t.Skip("set LIVE_ENGINE/LIVE_DSN")
	}
	cfg := config.DBConfig{Engine: engine, DSN: dsn}
	con, d, err := Open(cfg)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer con.Close()
	if err := RunMigrations(d, con); err != nil {
		t.Fatalf("RunMigrations(%s): %v", engine, err)
	}
	var n int
	if err := con.QueryRow(`SELECT COUNT(*) FROM permissions`).Scan(&n); err != nil {
		t.Fatalf("probe permissions: %v", err)
	}
	fmt.Printf("LIVE-OK %s permissions=%d\n", engine, n)
}
