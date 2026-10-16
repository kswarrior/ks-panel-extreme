package repository

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// newTestNodeConfigTokenDB opens a fresh in-memory SQLite carrying only the
// node columns the one-time config-token flow touches. One row (id 7) is
// seeded so Mint/Rotate have a target.
func newTestNodeConfigTokenDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	stmts := []string{
		`CREATE TABLE nodes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			token_hash TEXT NOT NULL DEFAULT '',
			token_prefix TEXT NOT NULL DEFAULT '',
			token_plain TEXT NOT NULL DEFAULT '',
			config_token_hash TEXT,
			config_token_expires_at DATETIME)`,
		`INSERT INTO nodes (id) VALUES (7)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return db
}

func TestConfigTokenMintConsumeIsSingleUse(t *testing.T) {
	db := newTestNodeConfigTokenDB(t)
	repo := NewNodeRepository(db)

	token, err := repo.MintConfigToken(7, time.Minute)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if len(token) == 0 || token[:4] != ConfigTokenPrefix {
		t.Fatalf("token %q must carry prefix %q", token, ConfigTokenPrefix)
	}

	id, err := repo.ConsumeConfigToken(token)
	if err != nil {
		t.Fatalf("first consume must succeed: %v", err)
	}
	if id != 7 {
		t.Fatalf("consume returned node %d, want 7", id)
	}

	if _, err := repo.ConsumeConfigToken(token); err == nil {
		t.Fatal("replay of a consumed token must fail")
	}
	// The digest must be blanked in the row after consumption.
	var hash sql.NullString
	if err := db.QueryRow(`SELECT config_token_hash FROM nodes WHERE id = 7`).Scan(&hash); err != nil {
		t.Fatalf("read row: %v", err)
	}
	if hash.Valid && hash.String != "" {
		t.Fatalf("hash must be cleared after consume, got %q", hash.String)
	}
}

func TestConfigTokenUnknownAndEmptyFail(t *testing.T) {
	db := newTestNodeConfigTokenDB(t)
	repo := NewNodeRepository(db)

	if _, err := repo.ConsumeConfigToken("ksc_deadbeef"); err == nil {
		t.Fatal("unknown token must fail")
	}
	if _, err := repo.ConsumeConfigToken("   "); err == nil {
		t.Fatal("empty token must fail")
	}
}

func TestConfigTokenExpires(t *testing.T) {
	db := newTestNodeConfigTokenDB(t)
	repo := NewNodeRepository(db)

	token, err := repo.MintConfigToken(7, 30*time.Millisecond)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	time.Sleep(60 * time.Millisecond)
	if _, err := repo.ConsumeConfigToken(token); err == nil {
		t.Fatal("expired token must fail")
	}
	// Expired redemption burns the token so it can never be replayed.
	if _, err := repo.ConsumeConfigToken(token); err == nil {
		t.Fatal("expired token must stay dead after the failed attempt")
	}
}

func TestConfigTokenMintReplacesPrevious(t *testing.T) {
	db := newTestNodeConfigTokenDB(t)
	repo := NewNodeRepository(db)

	first, err := repo.MintConfigToken(7, time.Minute)
	if err != nil {
		t.Fatalf("mint 1: %v", err)
	}
	second, err := repo.MintConfigToken(7, time.Minute)
	if err != nil {
		t.Fatalf("mint 2: %v", err)
	}
	if _, err := repo.ConsumeConfigToken(first); err == nil {
		t.Fatal("replaced token must no longer redeem")
	}
	if _, err := repo.ConsumeConfigToken(second); err != nil {
		t.Fatalf("fresh token must redeem: %v", err)
	}
}

func TestRotateTokenClearsConfigToken(t *testing.T) {
	db := newTestNodeConfigTokenDB(t)
	repo := NewNodeRepository(db)

	token, err := repo.MintConfigToken(7, time.Minute)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if _, err := repo.RotateToken(7); err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if _, err := repo.ConsumeConfigToken(token); err == nil {
		t.Fatal("rotating the edge token must invalidate outstanding config tokens")
	}
}
