package main

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/repository"
)

func mustDialect(engine string) db.Dialect {
	d, err := db.NewDialect(engine)
	if err != nil {
		fmt.Println("DIALECT-ERR", engine, err)
		os.Exit(1)
	}
	return d
}

func runTwice(label, engine, dsn string) {
	fmt.Printf("=== %s: migrate x2 ===\n", label)
	d := mustDialect(engine)
	con, err := d.Open(dsn)
	if err != nil {
		fmt.Printf("%s OPEN-ERR: %v\n", label, err)
		return
	}
	defer con.Close()
	if err := db.RunMigrations(d, con); err != nil {
		fmt.Printf("%s RUN1-FAIL: %v\n", label, err)
		return
	}
	fmt.Printf("%s RUN1-OK\n", label)
	if err := db.RunMigrations(d, con); err != nil {
		fmt.Printf("%s RUN2-FAIL: %v\n", label, err)
		return
	}
	fmt.Printf("%s RUN2-OK\n", label)
}

func main() {
	mode := os.Args[1]
	switch mode {
	case "sqlite":
		runTwice("SQLITE", "sqlite", ":memory:")
	case "mysql":
		// fresh database per run
		root, _ := sql.Open("mysql", "kspanel:kspanel@tcp(127.0.0.1:3306)/?parseTime=true&loc=UTC&timeout=10s")
		root.Exec("DROP DATABASE IF EXISTS repro_w1")
		root.Exec("CREATE DATABASE repro_w1")
		root.Close()
		runTwice("MYSQL", "mysql", "kspanel:kspanel@tcp(127.0.0.1:3306)/repro_w1?parseTime=true&loc=UTC&timeout=10s")
	case "pg":
		root, _ := sql.Open("pgx", "postgres://kspanel:kspanel@localhost:5432/postgres?sslmode=disable")
		root.Exec("DROP DATABASE IF EXISTS repro_w1")
		root.Exec("CREATE DATABASE repro_w1")
		root.Close()
		runTwice("PG", "postgres", "postgres://kspanel:kspanel@localhost:5432/repro_w1?sslmode=disable")
	case "pgquery":
		// prove hardcoded `?` fails on postgres after migrations
		d := mustDialect("postgres")
		con, err := d.Open("postgres://kspanel:kspanel@localhost:5432/repro_w1?sslmode=disable")
		if err != nil {
			fmt.Println("PGQ OPEN-ERR:", err)
			return
		}
		defer con.Close()
		var n int
		err = con.QueryRow(`SELECT COUNT(*) FROM users WHERE id = ?`, 1).Scan(&n)
		fmt.Printf("PGQ hardcoded-?-query err=%v\n", err)
		ur := repository.NewUserRepository(con)
		_, err = ur.GetByID(1)
		fmt.Printf("PGQ UserRepository.GetByID err=%v\n", err)
	case "mysqlms":
		// same as mysql but with multiStatements=true to isolate the
		// multi-statement root cause from later per-migration bugs
		root, _ := sql.Open("mysql", "kspanel:kspanel@tcp(127.0.0.1:3306)/?parseTime=true&loc=UTC&timeout=10s")
		root.Exec("DROP DATABASE IF EXISTS repro_w1ms")
		root.Exec("CREATE DATABASE repro_w1ms")
		root.Close()
		runTwice("MYSQLMS", "mysql", "kspanel:kspanel@tcp(127.0.0.1:3306)/repro_w1ms?parseTime=true&loc=UTC&timeout=10s&multiStatements=true")
	case "sqlite054":
		// file-backed sqlite: migrate once, then list 054 owner indexes
		if os.Getenv("KEEP_DB") == "" {
			os.Remove("/tmp/opencode/repro_w1.db")
		}
		d := mustDialect("sqlite")
		con, err := d.Open("/tmp/opencode/repro_w1.db")
		if err != nil {
			fmt.Println("SQLITE054 OPEN-ERR:", err)
			return
		}
		defer con.Close()
		if err := db.RunMigrations(d, con); err != nil {
			fmt.Println("SQLITE054 RUN1-FAIL:", err)
			return
		}
		fmt.Println("SQLITE054 RUN1-OK")
		for _, idx := range []string{"nodes_owner_idx", "templates_owner_idx", "mods_owner_idx", "applications_owner_idx", "instance_pages_owner_idx", "themes_owner_idx", "roles_owner_idx", "idx_users_suspended", "idx_instances_suspended", "evc_email_idx", "mod_storage_mod_idx"} {
			var n int
			_ = con.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?`, idx).Scan(&n)
			fmt.Printf("SQLITE054 index %s present=%d\n", idx, n)
		}
		if err := db.RunMigrations(d, con); err != nil {
			fmt.Println("SQLITE054 RUN2-FAIL:", err)
			return
		}
		fmt.Println("SQLITE054 RUN2-OK")
	case "myscan":
		// prove timestamp-into-string scan fails on mysql(parseTime) after migrations
		d := mustDialect("mysql")
		con, err := d.Open("kspanel:kspanel@tcp(127.0.0.1:3306)/repro_w1ms?parseTime=true&loc=UTC&timeout=10s")
		if err != nil {
			fmt.Println("MYS OPEN-ERR:", err)
			return
		}
		defer con.Close()
		var created string
		err = con.QueryRow(`SELECT created_at FROM users LIMIT 1`).Scan(&created)
		fmt.Printf("MYS scan-DATETIME-into-string err=%v val=%q\n", err, created)
		var createdN sql.NullString
		err = con.QueryRow(`SELECT created_at FROM users LIMIT 1`).Scan(&createdN)
		fmt.Printf("MYS scan-DATETIME-into-NullString err=%v\n", err)
		nr := repository.NewNodeRepository(con)
		_, err = nr.ListNodes()
		fmt.Printf("MYS NodeRepository.ListNodes err=%v\n", err)
	case "pgscan":
		d := mustDialect("postgres")
		con, err := d.Open("postgres://kspanel:kspanel@localhost:5432/repro_w1?sslmode=disable")
		if err != nil {
			fmt.Println("PGS OPEN-ERR:", err)
			return
		}
		defer con.Close()
		var created string
		err = con.QueryRow(`SELECT created_at FROM users LIMIT 1`).Scan(&created)
		fmt.Printf("PGS scan-TIMESTAMP-into-string err=%v val=%q\n", err, created)
		var createdN sql.NullString
		err = con.QueryRow(`SELECT created_at FROM users LIMIT 1`).Scan(&createdN)
		fmt.Printf("PGS scan-TIMESTAMP-into-NullString err=%v\n", err)
	}
}
