package datamove

import (
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

func TestTmpProbeSqliteTypes(t *testing.T) {
	dstPath := "/tmp/opencode/dbtest/reverse.db"
	os.Remove(dstPath)
	dst, dstD, err := db.Open(config.DBConfig{Engine: "sqlite", DSN: dstPath})
	if err != nil { t.Fatal(err) }
	defer dst.Close()
	if err := db.EnsureSchemaAndSeed(dstD, dst); err != nil { t.Fatal(err) }
	rows, err := dstD.Open(dstPath)
	if err != nil { t.Fatal(err) }
	defer rows.Close()
	r2, err := rows.Query(`SELECT * FROM roles WHERE 1=0`)
	if err != nil { t.Fatal(err) }
	defer r2.Close()
	ctypes, _ := r2.ColumnTypes()
	for i, ct := range ctypes {
		fmt.Printf("dst col %d %s type=%q\n", i, ct.Name(), ct.DatabaseTypeName())
	}
}
