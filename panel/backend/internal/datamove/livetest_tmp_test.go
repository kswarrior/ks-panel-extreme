package datamove

import (
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

// Throwaway live-verification of the exact SetDatabaseEngineHandler pipeline.
func TestTmpSwitchPipeline(t *testing.T) {
	engine := os.Getenv("LIVE_ENGINE")
	dsn := os.Getenv("LIVE_DSN")
	if engine == "" || dsn == "" {
		t.Skip("set LIVE_ENGINE/LIVE_DSN")
	}

	// 1) seeded SQLite source (what the running panel holds).
	srcPath := "/tmp/opencode/dbtest/src.db"
	_ = os.Remove(srcPath)
	srcCfg := config.DBConfig{Engine: "sqlite", DSN: srcPath}
	src, srcD, err := db.Open(srcCfg)
	if err != nil {
		t.Fatalf("open sqlite source: %v", err)
	}
	defer src.Close()
	if err := db.EnsureSchemaAndSeed(srcD, src); err != nil {
		t.Fatalf("seed sqlite: %v", err)
	}
	if _, err := src.Exec(`INSERT INTO users (username, email, password_hash, role_id) VALUES ('op','o@x.t','x',1)`); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if _, err := src.Exec(`UPDATE users SET display_name='Operator' WHERE username='op'`); err != nil {
		t.Fatalf("update user: %v", err)
	}

	// 2) target = live engine; wipe leftovers from previous runs.
	tgt, tgtD, err := db.Open(config.DBConfig{Engine: engine, DSN: dsn})
	if err != nil {
		t.Fatalf("open %s target: %v", engine, err)
	}
	defer tgt.Close()

	// 3) EXACTLY what SetDatabaseEngineHandler does after the backup step.
	if err := db.EnsureSchemaAndSeed(tgtD, tgt); err != nil {
		t.Fatalf("EnsureSchemaAndSeed(%s): %v", engine, err)
	}
	res, err := Sync(srcD, src, tgtD, tgt, Options{BatchSize: 500, ClearTarget: true})
	if err != nil {
		t.Fatalf("Sync -> %s: %v", engine, err)
	}
	bl := map[string]int64{}
	order := []string{}
	for _, tr := range res.Tables {
		bl[tr.Table] = tr.BaselineRows
		order = append(order, tr.Table)
	}
	issues, warnings, verr := Verify(srcD, src, tgtD, tgt, order, bl)
	if verr != nil {
		t.Fatalf("Verify: %v", err)
	}
	if len(issues) > 0 {
		t.Fatalf("verify issues: %v", issues)
	}

	// 4) spot-check the copied row actually landed with values intact.
	var uname, disp string
	q := fmt.Sprintf("SELECT username, display_name FROM users WHERE username='op'")
	if err := tgt.QueryRow(q).Scan(&uname, &disp); err != nil {
		t.Fatalf("probe copied user on %s: %v", engine, err)
	}
	if uname != "op" || disp != "Operator" {
		t.Fatalf("copied row mismatch: %q %q", uname, disp)
	}
	fmt.Printf("PIPELINE-OK -> %s tables=%d rows=%d warnings=%d\n", engine, len(res.Tables), res.RowsCopied, len(warnings))
}
