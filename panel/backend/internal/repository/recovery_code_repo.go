package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/auth"
)

// RecoveryCodeRepository stores single-use MFA recovery codes as bcrypt
// hashes. Plaintext codes exist only in the generation response — they are
// never logged or echoed again (same contract as the Authority app secret).
type RecoveryCodeRepository struct {
	db *sql.DB
}

func NewRecoveryCodeRepository(db *sql.DB) *RecoveryCodeRepository {
	return &RecoveryCodeRepository{db: db}
}

// ReplaceForUser atomically swaps a user's code set for freshly hashed
// replacements. Generating a new set invalidates all previous ones.
func (r *RecoveryCodeRepository) ReplaceForUser(userID int64, codes []string) error {
	if len(codes) == 0 {
		return nil
	}
	hashes := make([]string, 0, len(codes))
	for _, c := range codes {
		h, err := auth.HashPassword(c)
		if err != nil {
			return fmt.Errorf("recovery_codes hash: %w", err)
		}
		hashes = append(hashes, h)
	}
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM recovery_codes WHERE user_id = ?`, userID); err != nil {
		return fmt.Errorf("recovery_codes clear: %w", err)
	}
	for _, h := range hashes {
		if _, err := tx.Exec(
			`INSERT INTO recovery_codes (user_id, code_hash, used) VALUES (?, ?, 0)`,
			userID, h,
		); err != nil {
			return fmt.Errorf("recovery_codes insert: %w", err)
		}
	}
	return tx.Commit()
}

// Summary returns how many users hold at least one recovery code and how
// many unused codes exist in total (the Authentication tab's status tiles).
func (r *RecoveryCodeRepository) Summary() (usersWithCodes int64, unusedTotal int64, err error) {
	if err = r.db.QueryRow(`SELECT COUNT(DISTINCT user_id) FROM recovery_codes`).Scan(&usersWithCodes); err != nil {
		return 0, 0, err
	}
	if err = r.db.QueryRow(`SELECT COUNT(*) FROM recovery_codes WHERE used = 0`).Scan(&unusedTotal); err != nil {
		return 0, 0, err
	}
	return usersWithCodes, unusedTotal, nil
}

// Consume validates code against the user's UNUSED codes and marks the
// first match used. Returns false when no code matches. The bcrypt compare
// runs against every unused row so timing does not leak which row matched.
func (r *RecoveryCodeRepository) Consume(userID int64, code string) (bool, error) {
	if code == "" {
		return false, nil
	}
	rows, err := r.db.Query(
		`SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used = 0`,
		userID,
	)
	if err != nil {
		return false, err
	}
	type candidate struct {
		id   int64
		hash string
	}
	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.id, &c.hash); err != nil {
			rows.Close()
			return false, err
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return false, err
	}
	rows.Close()

	matchedID := int64(0)
	for _, c := range candidates {
		if auth.CheckPasswordHash(code, c.hash) == nil {
			matchedID = c.id
			break
		}
	}
	if matchedID == 0 {
		return false, nil
	}
	res, err := r.db.Exec(
		`UPDATE recovery_codes SET used = 1, used_at = ? WHERE id = ? AND used = 0`,
		time.Now().UTC().Format("2006-01-02 15:04:05"), matchedID,
	)
	if err != nil {
		return false, err
	}
	if n, e := res.RowsAffected(); e == nil && n == 0 {
		return false, nil // consumed concurrently
	}
	return true, nil
}
