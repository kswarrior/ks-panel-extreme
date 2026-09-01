package main

import (
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    rows, _ := db.Query(`SELECT role_id, permission_id FROM role_permissions WHERE role_id = 22`)
    fmt.Println("direct for 22:")
    for rows.Next() {
        var a,b int64
        err := rows.Scan(&a,&b)
        fmt.Printf("  scan %v %d %d\n", err, a,b)
    }
    fmt.Printf("err %v\n", rows.Err())
    rows.Close()
    rows, _ = db.Query(`SELECT * FROM role_permissions WHERE role_id = 22`)
    fmt.Println("select * for 22:")
    for rows.Next() {
        var a,b int64
        err := rows.Scan(&a,&b)
        fmt.Printf("  scan %v %d %d\n", err, a,b)
    }
    fmt.Printf("err %v\n", rows.Err())
    rows.Close()
}
