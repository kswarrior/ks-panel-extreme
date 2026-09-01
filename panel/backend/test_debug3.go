package main

import (
    "database/sql"
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, err := repository.OpenDB()
    if err != nil { panic(err) }
    defer db.Close()
    for _, id := range []int64{1,2,3,22} {
        fmt.Printf("role %d: ", id)
        rows, err := db.Query(`SELECT p.key FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ? ORDER BY p.key`, id)
        if err != nil {
            fmt.Printf("query error %v\n", err)
            continue
        }
        count := 0
        for rows.Next() {
            var k sql.NullString
            if err := rows.Scan(&k); err != nil {
                fmt.Printf("scan error %v\n", err)
                break
            }
            if !k.Valid {
                fmt.Printf("NULL key! ")
            }
            count++
        }
        fmt.Printf("count %d err %v\n", count, rows.Err())
        rows.Close()
        // also try the original scan with string (not NullString) to reproduce error
        rows, _ = db.Query(`SELECT p.key FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ? ORDER BY p.key`, id)
        for rows.Next() {
            var k2 string
            if err := rows.Scan(&k2); err != nil {
                fmt.Printf("  string scan error for role %d: %v\n", id, err)
                break
            }
        }
        rows.Close()
    }
}
