package repository

import (
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/secretbox"
)

// ModSettingsRepository persists the typed setting values declared by a v2
// mod's manifest into the mod_settings table (migration 081). It is
// stateless: every call opens its own connection through OpenDB, mirroring
// modengine.StorageRepository, because the panel's shared pool is a
// single-connection SQLite pool and a long-lived handle here would contend
// with request traffic.
//
// Secret handling (plan item M8): password-type values are sealed with
// internal/secretbox (AES-256-GCM, nonce||ciphertext||tag, base64 for the
// TEXT column) before they touch the DB. List() NEVER returns secret
// cleartext — secret rows come back with an empty Value and IsSecret=true so
// a caller cannot leak one by accident; Reveal() is the single decrypt path
// and is called only by the sandbox binding (ks.settings.get).
type ModSettingsRepository struct{}

// NewModSettingsRepository returns the stateless repo.
func NewModSettingsRepository() *ModSettingsRepository { return &ModSettingsRepository{} }

// ModSettingRow is one stored value row.
type ModSettingRow struct {
	ModSlug string
	Key     string
	// Value is the cleartext for non-secret rows and always empty for secret
	// rows (see the type comment). Use Reveal to read a secret.
	Value     string
	IsSecret  bool
	UpdatedAt time.Time
}

// scanModSettingTime is a tiny local time parser (the repository package has
// parseSQLiteTime unexported; keeping the call direct avoids changing its
// signature for one caller).
func scanModSettingTime(s string) time.Time {
	for _, layout := range []string{
		"2006-01-02 15:04:05",
		time.RFC3339,
		"2006-01-02T15:04:05",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

// List returns every stored value for a mod in key order. Secret rows carry
// no Value (only IsSecret=true); the caller decides how to render "set".
func (ModSettingsRepository) List(slug string) ([]ModSettingRow, error) {
	if slug == "" {
		return nil, errors.New("modsettings.list: mod slug is required")
	}
	con, err := OpenDB()
	if err != nil {
		return nil, fmt.Errorf("modsettings.list: open db: %w", err)
	}
	defer con.Close()
	rows, err := con.Query(
		`SELECT key, value, is_secret, updated_at FROM mod_settings WHERE mod_slug = ? ORDER BY key ASC`,
		slug,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ModSettingRow
	for rows.Next() {
		var r ModSettingRow
		var raw, updated string
		var secret int
		if err := rows.Scan(&r.Key, &raw, &secret, &updated); err != nil {
			return nil, err
		}
		r.ModSlug = slug
		r.IsSecret = secret != 0
		if !r.IsSecret {
			r.Value = raw
		}
		r.UpdatedAt = scanModSettingTime(updated)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Set upserts one value. Secret values are sealed before the write; the
// caller is responsible for validating the value against the declared schema
// (models.ValidateSettingValue) before calling.
func (ModSettingsRepository) Set(slug, key, value string, isSecret bool) error {
	if slug == "" || key == "" {
		return errors.New("modsettings.set: mod slug and key are required")
	}
	stored := value
	if isSecret {
		sealed, err := secretbox.Seal([]byte(value))
		if err != nil {
			return fmt.Errorf("modsettings.set: seal secret: %w", err)
		}
		stored = base64.StdEncoding.EncodeToString(sealed)
	}
	// Portable UPDATE-then-INSERT (ON CONFLICT is a MySQL syntax error); a
	// lost insert race converges via the follow-up UPDATE.
	return withModSettingsConn(func(con *sql.DB) error {
		now := time.Now().UTC().Format("2006-01-02 15:04:05")
		res, err := con.Exec(
			`UPDATE mod_settings SET value = ?, is_secret = ?, updated_at = ? WHERE mod_slug = ? AND key = ?`,
			stored, boolToInt(isSecret), now, slug, key,
		)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			return nil
		}
		if _, err := con.Exec(
			`INSERT INTO mod_settings (mod_slug, key, value, is_secret, updated_at) VALUES (?, ?, ?, ?, ?)`,
			slug, key, stored, boolToInt(isSecret), now,
		); err != nil {
			low := strings.ToLower(err.Error())
			if strings.Contains(low, "duplicate") || strings.Contains(low, "unique") {
				_, err = con.Exec(
					`UPDATE mod_settings SET value = ?, is_secret = ?, updated_at = ? WHERE mod_slug = ? AND key = ?`,
					stored, boolToInt(isSecret), now, slug, key,
				)
				return err
			}
			return err
		}
		return nil
	})
}

// Reveal returns the cleartext of one stored value plus whether the row is a
// secret. found=false when no row matches. This is the ONLY path that opens a
// sealed value; the sandbox binding owns it so the HTTP surface never
// decrypts.
func (ModSettingsRepository) Reveal(slug, key string) (value string, isSecret bool, found bool, err error) {
	if slug == "" || key == "" {
		return "", false, false, errors.New("modsettings.reveal: mod slug and key are required")
	}
	cerr := withModSettingsConn(func(con *sql.DB) error {
		var raw string
		var secret int
		qerr := con.QueryRow(
			`SELECT value, is_secret FROM mod_settings WHERE mod_slug = ? AND key = ?`,
			slug, key,
		).Scan(&raw, &secret)
		if errors.Is(qerr, sql.ErrNoRows) {
			return nil
		}
		if qerr != nil {
			return qerr
		}
		isSecret = secret != 0
		found = true
		if !isSecret {
			value = raw
			return nil
		}
		blob, derr := base64.StdEncoding.DecodeString(raw)
		if derr != nil {
			return fmt.Errorf("modsettings.reveal: decode secret: %w", derr)
		}
		clear, derr := secretbox.Open(blob)
		if derr != nil {
			return fmt.Errorf("modsettings.reveal: open secret: %w", derr)
		}
		value = string(clear)
		return nil
	})
	return value, isSecret, found, cerr
}

// Delete removes one value row. Missing keys are a no-op so the API can clear
// an already-clear setting without special-casing.
func (ModSettingsRepository) Delete(slug, key string) error {
	if slug == "" || key == "" {
		return errors.New("modsettings.delete: mod slug and key are required")
	}
	return withModSettingsConn(func(con *sql.DB) error {
		_, err := con.Exec(`DELETE FROM mod_settings WHERE mod_slug = ? AND key = ?`, slug, key)
		return err
	})
}

// withModSettingsConn opens one connection, runs fn, closes it.
func withModSettingsConn(fn func(*sql.DB) error) error {
	con, err := OpenDB()
	if err != nil {
		return fmt.Errorf("modsettings: open db: %w", err)
	}
	defer con.Close()
	return fn(con)
}
