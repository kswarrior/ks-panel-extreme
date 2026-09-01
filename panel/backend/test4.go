package main

import (
    "database/sql"
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    for _, id := range []int64{4,22,23} {
        rows, _ := db.Query(`SELECT role_id, permission_id FROM role_permissions WHERE role_id = ?`, id)
        fmt.Printf("for %d:\n", id)
        for rows.Next() {
            var a,b sql.NullInt64
            rows.Scan(&a,&b)
            fmt.Printf("  %v %v\n", a, b)
        }
        fmt.Printf("  err %v\n", rows.Err())
        rows.Close()
        rows, _ = db.Query(`SELECT COUNT(*) FROM role_permissions WHERE role_id = ?`, id)
        var c int
        rows.Next()
        rows.Scan(&c)
        fmt.Printf("  count %d\n", c)
        rows.Close()
    }
}
