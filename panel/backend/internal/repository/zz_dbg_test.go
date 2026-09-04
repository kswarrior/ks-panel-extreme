package repository

import (
	"database/sql"
	"fmt"
	"os"
	"testing"

	_ "modernc.org/sqlite"
)

func TestZZDbgShape(t *testing.T) {
	path := "/tmp/zzdbg.db"
	os.Remove(path)
	db, _ := sql.Open("sqlite", path)
	defer db.Close()
	db.Exec("PRAGMA foreign_keys = ON")
	db.Exec("PRAGMA journal_mode = WAL")
	db.Exec("PRAGMA busy_timeout = 5000")
	db.Exec(`CREATE TABLE plain (id INTEGER PRIMARY KEY, name TEXT)`)
	rows, _ := db.Query(`SELECT id FROM plain`)
	n := 0
	for rows.Next() {
		n++
	}
	rows.Close()
	fmt.Println("filedb empty rows:", n, "err:", rows.Err())
	var id int64
	err := db.QueryRow(`SELECT id FROM plain WHERE id = 1`).Scan(&id)
	fmt.Println("filedb queryrow err:", err)
}
