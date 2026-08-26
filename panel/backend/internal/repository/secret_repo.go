package repository

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
)

// SecretRepository is the per-instance encrypted env / secret vault backed by
// the instance_secrets table (migration 021).
//
// Storage model: each row carries (instance_id, key) and a value_blob. For
// secrets (is_secret=1) the blob is AES-256-GCM ciphertext produced from a
// panel-wide master key: nonce(12) || ciphertext || tag. For plain env
// (is_secret=0) the cleartext is stored verbatim (it is, by definition, not
// sensitive) so listing / no-decode paths avoid touching crypto entirely.
//
// The clear master key comes from the KSPANEL_MASTER_KEY env var (SHA-256'd to
// the 32 bytes AES-256 needs); when unset the panel falls back to a
// deterministic install key derived from the panel's data directory so a
// first-launch panel still encrypts without operator config. An operator who
// wants real secrecy sets KSPANEL_MASTER_KEY.
//
// ListByInstance never returns cleartext for secret rows — the Secrets page
// only shows metadata + a masked indicator; Reveal() is the single audited
// path that decrypts. ResolvedEnv() decrypts silently for the scheduler /
// deploy merge step.
type SecretRepository struct {
	db *sql.DB
}

// SecretEntry is the masked view ListByInstance returns. `Value` is a masked
// placeholder for secret rows (never the cleartext) so a GET-by-id dump can't
// leak secrets; plain env rows carry their cleartext since they aren't secret.
type SecretEntry struct {
	ID          int64  `json:"id"`
	InstanceID  int64  `json:"instance_id"`
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsSecret    bool   `json:"is_secret"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// NewSecretRepository returns a vault repo bound to the given connection.
func NewSecretRepository(db *sql.DB) *SecretRepository { return &SecretRepository{db: db} }

// ListByInstance returns every row for an instance in key order, with secret
// values masked. Plain env rows expose their cleartext Value.
//
// modernc.org/sqlite occasionally surfaces a phantom all-NULL iteration via
// rows.Next() for genuinely empty result sets; scanning straight into a
// non-null int64 then crashes with "converting NULL to int64". We guard with
// a COUNT(*) pre-pass AND scan into sql.Null* so the phantom row, if it
// appears, is silently skipped instead of failing the whole list call.
func (r *SecretRepository) ListByInstance(instanceID int64) ([]SecretEntry, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_secrets WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]SecretEntry, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(
		`SELECT id, instance_id, `+qKey()+`, value_blob, is_secret, description, created_at, updated_at
		 FROM instance_secrets WHERE instance_id = ? ORDER BY `+qKey()+` ASC`,
		instanceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var e SecretEntry
		var id, instID sql.NullInt64
		var blob []byte
		var isSecret sql.NullInt64
		var key, desc, created, updated sql.NullString
		if err := rows.Scan(&id, &instID, &key, &blob, &isSecret, &desc, &created, &updated); err != nil {
			return nil, err
		}
		// Skip the modernc phantom-NULL row: if `id` is NULL, there's no real
		// row here. Carrying on past it would emit a fake row with all-zero
		// fields and a junk "key" of "".
		if !id.Valid {
			continue
		}
		e.ID = id.Int64
		e.InstanceID = instID.Int64
		e.Key = key.String
		e.Description = desc.String
		e.CreatedAt = created.String
		e.UpdatedAt = updated.String
		e.IsSecret = isSecret.Int64 == 1
		if e.IsSecret {
			// Never surface cleartext from a list call; show an empty Value so
			// the UI renders "•••• (secret)" from the IsSecret flag alone.
			e.Value = ""
		} else {
			// Plain env: the blob is the cleartext stored verbatim.
			e.Value = string(blob)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Set upserts one (instance_id, key) row. isSecret toggles encryption (secrets
// encrypted; plain env stored raw). Returns the row id (0 on the UPDATE path
// since SQLite's LastInsertId is undefined for ON CONFLICT).
func (r *SecretRepository) Set(instanceID int64, key, value string, isSecret bool, description string) (int64, error) {
	if key == "" {
		return 0, errors.New("secret: key is required")
	}
	var blob []byte
	if isSecret {
		enc, err := sealSecret([]byte(value))
		if err != nil {
			return 0, fmt.Errorf("secret: encrypt: %w", err)
		}
		blob = enc
	} else {
		blob = []byte(value)
	}
	secretFlag := 0
	if isSecret {
		secretFlag = 1
	}
	if _, err := r.db.Exec(
		`INSERT INTO instance_secrets (instance_id, `+qKey()+`, value_blob, is_secret, description)
		 VALUES (?, ?, ?, ?, ?)`+upsertSet("(instance_id, key)",
			[]string{"value_blob", "is_secret", "description"}, "updated_at = CURRENT_TIMESTAMP"),
		instanceID, key, blob, secretFlag, description,
	); err != nil {
		return 0, err
	}
	// LastInsertId is unreliable on the ON CONFLICT UPDATE path, so fetch the
	// row id explicitly. Callers use it for the 201 body but tolerate 0.
	var id int64
	if err := r.db.QueryRow(
		`SELECT id FROM instance_secrets WHERE instance_id = ? AND `+qKey()+` = ?`,
		instanceID, key,
	).Scan(&id); err != nil {
		return 0, nil
	}
	return id, nil
}

// Reveal returns the decrypted (or raw) value for one (instance_id, key).
// Used by the explicitly-audited Reveal endpoint. Returns ErrSecretNotFound
// when no row matches so the handler maps it to 404.
func (r *SecretRepository) Reveal(instanceID int64, key string) (string, error) {
	var blob []byte
	var isSecret int
	err := r.db.QueryRow(
		`SELECT value_blob, is_secret FROM instance_secrets WHERE instance_id = ? AND `+qKey()+` = ?`,
		instanceID, key,
	).Scan(&blob, &isSecret)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrSecretNotFound
	}
	if err != nil {
		return "", err
	}
	if isSecret == 1 {
		plain, err := openSecret(blob)
		if err != nil {
			return "", fmt.Errorf("secret: decrypt: %w", err)
		}
		return string(plain), nil
	}
	return string(blob), nil
}

// Delete removes one (instance_id, key) row. Returns ErrSecretNotFound when
// no row matched so the handler maps it to 404.
func (r *SecretRepository) Delete(instanceID int64, key string) error {
	res, err := r.db.Exec(`DELETE FROM instance_secrets WHERE instance_id = ? AND `+qKey()+` = ?`, instanceID, key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrSecretNotFound
	}
	return nil
}

// ResolvedEnv maps a job's declared secret_refs (a list of keys) to parallel
// key/value slices ready to hand to the edge exec as an env map. Missing keys
// are skipped — the returned slices are aligned by REQUEST order minus absent
// refs, so callers never see a key without its matching value.
func (r *SecretRepository) ResolvedEnv(instanceID int64, refs []string) (keys, vals []string, err error) {
	keys, vals = []string{}, []string{}
	if len(refs) == 0 {
		return keys, vals, nil
	}
	// Dedup the refs so one SQL fetch resolves each key once; the order is
	// rebuilt from the (deduped) request below.
	uniq := dedupSecretRefs(refs)
	placeholders := ""
	args := make([]any, 0, len(uniq)+1)
	args = append(args, instanceID)
	for i, ref := range uniq {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args = append(args, ref)
	}
	q := `SELECT ` + qKey() + `, value_blob, is_secret FROM instance_secrets
	      WHERE instance_id = ? AND ` + qKey() + ` IN (` + placeholders + `)`
	rows, err := r.db.Query(q, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	resolved := make(map[string]string, len(uniq))
	for rows.Next() {
		var key string
		var blob []byte
		var isSecret int
		if err := rows.Scan(&key, &blob, &isSecret); err != nil {
			return nil, nil, err
		}
		if isSecret == 1 {
			plain, derr := openSecret(blob)
			if derr != nil {
				// Skip a row that won't decrypt instead of failing the whole
				// run; the job runs without that var and the run is logged.
				continue
			}
			resolved[key] = string(plain)
		} else {
			resolved[key] = string(blob)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	// Rebuild in request order, skipping keys not present in the vault.
	for _, ref := range uniq {
		if v, ok := resolved[ref]; ok {
			keys = append(keys, ref)
			vals = append(vals, v)
		}
	}
	return keys, vals, nil
}

// dedupSecretRefs preserves order while dropping repeats.
func dedupSecretRefs(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// ErrSecretNotFound is returned by Reveal/Delete when no row matches the key.
var ErrSecretNotFound = errors.New("secret not found")

// ---------------------------------------------------------------------------
// AES-256-GCM vault. The master key is resolved ONCE per process and cached;
// deriving from the env / data path per call would be wasteful and (worse)
// would let a runtime env change silently re-key the vault mid-process.
// ---------------------------------------------------------------------------

var (
	masterKeyOnce sync.Once
	masterKey     []byte
)

// masterKeyBytes resolves the 32-byte AES key:
//  1. KSPANEL_MASTER_KEY env if set (SHA-256'd so any string works as a key).
//  2. A deterministic install key (SHA-256 of the panel data dir) so a
//     first-launch panel without operator config still encrypts.
func masterKeyBytes() ([]byte, error) {
	masterKeyOnce.Do(func() {
		if mk := os.Getenv("KSPANEL_MASTER_KEY"); mk != "" {
			sum := sha256.Sum256([]byte(mk))
			masterKey = make([]byte, 32)
			copy(masterKey, sum[:])
			return
		}
		seed := "kspanel-default-vault:" + dataDirDefault()
		sum := sha256.Sum256([]byte(seed))
		masterKey = make([]byte, 32)
		copy(masterKey, sum[:])
	})
	if len(masterKey) != 32 {
		return nil, errors.New("vault: master key not initialised")
	}
	return masterKey, nil
}

// dataDirDefault returns the panel's data directory, used as a per-install
// salt for the fallback master key.
func dataDirDefault() string {
	if v := os.Getenv("KSPANEL_DATA_DIR"); v != "" {
		return v
	}
	return "."
}

// sealSecret encrypts plaintext with AES-256-GCM and returns nonce||cipher.
func sealSecret(plain []byte) ([]byte, error) {
	key, err := masterKeyBytes()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, plain, nil)
	out := make([]byte, 0, len(nonce)+len(ct))
	out = append(out, nonce...)
	out = append(out, ct...)
	return out, nil
}

// openSecret decrypts a nonce||ciphertext AES-256-GCM blob.
func openSecret(blob []byte) ([]byte, error) {
	key, err := masterKeyBytes()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := gcm.NonceSize()
	if len(blob) < ns {
		return nil, errors.New("vault: malformed ciphertext")
	}
	nonce, ct := blob[:ns], blob[ns:]
	return gcm.Open(nil, nonce, ct, nil)
}
