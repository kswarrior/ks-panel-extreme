package repository

import (
	"database/sql"
	"fmt"
)

// PasswordHistoryRepository persists the bcrypt hashes of users' OUTGOING
// passwords so auth.ValidatePasswordWithHistory can actually reject reuse.
// Before 043_auth_hardening.sql this check ran against an empty slice —
// the plumbing existed, the storage didn't.
type PasswordHistoryRepository struct {
	db *sql.DB
}

func NewPasswordHistoryRepository(db *sql.DB) *PasswordHistoryRepository {
	return &PasswordHistoryRepository{db: db}
}

// Add records a password hash in the user's history and trims the list to
// the newest `keep` entries. The hash MUST already be bcrypt (callers pass
// the hash they just replaced, never plaintext). A keep <= 0 stores
// nothing — history tracking is disabled by configuration.
func (r *PasswordHistoryRepository) Add(userID int64, hash string, keep int) error {
	if keep <= 0 || hash == "" {
		return nil
	}
	if _, err := r.db.Exec(
		`INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)`,
		userID, hash,
	); err != nil {
		return fmt.Errorf("password_history insert: %w", err)
	}
	// Trim to the newest `keep` rows (highest ids). LIMIT inside the
	// subquery is supported by SQLite, PostgreSQL and MySQL alike.
	_, err := r.db.Exec(
		`DELETE FROM password_history WHERE user_id = ? AND id NOT IN (
			SELECT id FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?
		)`, userID, userID, keep)
	if err != nil {
		return fmt.Errorf("password_history trim: %w", err)
	}
	return nil
}

// ListHashes returns up to limit stored hashes for the user, newest first.
// Errors surface to the caller so a failing history read cannot silently
// weaken the reuse check.
func (r *PasswordHistoryRepository) ListHashes(userID int64, limit int) ([]string, error) {
	rows, err := r.db.Query(
		`SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return out, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}
