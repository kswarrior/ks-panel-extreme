package main

import (
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    rows, _ := db.Query(`SELECT COUNT(*) FROM role_permissions WHERE role_id = 22`)
    var c int
    rows.Next()
    rows.Scan(&c)
    fmt.Printf("count %d\n", c)
    rows.Close()
    rows, _ = db.Query(`SELECT * FROM role_permissions WHERE role_id = 22`)
    fmt.Println("select *:")
    for rows.Next() {
        var a,b int64
        err := rows.Scan(&a,&b)
        fmt.Printf("  %d %d err %v\n", a,b,err)
    }
    fmt.Printf("err %v\n", rows.Err())
    rows.Close()
}
