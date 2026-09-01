package main

import (
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    rows, _ := db.Query(`SELECT role_id, permission_id FROM role_permissions LIMIT 5`)
    for rows.Next() {
        var a,b int64
        rows.Scan(&a,&b)
        fmt.Printf("%d %d\n", a,b)
    }
    rows.Close()
    rows, _ = db.Query(`SELECT COUNT(*) FROM role_permissions`)
    var c int
    rows.Next()
    rows.Scan(&c)
    fmt.Printf("total %d\n", c)
    rows.Close()
}
