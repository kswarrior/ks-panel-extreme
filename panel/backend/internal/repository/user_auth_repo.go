package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/models"
)

// UserAuthorityRepository persists the per-user "make my account safe"
// snap the Account page reads + writes (the set of authority providers
// the user has enabled on their own login and how many of those a
// sign-in must satisfy). It stores models.UserAuthorityConfig as a
// single JSON blob under a per-user key in the settings KV, mirroring
// the role_auth_repo.go pattern — migration-free and idempotent.
//
// Available-authority filtering (admin-enabled ∩ role-allowed) lives
// here too: the handler needs one source of truth that returns the
// user's available providers (the picker's options) alongside their
// currently-enabled selections on the same round-trip.
type UserAuthorityRepository struct {
	db *sql.DB
}

// NewUserAuthorityRepository wires the underlying *sql.DB.
func NewUserAuthorityRepository(db *sql.DB) *UserAuthorityRepository {
	return &UserAuthorityRepository{db: db}
}

// userAuthorityKey is the settings-table KV key under which a user's
// UserAuthorityConfig JSON blob lives. Exposed as a helper so callers
// can refer to the same convention (e.g. for direct clears).
func userAuthorityKey(userID int64) string {
	return fmt.Sprintf("user_authority:%d", userID)
}

// Get returns the persisted UserAuthorityConfig, falling back to the
// safe defaults when the blob is missing or unparseable so a brand-new
// user renders a sensible first-paint form rather than a broken one.
// The defaults ("password only, any one authority") keep existing
// login flows working out of the box until the user explicitly opts
// into stronger multi-factor.
func (r *UserAuthorityRepository) Get(userID int64) (*models.UserAuthorityConfig, error) {
	cfg := models.DefaultUserAuthorityConfig()
	var raw string
	err := r.db.QueryRow(
		`SELECT COALESCE((SELECT value FROM settings WHERE key = ?), '')`,
		userAuthorityKey(userID),
	).Scan(&raw)
	if err != nil {
		if err == sql.ErrNoRows {
			return cfg, nil
		}
		return nil, fmt.Errorf("read user authority config: %w", err)
	}
	if strings.TrimSpace(raw) == "" {
		return cfg, nil
	}
	if err := json.Unmarshal([]byte(raw), cfg); err != nil {
		// Fall back to defaults if a malformed blob survived from a
		// previous version; the next successful PUT overwrites it.
		return models.DefaultUserAuthorityConfig(), nil
	}
	return cfg, nil
}

// Update persists the supplied UserAuthorityConfig. The caller is
// expected to have already intersected EnabledAuthorities with the
// live "available" list (admin-enabled ∩ role-allowed) so we never
// persist ids the admin / role revoked.
func (r *UserAuthorityRepository) Update(userID int64, cfg *models.UserAuthorityConfig) error {
	if cfg == nil {
		return fmt.Errorf("nothing to update")
	}
	// Same min-N clamp the admin registration policy uses, so a weird
	// "n=0" the client can never legitimately send survives as "1".
	if cfg.RequiredN < 1 {
		cfg.RequiredN = 1
	}
	if cfg.RequiredMode == "" {
		cfg.RequiredMode = models.UserAuthorityAny
	}
	blob, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("encode user authority config: %w", err)
	}
	// Always lowercase + dedupe the enabled list so two writes of the
	// same authority don't double-count at the login gate.
	cfg.EnabledAuthorities = normalizeAuthorityIDs(cfg.EnabledAuthorities)
	blob, _ = json.Marshal(cfg)
	_, err = r.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)`+upsertSet("(key)", []string{"value"}),
		userAuthorityKey(userID), string(blob),
	)
	return err
}

// AvailableAuthorities returns the provider ids a user is ALLOWED to
// turn on for their own login — the intersection of the admin-enabled
// authority inventory (AuthorityConfig.EnabledProviderIDs) and the
// role-allowed list for the role the user belongs to. A nil/empty
// role-allowed list means "unrestricted" (every admin-enabled provider
// is offered), matching the seeded roles' default. Used by the Account
// page to populate its authorities picker.
//
// The (roleAllowed bool) return distinguishes "unrestricted" (true:
// role has no restriction, every admin-enabled provider counts) from
// "explicitly empty allowed set" (false: the role disallows every
// authority). UIs hide the picker when roleAllowed is false and the
// admin-enabled inventory besides password is empty.
func (r *UserAuthorityRepository) AvailableAuthorities(userID int64, roleID int64) (available []string, roleAllowed []string, roleRestricted bool, err error) {
	// Admin-enabled provider inventory.
	authRepo := NewAuthorityRepository(r.db)
	raw, aerr := authRepo.GetRaw()
	if aerr != nil {
		return nil, nil, false, aerr
	}
	adminEnabled := raw.EnabledProviderIDs()
	if len(adminEnabled) == 0 {
		// Defensive: the admin inventory always seeds password-enabled,
		// so this path only trips on a corrupt blob — fall back to bare
		// password so the user can't be locked out.
		adminEnabled = []string{models.AuthorityProviderPassword}
	}

	allowed, lerr := NewRoleAuthorityRepository(r.db).GetRoleAllowedAuth(roleID)
	if lerr != nil {
		return nil, nil, false, lerr
	}
	// nil allowed == unrestricted (every admin-enabled id counts);
	// an explicit empty slice == role disallows everything.
	roleRestricted = allowed != nil
	if allowed == nil {
		roleAllowed = []string{}
	} else {
		roleAllowed = allowed
	}

	// Intersection of admin-enabled ∩ role-allowed (when restricted).
	adminSet := make(map[string]struct{}, len(adminEnabled))
	for _, id := range adminEnabled {
		adminSet[id] = struct{}{}
	}
	allowedSet := make(map[string]struct{}, len(roleAllowed))
	for _, id := range roleAllowed {
		allowedSet[id] = struct{}{}
	}
	out := make([]string, 0, len(adminEnabled))
	for _, id := range adminEnabled {
		if roleRestricted {
			if _, ok := allowedSet[id]; !ok {
				continue
			}
		}
		out = append(out, id)
	}
	if len(out) == 0 {
		// Always at least offer password so the user can't end up with
		// "no authorities available" and therefore locked out of their
		// own account.
		out = []string{models.AuthorityProviderPassword}
	}
	return out, roleAllowed, roleRestricted, nil
}

// normalizeAuthorityIDs lowercases, trims, dedupes an authority id list
// so two writes of the same authority don't double-count at the login
// gate and undefined-cased ids don't sneak through.
func normalizeAuthorityIDs(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.ToLower(strings.TrimSpace(id))
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
