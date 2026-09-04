package repository

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// newTestAIDB opens a fresh in-memory SQLite with the 066 AI tables.
func newTestAIDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	stmts := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL)`,
		`CREATE TABLE ai_confirmation_tickets (
			id VARCHAR(64) PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			tool TEXT NOT NULL DEFAULT '', args_json TEXT NOT NULL DEFAULT '{}',
			summary TEXT NOT NULL DEFAULT '', diff TEXT NOT NULL DEFAULT '',
			expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE ai_chat_threads (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE ai_chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			thread_id INTEGER NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
			role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`INSERT INTO users (id, username) VALUES (1, 'alice'), (2, 'bob')`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return db
}

func TestTicketStoreTakeIsSingleUseAndUserBound(t *testing.T) {
	db := newTestAIDB(t)
	repo := NewAITicketRepository(db)

	if err := repo.Store(&AITicketRow{
		ID: "t1", UserID: 1, Tool: "create_theme", ArgsJSON: `{"name":"x"}`,
		Summary: "s", Diff: "d", ExpiresAt: time.Now().UTC().Add(10 * time.Minute),
	}); err != nil {
		t.Fatalf("store: %v", err)
	}

	// Wrong user cannot take it — and the ticket must survive the attempt.
	if _, ok := repo.Take("t1", 2); ok {
		t.Fatal("other user's take must fail")
	}
	got, ok := repo.Take("t1", 1)
	if !ok {
		t.Fatal("owner take must succeed")
	}
	if got.Tool != "create_theme" || got.ArgsJSON != `{"name":"x"}` || got.Summary != "s" {
		t.Fatalf("take lost fields: %+v", got)
	}
	// Second take (replay) must fail: single-use.
	if _, ok := repo.Take("t1", 1); ok {
		t.Fatal("replay take must fail")
	}
}

func TestTicketExpiredIsUntakeableAndSwept(t *testing.T) {
	db := newTestAIDB(t)
	repo := NewAITicketRepository(db)

	if err := repo.Store(&AITicketRow{
		ID: "old", UserID: 1, Tool: "x", ExpiresAt: time.Now().UTC().Add(-time.Minute),
	}); err != nil {
		t.Fatalf("store: %v", err)
	}
	if _, ok := repo.Take("old", 1); ok {
		t.Fatal("expired ticket must not be takeable")
	}
	// Storing a new ticket sweeps the expired row.
	if err := repo.Store(&AITicketRow{
		ID: "fresh", UserID: 1, Tool: "y", ExpiresAt: time.Now().UTC().Add(time.Minute),
	}); err != nil {
		t.Fatalf("store: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_confirmation_tickets WHERE id = 'old'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("expired row must be swept on store")
	}
}

func TestThreadIsolationAndWindow(t *testing.T) {
	db := newTestAIDB(t)
	repo := NewAIThreadRepository(db)

	alice, err := repo.Create(1, "Alice thread")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := repo.Create(2, ""); err != nil {
		t.Fatalf("create with default title: %v", err)
	}

	// Bob cannot see, read, rename or delete Alice's thread.
	if _, err := repo.Owned(2, alice); err == nil {
		t.Fatal("cross-user Owned must fail")
	}
	if _, err := repo.LastMessages(2, alice, 10); err == nil {
		t.Fatal("cross-user LastMessages must fail")
	}
	if err := repo.Rename(2, alice, "hijack"); err == nil {
		t.Fatal("cross-user Rename must fail")
	}
	if err := repo.Delete(2, alice); err == nil {
		t.Fatal("cross-user Delete must fail")
	}
	if err := repo.AddMessage(2, alice, "user", "hi"); err == nil {
		t.Fatal("cross-user AddMessage must fail")
	}

	// Owner writes 55 turns; the window returns the last 50, oldest-first.
	for i := 0; i < 55; i++ {
		role := "user"
		if i%2 == 1 {
			role = "assistant"
		}
		if err := repo.AddMessage(1, alice, role, "msg"); err != nil {
			t.Fatalf("add %d: %v", i, err)
		}
	}
	msgs, err := repo.LastMessages(1, alice, 500)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 50 {
		t.Fatalf("window must clamp to 50, got %d", len(msgs))
	}
	for i := 1; i < len(msgs); i++ {
		if msgs[i].ID <= msgs[i-1].ID {
			t.Fatal("messages must come back oldest-first")
		}
	}

	// List shows newest first with counts; rename + delete work for owner.
	if err := repo.Rename(1, alice, "Renamed"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	list, err := repo.List(1)
	if err != nil || len(list) != 1 || list[0].Title != "Renamed" || list[0].MsgCount != 55 {
		t.Fatalf("list wrong: %+v err=%v", list, err)
	}
	if err := repo.Delete(1, alice); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := repo.Owned(1, alice); err == nil {
		t.Fatal("deleted thread must be gone")
	}
}

func TestAddMessageRejectsBadRole(t *testing.T) {
	db := newTestAIDB(t)
	repo := NewAIThreadRepository(db)
	id, _ := repo.Create(1, "t")
	if err := repo.AddMessage(1, id, "system", "x"); err == nil {
		t.Fatal("non user/assistant role must be rejected")
	}
	if err := repo.AddMessage(1, id, "user", "   "); err == nil {
		t.Fatal("blank content must be rejected")
	}
	if err := repo.AddMessage(1, id, "user", "ok"); err != nil {
		t.Fatalf("valid message rejected: %v", err)
	}
}

// Empty tables must read as empty, not error: the pinned sqlite driver
// yields one all-NULL phantom row for empty result sets, and List /
// LastMessages skip NULL-id rows so a fresh user gets [] instead of a 500.
func TestEmptyTablesReadAsEmpty(t *testing.T) {
	db := newTestAIDB(t)
	repo := NewAIThreadRepository(db)
	list, err := repo.List(1)
	if err != nil {
		t.Fatalf("List on empty: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("List on empty must be [], got %+v", list)
	}
	id, err := repo.Create(1, "t")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	msgs, err := repo.LastMessages(1, id, 50)
	if err != nil {
		t.Fatalf("LastMessages on empty: %v", err)
	}
	if len(msgs) != 0 {
		t.Fatalf("LastMessages on empty must be [], got %+v", msgs)
	}
}
