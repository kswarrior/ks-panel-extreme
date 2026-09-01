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
    fmt.Println("for 22 with Scan int64:")
    for rows.Next() {
        var a,b int64
        err := rows.Scan(&a,&b)
        fmt.Printf("  %d %d err %v\n", a,b,err)
        if err != nil {
            var s1,s2 sql.NullString
            rows.Scan(&s1,&s2)
            fmt.Printf("  as NullString %v %v\n", s1, s2)
        }
    }
    fmt.Printf("err %v\n", rows.Err())
    rows.Close()
}
