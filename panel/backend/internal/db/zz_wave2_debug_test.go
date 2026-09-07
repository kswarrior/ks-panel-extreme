package db

import (
	"fmt"
	"testing"
)

// TEMPORARY Wave-2 debug (deleted after use).
func TestTempWave2DebugRewrite(t *testing.T) {
	stmt := "CREATE TABLE IF NOT EXISTS users (\n    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n    username TEXT NOT NULL UNIQUE,\n    email TEXT NOT NULL UNIQUE,\n    password_hash TEXT NOT NULL,\n    role_id INTEGER NOT NULL,\n    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT\n)"
	s1 := rewriteBigintPKForMySQL(stmt)
	fmt.Printf("after M3:\n%s\n---\n", s1)
	s2 := rewriteTextColumnDefsForMySQL(s1)
	fmt.Printf("after M1:\n%s\n---\n", s2)
}
