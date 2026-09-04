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
	db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL)`)
	db.Exec(`CREATE TABLE ai_chat_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE ai_chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`INSERT INTO users (id, username) VALUES (1, 'alice')`)
	rows, err := db.Query(`SELECT t.id, t.title, t.created_at,
		(SELECT COUNT(*) FROM ai_chat_messages m WHERE m.thread_id = t.id)
		FROM ai_chat_threads t WHERE t.user_id = ? ORDER BY t.id DESC`, 1)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	fmt.Println("cols:", cols)
	n := 0
	for rows.Next() {
		n++
		var a, b, c, d any
		rows.Scan(&a, &b, &c, &d)
		fmt.Printf("row %d: %#v %#v %#v %#v\n", n, a, b, c, d)
	}
	fmt.Println("rows:", n, "err:", rows.Err())
}
