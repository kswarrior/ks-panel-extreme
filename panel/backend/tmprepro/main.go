package main

import (
	"fmt"
	"os"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/repository"
)

func main() {
	os.Remove("/tmp/opencode-repro.db")
	cfg := config.DatabaseConfig()
	cfg.Engine = "sqlite"
	cfg.DSN = "/tmp/opencode-repro.db"
	fmt.Printf("engine=%s dsn=%s\n", cfg.Engine, cfg.DSN)
	con, d, err := db.Open(cfg)
	if err != nil { fmt.Println("open err:", err); os.Exit(1) }
	defer con.Close()
	if err := db.RunMigrations(d, con); err != nil { fmt.Println("mig err:", err); os.Exit(1) }
	if err := db.SeedCore(d, con); err != nil { fmt.Println("seed err:", err); os.Exit(1) }
	repo := repository.NewNodeRepository(con)
	created, _, err := repo.CreateNode(repository.CreateNodeInput{Name: "local-edge", Address: "127.0.0.1:4040", ConnectionMode: "local_port"})
	if err != nil { fmt.Println("create err:", err); os.Exit(1) }
	fmt.Println("created id:", created.ID)
	done := make(chan string, 1)
	go func() {
		n, err := repo.GetNode(created.ID)
		done <- fmt.Sprintf("GetNode returned node!=nil=%v err=%v", n != nil, err)
	}()
	select {
	case s := <-done:
		fmt.Println(s)
		fmt.Println("GetNode COMPLETED (no deadlock)")
	case <-time.After(8 * time.Second):
		fmt.Println("GetNode HUNG >8s (deadlock reproduced: outer Rows holds single sqlite conn, inner nodeOwnerMap Query blocks forever)")
		os.Exit(2)
	}
}
