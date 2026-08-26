package datamove

import (
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

func TestTmpFinalPipeline(t *testing.T) {
	engine := os.Getenv("LIVE_ENGINE")
	dsn := os.Getenv("LIVE_DSN")
	if engine == "" || dsn == "" {
		t.Skip("set LIVE_ENGINE/LIVE_DSN")
	}
	srcPath := "/tmp/opencode/dbtest/src.db"
	_ = os.Remove(srcPath)
	src, srcD, err := db.Open(config.DBConfig{Engine: "sqlite", DSN: srcPath})
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()
	if err := db.EnsureSchemaAndSeed(srcD, src); err != nil {
		t.Fatal(err)
	}
	src.Exec(`INSERT INTO users (username, email, password_hash, role_id) VALUES ('op','o@x.t','x',1)`)

	tgt, tgtD, err := db.Open(config.DBConfig{Engine: engine, DSN: dsn})
	if err != nil {
		t.Fatal(err)
	}
	defer tgt.Close()
	if err := db.EnsureSchemaAndSeed(tgtD, tgt); err != nil {
		t.Fatalf("EnsureSchemaAndSeed(%s): %v", engine, err)
	}
	res, err := Sync(srcD, src, tgtD, tgt, Options{BatchSize: 500, ClearTarget: true})
	if err != nil {
		t.Fatalf("Sync: %v", err)
	}
	bl := map[string]int64{}
	order := []string{}
	for _, tr := range res.Tables {
		bl[tr.Table] = tr.BaselineRows
		order = append(order, tr.Table)
	}
	issues, _, verr := Verify(srcD, src, tgtD, tgt, order, bl)
	if verr != nil || len(issues) > 0 {
		t.Fatalf("verify: %v %v", verr, issues)
	}
	fmt.Printf("FINAL-LIVE-OK -> %s tables=%d rows=%d\n", engine, len(res.Tables), res.RowsCopied)
}
