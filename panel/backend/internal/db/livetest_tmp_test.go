package db

import (
	"database/sql"
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
	_ "github.com/example/kspanel/internal/repository"
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

func TestTmpFullSwitchPipeline(t *testing.T) {
	engine := os.Getenv("LIVE_ENGINE")
	dsn := os.Getenv("LIVE_DSN")
	if engine == "" || dsn == "" {
		t.Skip("set LIVE_ENGINE/LIVE_DSN")
	}
	// 1) sqlite source, seeded like launch does.
	srcCfg := config.DBConfig{Engine: "sqlite", DSN: "/tmp/opencode/dbtest/src.db"}
	_ = os.Remove(srcCfg.DSN)
	src, srcD, err := Open(srcCfg)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer src.Close()
	if err := EnsureSchemaAndSeed(srcD, src); err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}
	if _, err := src.Exec(`INSERT INTO users (username, email, password_hash, role_id) VALUES ('op','o@x.t','x',1)`); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	// 2) target = live engine; wipe any previous run's rows.
	tgt, tgtD, err := Open(config.DBConfig{Engine: engine, DSN: dsn})
	if err != nil {
		t.Fatalf("open %s: %v", engine, err)
	}
	defer tgt.Close()

	// 3) EXACTLY what SetDatabaseEngineHandler step 2+3 does.
	if err := EnsureSchemaAndSeed(tgtD, tgt); err != nil {
		t.Fatalf("EnsureSchemaAndSeed(%s): %v", engine, err)
	}
	_ = sql.DB{} // keep import used
}
