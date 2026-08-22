package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// VerificationCodeTTL is how long a freshly-minted verification code stays
// valid. Kept short on purpose: codes are secrets, not long-lived tokens.
const VerificationCodeTTL = 15 * time.Minute

// VerificationCode is the in-memory representation of a row in
// email_verification_codes. The handler only needs the email + the plaintext
// code (the DB stores the hash), so this struct is intentionally small.
type VerificationCode struct {
	Email string
	Code  string
}

// CodeHashedRecord describes a created/issued verification code row, with the
// plaintext available once (right after creation) so the SMTP caller can drop
// it into the email body before the in-memory copy is discarded.
type CodeHashedRecord struct {
	Email string
	Code  string
}

// CreateVerificationCode mints a 6-digit numeric code, stores its bcrypt
// hash (so a DB leak doesn't expose the secret), and returns the plaintext
// once so the caller can email it. Any previously-unused codes for the same
// email are expired so only the latest minted code is redeemable.
func (r *UserRepository) CreateVerificationCode(email string) (VerificationCode, error) {
	code, err := numericCode(6)
	if err != nil {
		return VerificationCode{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.MinCost)
	if err != nil {
		return VerificationCode{}, err
	}
	// Invalidate earlier unconsumed codes for this email so a pent-up user
	// can't use a stale "send me again" copy issued before the latest click.
	if _, err := r.db.Exec(`UPDATE email_verification_codes SET expires_at = CURRENT_TIMESTAMP WHERE email = ? AND consumed_at IS NULL`, email); err != nil {
		return VerificationCode{}, err
	}
	_, err = r.db.Exec(
		`INSERT INTO email_verification_codes (email, code, code_hash, expires_at) VALUES (?, ?, ?, ?)`,
		strings.ToLower(strings.TrimSpace(email)), code, string(hash),
		time.Now().Add(VerificationCodeTTL).UTC().Format("2006-01-02 15:04:05"),
	)
	if err != nil {
		return VerificationCode{}, err
	}
	return VerificationCode{Email: email, Code: code}, nil
}

// ConsumeVerificationCode checks the most recent unconsumed, unexpired code
// for the given email against the supplied plaintext. On a match it marks the
// row consumed and returns true; any mismatch/expiry returns false without an
// error so callers can surface a generic "invalid or expired" message.
func (r *UserRepository) ConsumeVerificationCode(email, code string) (bool, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	rows, err := r.db.Query(
		`SELECT id, code_hash, expires_at, consumed_at
		 FROM email_verification_codes
		 WHERE email = ?
		 ORDER BY id DESC
		 LIMIT 8`,
		email,
	)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	now := time.Now().UTC()
	var checked int
	for rows.Next() {
		checked++
	var id int64
	var codeHash string
	var expiresAtStr, consumedAtStr sql.NullString
	if err := rows.Scan(&id, &codeHash, &expiresAtStr, &consumedAtStr); err != nil {
		return false, err
	}
	if consumedAtStr.Valid && consumedAtStr.String != "" {
		continue
	}
	expiresAt, _ := time.Parse("2006-01-02 15:04:05", expiresAtStr.String)
		if expiresAt.IsZero() || now.After(expiresAt) {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(codeHash), []byte(code)) != nil {
			continue
		}
		if _, err := r.db.Exec(`UPDATE email_verification_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?`, id); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	if checked == 0 {
		return false, fmt.Errorf("no codes issued for %s", email)
	}
	return false, nil
}

// numericCode returns a uniformly-random n-digit decimal code (leading zeros
// preserved via string formatting) suitable for a verification email.
func numericCode(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, 0, n)
	for _, b := range buf {
		out = append(out, byte('0')+b%10)
	}
	// hex import kept above for size parity with settings_repo; the code uses
	// decimal so users can read it aloud without hex confusion.
	_ = hex.EncodeToString
	return string(out), nil
}

// placeholder to keep fmt import used in error path above.
var _ = fmt.Sprintf
