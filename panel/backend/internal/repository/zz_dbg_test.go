package repository

import (
	"database/sql"
	"fmt"
	"testing"

	_ "modernc.org/sqlite"
)

func dump(t *testing.T, db *sql.DB, q string, args ...any) {
	rows, err := db.Query(q, args...)
	if err != nil {
		fmt.Println("query err:", err)
		return
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	fmt.Println("cols:", cols)
	n := 0
	for rows.Next() {
		n++
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		fmt.Printf("row %d: %#v\n", n, vals)
	}
	fmt.Println("rows:", n, "err:", rows.Err())
}

func TestZZDbgShape(t *testing.T) {
	db, _ := sql.Open("sqlite", ":memory:")
	defer db.Close()
	db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL)`)
	db.Exec(`CREATE TABLE ai_chat_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`CREATE TABLE ai_chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	db.Exec(`INSERT INTO users (id, username) VALUES (1, 'alice')`)
	fmt.Println("== List shape, empty threads:")
	dump(t, db, `SELECT t.id, t.title, t.created_at,
		(SELECT COUNT(*) FROM ai_chat_messages m WHERE m.thread_id = t.id)
		FROM ai_chat_threads t WHERE t.user_id = ? ORDER BY t.id DESC`, 1)
	fmt.Println("== LastMessages shape, empty msgs:")
	dump(t, db, `SELECT id, role, content FROM ai_chat_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?`, 1, 50)
	fmt.Println("== Owned shape, missing row:")
	dump(t, db, `SELECT id, title, created_at FROM ai_chat_threads WHERE id = ? AND user_id = ?`, 1, 1)
	fmt.Println("== JOIN+GROUP shape, empty threads:")
	dump(t, db, `SELECT t.id, t.title, t.created_at, COUNT(m.id) FROM ai_chat_threads t LEFT JOIN ai_chat_messages m ON m.thread_id = t.id WHERE t.user_id = ? GROUP BY t.id, t.title, t.created_at ORDER BY t.id DESC`, 1)
}
