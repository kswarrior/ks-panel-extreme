package datamove

import (
	"fmt"
	"os"
	"testing"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

func TestTmpProbeRoles(t *testing.T) {
	dsn := os.Getenv("LIVE_DSN")
	src, _, err := db.Open(config.DBConfig{Engine: "mysql", DSN: dsn})
	if err != nil { t.Fatal(err) }
	defer src.Close()
	rows, err := src.Query(`SELECT * FROM roles`)
	if err != nil { t.Fatal(err) }
	defer rows.Close()
	cols, _ := rows.Columns()
	ctypes, _ := rows.ColumnTypes()
	for i, ct := range ctypes { fmt.Printf("col %d %s srctype=%s\n", i, cols[i], ct.DatabaseTypeName()) }
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals { ptrs[i] = &vals[i] }
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil { t.Fatal(err) }
		for i, v := range vals { fmt.Printf("row val %d %T %#v\n", i, v, v) }
	}
}
