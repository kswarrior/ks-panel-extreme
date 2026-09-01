package main

import (
    "fmt"
    "github.com/example/kspanel/internal/config"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    cfg := config.DatabaseConfig()
    fmt.Printf("DSN: %s Engine: %s\n", cfg.DSN, cfg.Engine)
    db, err := repository.OpenDB()
    if err != nil { panic(err) }
    defer db.Close()
    rows, _ := db.Query("SELECT COUNT(*) FROM roles")
    var c int
    rows.Next()
    rows.Scan(&c)
    fmt.Printf("roles count %d\n", c)
    rows.Close()
    rows, _ = db.Query("SELECT id, name FROM roles ORDER BY id")
    for rows.Next() {
        var id int64
        var name string
        rows.Scan(&id, &name)
        fmt.Printf("role %d %s\n", id, name)
    }
    rows.Close()
}
