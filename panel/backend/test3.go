package main

import (
    "database/sql"
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    rows, _ := db.Query(`SELECT role_id, permission_id FROM role_permissions WHERE role_id = 22`)
    fmt.Println("for 22:")
    for rows.Next() {
        var a,b sql.NullInt64
        rows.Scan(&a,&b)
        fmt.Printf("  %v %v\n", a, b)
    }
    fmt.Printf("err %v\n", rows.Err())
    rows.Close()
    rows, _ = db.Query(`SELECT COUNT(*) FROM role_permissions WHERE role_id = 22`)
    var c sql.NullInt64
    rows.Next()
    rows.Scan(&c)
    fmt.Printf("count %v valid %v\n", c.Int64, c.Valid)
    rows.Close()
}
