package main

import (
    "database/sql"
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    for _, id := range []int64{1,2,3,22} {
        fmt.Printf("role %d: ", id)
        rows, _ := db.Query(`SELECT p.key FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ? ORDER BY p.key`, id)
        count := 0
        for rows.Next() {
            var k sql.NullString
            rows.Scan(&k)
            if !k.Valid {
                fmt.Printf("NULL ")
            }
            count++
        }
        fmt.Printf("count %d err %v\n", count, rows.Err())
        rows.Close()
    }
}
