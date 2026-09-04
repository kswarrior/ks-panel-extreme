package repository

import (
	"database/sql"
	"fmt"
	"testing"

	_ "modernc.org/sqlite"
)

func TestZZDbgShape(t *testing.T) {
	db, _ := sql.Open("sqlite", ":memory:")
	defer db.Close()
	fmt.Println("stats:", db.Stats())
	db.Exec(`CREATE TABLE plain (id INTEGER PRIMARY KEY, name TEXT)`)
	rows, _ := db.Query(`SELECT name FROM sqlite_master WHERE type='table'`)
	for rows.Next() {
		var n string
		rows.Scan(&n)
		fmt.Println("table:", n)
	}
	rows.Close()
	db.SetMaxOpenConns(1)
	rows2, _ := db.Query(`SELECT id FROM plain`)
	n := 0
	for rows2.Next() {
		n++
	}
	rows2.Close()
	fmt.Println("with MaxOpenConns(1) empty rows:", n)
}
