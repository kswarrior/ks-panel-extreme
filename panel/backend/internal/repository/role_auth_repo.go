package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// RoleAuthorityRepository persists the per-role list of authority-provider
// ids users of that role are ALLOWED to turn on for their own login
// (the "Account" permission cluster picker on the Roles form). The list
// lives in the settings KV as a single JSON blob under a per-role key,
// keeping the schema migration-free — adding / removing a provider is a
// code-only change, never an ALTER TABLE.
//
// A missing / empty stored list means "unrestricted": every admin-enabled
// authority is offered to users with this role. That keeps the existing
// seeded admin / moderator / user roles working out of the box (no
// admin ever has to open Roles just to keep login working).
type RoleAuthorityRepository struct {
	db *sql.DB
}

// NewRoleAuthorityRepository wires the underlying *sql.DB.
func NewRoleAuthorityRepository(db *sql.DB) *RoleAuthorityRepository {
	return &RoleAuthorityRepository{db: db}
}

// roleAuthorityKey is the settings-table KV key under which a role's
// allowed-auth-types JSON blob lives. Exposed as a helper so callers can
// refer to the same convention.
func roleAuthorityKey(roleID int64) string {
	return fmt.Sprintf("role_auth_types:%d", roleID)
}

// GetRoleAllowedAuth returns the provider ids the supplied role allows
// for its users. Returns (nil, nil) when no persisted row exists —
// callers treat nil as "unrestricted" (every admin-enabled provider
// is offered). A non-nil empty slice means the admin explicitly
// selected "none", which is surfaced to the user as "you can't enable
// any extra authorities".
func (r *RoleAuthorityRepository) GetRoleAllowedAuth(roleID int64) ([]string, error) {
	var raw string
	err := r.db.QueryRow(
		`SELECT COALESCE((SELECT value FROM settings WHERE " + qKey() + " = ?), '')`,
		roleAuthorityKey(roleID),
	).Scan(&raw)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("read role allowed auth: %w", err)
	}
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		// A corrupt blob never takes the panel down — treat as
		// unrestricted so a mis-edit doesn't lock every user out.
		return nil, nil
	}
	return out, nil
}

// SetRoleAllowedAuth persists the supplied provider id list for the
// role. nil clears the restriction (back to "unrestricted" — no row
// persisted, so the next GetRoleAllowedAuth returns (nil, nil) and
// every admin-enabled provider is offered). An explicit empty slice
// (`[]string{}`) persists as a `"[]"` blob so the role stays in
// "disallow every non-password authority" mode rather than falling
// back to unrestricted — the distinction is preserved on the wire
// because the field has no omitempty tag. A non-empty slice persists
// verbatim after the caller has already intersected it with the
// admin-enabled inventory.
func (r *RoleAuthorityRepository) SetRoleAllowedAuth(roleID int64, allowed []string) error {
	if allowed == nil {
		// nil → unrestricted: drop the row so the role has no
		// persisted blob (GetRoleAllowedAuth returns (nil, nil)
		// which every reader treats as unrestricted).
		_, err := r.db.Exec(`DELETE FROM settings WHERE " + qKey() + " = ?`, roleAuthorityKey(roleID))
		return err
	}
	// Persist the list as-is — explicit `[]string{}` marshals to "[]",
	// which is distinguishable from "no row" on read so the role keeps
	// its "disallow all" intent rather than snapping back to
	// unrestricted.
	blob, err := json.Marshal(allowed)
	if err != nil {
		return fmt.Errorf("encode role allowed auth: %w", err)
	}
	_, err = r.db.Exec(
		`INSERT INTO settings (" + qKey() + ", value) VALUES (?, ?)`+upsertSet("(key)", []string{"value"}),
		roleAuthorityKey(roleID), blob,
	)
	return err
}
