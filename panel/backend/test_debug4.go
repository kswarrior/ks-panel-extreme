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
    rows, _ := db.Query(`SELECT rp.role_id, rp.permission_id, p.key FROM role_permissions rp LEFT JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = 22`)
    fmt.Println("LEFT JOIN for role 22:")
    for rows.Next() {
        var rid, pid sql.NullInt64
        var key sql.NullString
        rows.Scan(&rid, &pid, &key)
        fmt.Printf("  rid %v pid %v key %v valid %v\n", rid.Int64, pid.Int64, key.String, key.Valid)
    }
    rows.Close()
    rows, _ = db.Query(`SELECT * FROM role_permissions WHERE role_id = 22`)
    fmt.Println("role_permissions for 22:")
    for rows.Next() {
        var rid, pid int64
        rows.Scan(&rid, &pid)
        fmt.Printf("  %d %d\n", rid, pid)
    }
    rows.Close()
    rows, _ = db.Query(`SELECT COUNT(*) FROM role_permissions WHERE role_id = 22`)
    var c int
    rows.Next()
    rows.Scan(&c)
    fmt.Printf("count %d\n", c)
    rows.Close()
    // also check for role 22's permissions via the original JOIN
    rows, _ = db.Query(`SELECT p.key FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = 22`)
    fmt.Println("JOIN for role 22:")
    for rows.Next() {
        var k sql.NullString
        rows.Scan(&k)
        fmt.Printf("  key %v valid %v\n", k.String, k.Valid)
    }
    rows.Close()
}
