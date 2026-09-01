package main

import (
    "fmt"
    "github.com/example/kspanel/internal/repository"
)

func main() {
    db, err := repository.OpenDB()
    if err != nil { panic(err) }
    defer db.Close()
    repo := repository.NewRoleRepository(db)
    roles, err := repo.ListRoles()
    if err != nil {
        fmt.Printf("ListRoles error: %v\n", err)
        return
    }
    for _, r := range roles {
        fmt.Printf("role %d %s perms %d: %v\n", r.ID, r.Name, len(r.Permissions), r.Permissions)
    }
}
