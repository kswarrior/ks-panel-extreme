package main

import (
    "fmt"
    "github.com/example/kspanel/internal/permissions"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, _ := repository.OpenDB()
    defer db.Close()
    checker := permissions.NewChecker(db)
    perms, err := checker.ListUserPermissions(3)
    fmt.Printf("perms %v err %v\n", perms, err)
    perms, err = checker.ListUserPermissions(1)
    fmt.Printf("admin perms %d err %v\n", len(perms), err)
}
