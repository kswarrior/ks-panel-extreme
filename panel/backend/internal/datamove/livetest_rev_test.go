package datamove

import (
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

func TestTmpReverseMysqlToSqlite(t *testing.T) {
	dsn := os.Getenv("LIVE_DSN")
	if dsn == "" {
		t.Skip("set LIVE_DSN")
	}
	srcCfg := config.DBConfig{Engine: "mysql", DSN: dsn}
	src, srcD, err := db.Open(srcCfg)
	if err != nil {
		t.Fatalf("open mysql source: %v", err)
	}
	defer src.Close()
	dstPath := "/tmp/opencode/dbtest/reverse.db"
	_ = os.Remove(dstPath)
	dst, dstD, err := db.Open(config.DBConfig{Engine: "sqlite", DSN: dstPath})
	if err != nil {
		t.Fatalf("open sqlite target: %v", err)
	}
	defer dst.Close()
	if err := db.EnsureSchemaAndSeed(dstD, dst); err != nil {
		t.Fatalf("seed sqlite target: %v", err)
	}
	res, err := Sync(srcD, src, dstD, dst, Options{BatchSize: 500, ClearTarget: true})
	if err != nil {
		t.Fatalf("Sync -> sqlite: %v", err)
	}
	bl := map[string]int64{}
	order := []string{}
	for _, tr := range res.Tables {
		bl[tr.Table] = tr.BaselineRows
		order = append(order, tr.Table)
	}
	issues, _, verr := Verify(srcD, src, dstD, dst, order, bl)
	if verr != nil || len(issues) > 0 {
		t.Fatalf("verify: %v %v", verr, issues)
	}
	fmt.Printf("REVERSE-OK -> sqlite tables=%d rows=%d\n", len(res.Tables), res.RowsCopied)
}
