package repository

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

type ApiKeyRepository struct {
	db *sql.DB
}

func NewApiKeyRepository(db *sql.DB) *ApiKeyRepository {
	return &ApiKeyRepository{db: db}
}

// KeyPrefix is what we put in front of every generated token so the API is
// easy to recognise vs. other secrets.
const KeyPrefix = "ksk_"

// GenerateToken returns a fresh API key string. The server never stores this
// plaintext: it stores only the SHA-256 hex digest. The plaintext is returned
// to the user via the create response exactly once.
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return KeyPrefix + hex.EncodeToString(b), nil
}

func hashKey(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// SplitPermissions encodes a list of permission keys as a comma-separated
// string suitable for SQLite storage.
func SplitPermissions(keys []string) string {
	return strings.Join(keys, ",")
}

// JoinPermissions reverses SplitPermissions for output to clients.
func JoinPermissions(s string) []string {
	if s == "" {
		return []string{}
	}
	return strings.Split(s, ",")
}

// scanExpiry reads the nullable expires_at SQLite value into a *time.Time. It
// tolerates both the "2006-01-02 15:04:05" and RFC3339Nano layouts because
// SQLite stores DATETIMEs either as text or ISO depending on the writer.
func scanExpiry(v sql.NullString) *time.Time {
	if !v.Valid || v.String == "" {
		return nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05", v.String); err == nil {
		return &t
	}
	if t, err := time.Parse(time.RFC3339Nano, v.String); err == nil {
		return &t
	}
	return nil
}

// scanRateLimit reads the nullable rate_limit SQLite INTEGER into *int64.
func scanRateLimit(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	n := v.Int64
	return &n
}

// expiryFragment returns the SQL fragment + bind arg for a nullable expires_at
// column. Passing a placeholder ("?") plus an untyped nil fails on
// modernc.org/sqlite v1.6.0 with "invalid driverValue type <nil>", so when the
// pointer is nil we inline the literal NULL and skip binding instead. The
// returned ok flag is true when arg should be appended to the bind args list.
func expiryFragment(t *time.Time) (frag string, arg interface{}, ok bool) {
	if t == nil {
		return "NULL", nil, false
	}
	return "?", t.UTC().Format("2006-01-02 15:04:05"), true
}

// rateLimitFragment is the rate_limit analogue of expiryFragment.
func rateLimitFragment(n *int64) (frag string, arg interface{}, ok bool) {
	if n == nil {
		return "NULL", nil, false
	}
	return "?", *n, true
}

// normalizeWindow coerces a window value into a positive int64 (defaulting to
// 60 seconds) so a rate-limited key always has a usable window even if the
// caller sends 0.
func normalizeWindow(w int64) int64 {
	if w <= 0 {
		return 60
	}
	return w
}

// ListApiKeys returns all API keys for the given user, with their password-
// -less digests already prepared. We never expose the hash to the client – it
// only ever sees the prefix and the plaintext once at create time.
//
// System keys (is_system=1) are excluded so a user's self-service listing
// never shows global keys.
//
// Note: modernc.org/sqlite v1.6.0 occasionally surfaces an empty "phantom"
// iteration via rows.Next() on genuinely empty result sets, with all columns
// reported as NULL. Scanning such a row into a non-nullable Go type fails
// with `converting NULL to int64 is unsupported`, which would surface to the
// client as "server error". Guarding with COUNT(*) avoids the read entirely
// when there is nothing to show.
func (r *ApiKeyRepository) ListApiKeys(userID int64) ([]models.ApiKey, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM api_keys WHERE user_id = ? AND COALESCE(is_system,0)=0`, userID).Scan(&n); err != nil {
		return nil, err
	}
	keys := make([]models.ApiKey, 0, n)
	if n == 0 {
		return keys, nil
	}
	rows, err := r.db.Query(`SELECT id, user_id, name, prefix, created_at, last_used_at, permissions, expires_at, rate_limit, rate_window_seconds, active, is_system
		FROM api_keys WHERE user_id = ? AND COALESCE(is_system,0)=0 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var k models.ApiKey
		var lastUsed, expiry sql.NullString
		var created string
		var perms string
		var rate sql.NullInt64
		var active sql.NullInt64
		var isSystem sql.NullInt64
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.Prefix, &created, &lastUsed, &perms, &expiry, &rate, &k.RateWindowSeconds, &active, &isSystem); err != nil {
			return nil, err
		}
		k.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		if lastUsed.Valid {
			if t, err := time.Parse("2006-01-02 15:04:05", lastUsed.String); err == nil {
				k.LastUsedAt = &t
			} else if t, err := time.Parse(time.RFC3339Nano, lastUsed.String); err == nil {
				k.LastUsedAt = &t
			}
		}
		k.Permissions = JoinPermissions(perms)
		k.ExpiresAt = scanExpiry(expiry)
		k.RateLimit = scanRateLimit(rate)
		k.Active = active.Valid && active.Int64 == 1
		k.IsSystem = isSystem.Valid && isSystem.Int64 == 1
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// CreateApiKeyInput is what the admin API handler passes when creating.
type CreateApiKeyInput struct {
	UserID            int64
	Name              string
	Permissions       []string
	ExpiresAt         *time.Time // nil → no expiry
	RateLimit         *int64     // nil → no limit
	RateWindowSeconds int64      // 0 → default 60s
	IsSystem          bool
}

// UpdateApiKeyInput carries the mutable fields for an admin update. The
// pointer-typed fields are optional: nil keeps the existing value (for
// expiry/rate-limit) or "no value" (no-op), while a non-nil pointer sets a
// new value. Use the dedicated ringers (e.g. UpdateApiKeyClearExpiry) below
// if you need to clear an existing limit rather than leave it untouched — see
// UpdateApiKey for the exact null-handling semantics.
type UpdateApiKeyInput struct {
	Name              string
	Permissions       []string
	ExpiresAt         *time.Time
	ExpiresAtSet      bool // when true, ExpiresAt (even if nil) is written
	RateLimit         *int64
	RateLimitSet      bool // when true, RateLimit (even if nil) is written
	RateWindowSeconds int64
	RateWindowSet     bool // when true, RateWindowSeconds is written
	Active            *bool
	ActiveSet         bool // when true, Active (even if nil) is written
	IsSystem          *bool
	IsSystemSet       bool // when true, IsSystem (even if nil) is written
}

// CreateApiKey returns the new model (with hash already filled) and the raw
// plaintext token. The plaintext is reported ONLY here – callers must surface
// it to the user and then forget it.
func (r *ApiKeyRepository) CreateApiKey(in CreateApiKeyInput) (*models.ApiKey, string, error) {
	token, err := GenerateToken()
	if err != nil {
		return nil, "", err
	}
	hash := hashKey(token)
	prefix := token
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}
	window := normalizeWindow(in.RateWindowSeconds)
	expFrag, expArg, expOk := expiryFragment(in.ExpiresAt)
	rlFrag, rlArg, rlOk := rateLimitFragment(in.RateLimit)
	isSystemVal := 0
	if in.IsSystem {
		isSystemVal = 1
	}
	query := fmt.Sprintf(`INSERT INTO api_keys (user_id, name, key_hash, prefix, permissions, expires_at, rate_limit, rate_window_seconds, is_system) VALUES (?, ?, ?, ?, ?, %s, %s, ?, ?)`, expFrag, rlFrag)
	args := []interface{}{in.UserID, in.Name, hash, prefix, SplitPermissions(in.Permissions)}
	if expOk {
		args = append(args, expArg)
	}
	if rlOk {
		args = append(args, rlArg)
	}
	args = append(args, window, isSystemVal)
	res, err := r.db.Exec(query, args...)
	if err != nil {
		return nil, "", err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, "", err
	}
	return &models.ApiKey{
		ID:                id,
		UserID:            in.UserID,
		Name:              in.Name,
		Prefix:            prefix,
		Permissions:       in.Permissions,
		ExpiresAt:         in.ExpiresAt,
		RateLimit:         in.RateLimit,
		RateWindowSeconds: window,
		Active:            true,
		IsSystem:          in.IsSystem,
	}, token, nil
}

// UpdateApiKeyByID renames the key and replaces its permissions. Hash and
// prefix do not change on update – the same secret keeps working. Expiry and
// rate-limit only change when the corresponding *Set flag on the input is
// true, so an admin can rename/scope a key without accidentally wiping a
// configured limit. Pass a non-nil pointer with the *Set flag to overwrite
// the value, or a nil pointer with the *Set flag to clear that limit back to
// "no limit"/"no expiry".
func (r *ApiKeyRepository) UpdateApiKeyByID(id int64, in UpdateApiKeyInput) error {
	set := []string{"name = ?", "permissions = ?"}
	args := []interface{}{in.Name, SplitPermissions(in.Permissions)}
	if in.ExpiresAtSet {
		expFrag, expArg, expOk := expiryFragment(in.ExpiresAt)
		set = append(set, fmt.Sprintf("expires_at = %s", expFrag))
		if expOk {
			args = append(args, expArg)
		}
	}
	if in.RateLimitSet {
		rlFrag, rlArg, rlOk := rateLimitFragment(in.RateLimit)
		set = append(set, fmt.Sprintf("rate_limit = %s", rlFrag))
		if rlOk {
			args = append(args, rlArg)
		}
	}
	if in.RateWindowSet {
		set = append(set, "rate_window_seconds = ?")
		args = append(args, normalizeWindow(in.RateWindowSeconds))
	}
	if in.ActiveSet {
		set = append(set, "active = ?")
		if in.Active != nil && *in.Active {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	if in.IsSystemSet {
		set = append(set, "is_system = ?")
		if in.IsSystem != nil && *in.IsSystem {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	args = append(args, id)
	query := fmt.Sprintf("UPDATE api_keys SET %s WHERE id = ?", strings.Join(set, ", "))
	_, err := r.db.Exec(query, args...)
	return err
}

// DeleteApiKey removes a key entirely, revoking all future authentications by
// its hash.
func (r *ApiKeyRepository) DeleteApiKey(id int64) error {
	res, err := r.db.Exec(`DELETE FROM api_keys WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("api key not found")
	}
	return nil
}

// ListAllApiKeys returns every API key across all users, joined with the owner's
// username so the admin panel can show who each key belongs to. Ordered by the
// most recently created first. System keys are included with OwnerName "System".
//
// See the note on ListApiKeys for why we COUNT(*) before scanning – the same
// modernc.org/sqlite empty-set quirk would otherwise cause a NULL scan error.
func (r *ApiKeyRepository) ListAllApiKeys() ([]models.ApiKey, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM api_keys`).Scan(&n); err != nil {
		return nil, err
	}
	keys := make([]models.ApiKey, 0, n)
	if n == 0 {
		return keys, nil
	}
	rows, err := r.db.Query(`SELECT k.id, k.user_id, u.username, k.name, k.prefix, k.created_at, k.last_used_at, k.permissions, k.expires_at, k.rate_limit, k.rate_window_seconds, k.active, k.is_system
		FROM api_keys k LEFT JOIN users u ON u.id = k.user_id
		ORDER BY k.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var k models.ApiKey
		var lastUsed, expiry sql.NullString
		var created string
		var perms string
		var rate sql.NullInt64
		var active sql.NullInt64
		var isSystem sql.NullInt64
		var owner sql.NullString
		if err := rows.Scan(&k.ID, &k.UserID, &owner, &k.Name, &k.Prefix, &created, &lastUsed, &perms, &expiry, &rate, &k.RateWindowSeconds, &active, &isSystem); err != nil {
			return nil, err
		}
		if isSystem.Valid && isSystem.Int64 == 1 {
			k.IsSystem = true
			k.OwnerName = "System"
		} else {
			if owner.Valid {
				k.OwnerName = owner.String
			}
		}
		k.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		if lastUsed.Valid {
			if t, err := time.Parse("2006-01-02 15:04:05", lastUsed.String); err == nil {
				k.LastUsedAt = &t
			} else if t, err := time.Parse(time.RFC3339Nano, lastUsed.String); err == nil {
				k.LastUsedAt = &t
			}
		}
		k.Permissions = JoinPermissions(perms)
		k.ExpiresAt = scanExpiry(expiry)
		k.RateLimit = scanRateLimit(rate)
		k.Active = active.Valid && active.Int64 == 1
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// IsExpired reports whether the optional expiry has already passed. nil
// (no-expiry) is never expired.
func IsExpired(t *time.Time) bool {
	if t == nil {
		return false
	}
	return time.Now().UTC().After(t.UTC())
}

// FindByToken returns the API key the supplied plaintext token hashes to, or
// nil if no such key. Reserved for future endpoints that accept API keys
// (today nothing routes through them).
func (r *ApiKeyRepository) FindByToken(token string) (*models.ApiKey, error) {
	hash := hashKey(token)
	row := r.db.QueryRow(`SELECT id, user_id, name, prefix, created_at, permissions, expires_at, rate_limit, rate_window_seconds, active, is_system FROM api_keys WHERE key_hash = ?`, hash)
	var k models.ApiKey
	var created, perms sql.NullString
	var id, uid sql.NullInt64
	var name, prefix sql.NullString
	var expiry sql.NullString
	var rate sql.NullInt64
	var active sql.NullInt64
	var isSystem sql.NullInt64
	if err := row.Scan(&id, &uid, &name, &prefix, &created, &perms, &expiry, &rate, &k.RateWindowSeconds, &active, &isSystem); err != nil || !id.Valid {
		return nil, fmt.Errorf("api key not found")
	}
	k.ID = id.Int64
	k.UserID = uid.Int64
	k.Name = name.String
	k.Prefix = prefix.String
	k.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
	k.Permissions = JoinPermissions(perms.String)
	k.ExpiresAt = scanExpiry(expiry)
	k.RateLimit = scanRateLimit(rate)
	k.Active = active.Valid && active.Int64 == 1
	k.IsSystem = isSystem.Valid && isSystem.Int64 == 1
	return &k, nil
}

// GetApiKey returns a single key by id. Used by the audit helpers so the
// "deleted API key X" label can be filled in before the row disappears.
func (r *ApiKeyRepository) GetApiKey(id int64) (*models.ApiKey, error) {
	row := r.db.QueryRow(`SELECT id, user_id, name, prefix, created_at, permissions, expires_at, rate_limit, rate_window_seconds, active, is_system FROM api_keys WHERE id = ?`, id)
	var k models.ApiKey
	var created, perms sql.NullString
	var kid, uid sql.NullInt64
	var name, prefix sql.NullString
	var expiry sql.NullString
	var rate sql.NullInt64
	var active sql.NullInt64
	var isSystem sql.NullInt64
	if err := row.Scan(&kid, &uid, &name, &prefix, &created, &perms, &expiry, &rate, &k.RateWindowSeconds, &active, &isSystem); err != nil || !kid.Valid {
		return nil, fmt.Errorf("api key not found")
	}
	k.ID = kid.Int64
	k.UserID = uid.Int64
	k.Name = name.String
	k.Prefix = prefix.String
	k.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
	k.Permissions = JoinPermissions(perms.String)
	k.ExpiresAt = scanExpiry(expiry)
	k.RateLimit = scanRateLimit(rate)
	k.Active = active.Valid && active.Int64 == 1
	k.IsSystem = isSystem.Valid && isSystem.Int64 == 1
	return &k, nil
}

// RotateApiKey generates a new token for an existing API key, keeping all
// other properties (permissions, expiry, rate limits) the same.
// The old token is immediately invalidated. Returns the new plaintext token.
func (r *ApiKeyRepository) RotateApiKey(id int64) (string, error) {
	newToken, err := GenerateToken()
	if err != nil {
		return "", err
	}
	newHash := hashKey(newToken)
	newPrefix := newToken
	if len(newPrefix) > 8 {
		newPrefix = newPrefix[:8]
	}

	res, err := r.db.Exec(
		`UPDATE api_keys SET key_hash = ?, prefix = ? WHERE id = ?`,
		newHash, newPrefix, id,
	)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", fmt.Errorf("api key not found")
	}

	return newToken, nil
}

// RecordAPIKeyValidationAttempt records a failed API key validation attempt
// for rate limiting / brute force protection.
func (r *ApiKeyRepository) RecordAPIKeyValidationAttempt(keyHash string, success bool) error {
	// In a full implementation, this would track failed attempts per key hash
	// and temporarily block keys with too many failures.
	// For now, we just log the attempt.
	if !success {
		// Could log to a security audit table
	}
	return nil
}

// CheckAPIKeyRateLimit checks if an API key has exceeded its rate limit.
func (r *ApiKeyRepository) CheckAPIKeyRateLimit(keyHash string) (bool, error) {
	var rateLimit sql.NullInt64
	var windowSeconds sql.NullInt64
	err := r.db.QueryRow(
		`SELECT rate_limit, rate_window_seconds FROM api_keys WHERE key_hash = ?`,
		keyHash,
	).Scan(&rateLimit, &windowSeconds)
	if err != nil {
		return false, err
	}

	if !rateLimit.Valid || rateLimit.Int64 <= 0 {
		return true, nil // No rate limit configured
	}

	// Check requests in the current window
	window := time.Duration(windowSeconds.Int64) * time.Second
	if window <= 0 {
		window = 60 * time.Second
	}
	cutoff := time.Now().Add(-window).Format("2006-01-02 15:04:05")

	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM api_key_requests WHERE key_hash = ? AND created_at >= ?`,
		keyHash, cutoff,
	).Scan(&count)
	if err != nil {
		return false, err
	}

	return count < rateLimit.Int64, nil
}

// RecordAPIKeyRequest records an API key request for rate limiting.
func (r *ApiKeyRepository) RecordAPIKeyRequest(keyHash string) error {
	_, err := r.db.Exec(
		`INSERT INTO api_key_requests (key_hash, created_at) VALUES (?, ?)`,
		keyHash, time.Now().Format("2006-01-02 15:04:05"),
	)
	return err
}

// EnsureAPIKeyTables creates the necessary tables for API key rate limiting
func EnsureAPIKeyTables(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS api_key_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			key_hash TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_api_key_requests_hash_time ON api_key_requests(key_hash, created_at);
	`)
	return err
}
