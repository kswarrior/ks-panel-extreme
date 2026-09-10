package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/models"
)

// Re-export the wire structs so handlers can refer to repository.RoleQuotas
// without importing models directly. The canonical definitions live in
// internal/models (Role.Quotas / Role.AllowLists).
type RoleQuotas = models.RoleQuotas
type RoleAllowLists = models.RoleAllowLists

// Role quotas + allow-lists — the "powerful system" behind the Roles form
// Limits section (number inputs + dropdown pickers, not just toggles).
//
// Storage lives in the settings KV (migration-free, like role_auth):
//   role_quotas:<id>      → JSON RoleQuotas   (0/omitted = unlimited)
//   role_allowlists:<id>   → JSON RoleAllowLists (nil/missing = unrestricted)
//
// Quota semantics: per-USER counting. A role with max_instances=2 lets EACH
// user with that role own up to 2 instances (owner_id = user). User A
// filling their 2 never blocks User B. Admins (no quotas set) stay
// unlimited so existing installs keep working out of the box.
//
// Allow-list semantics mirror role_auth: nil (no blob) = unrestricted (all
// templates/nodes allowed); explicit empty slice = nothing allowed (deny
// all); non-empty = only the listed IDs. The deploy handler enforces both.
type RoleQuotas struct {
	MaxInstances    int `json:"max_instances,omitempty"`
	MaxNodes        int `json:"max_nodes,omitempty"`
	MaxTemplates    int `json:"max_templates,omitempty"`
	MaxAPIKeys      int `json:"max_api_keys,omitempty"`
	MaxUsers        int `json:"max_users,omitempty"`
	MaxRoles        int `json:"max_roles,omitempty"`
	MaxMods         int `json:"max_mods,omitempty"`
	MaxApplications int `json:"max_applications,omitempty"`
	MaxStacks       int `json:"max_stacks,omitempty"`
	MaxInstancePages int `json:"max_instance_pages,omitempty"`
	MaxTickets      int `json:"max_tickets,omitempty"`
}

// HasAny reports whether any quota is set (>0). Used to skip counting
// queries entirely for unlimited roles (the hot path for admin).
func (q *RoleQuotas) HasAny() bool {
	if q == nil {
		return false
	}
	return q.MaxInstances > 0 || q.MaxNodes > 0 || q.MaxTemplates > 0 ||
		q.MaxAPIKeys > 0 || q.MaxUsers > 0 || q.MaxRoles > 0 ||
		q.MaxMods > 0 || q.MaxApplications > 0 || q.MaxStacks > 0 ||
		q.MaxInstancePages > 0 || q.MaxTickets > 0
}

// Sanitized returns a copy with negatives clamped to 0 (unlimited) so a
// corrupt blob or hostile payload can never grant a negative quota that
// downstream comparisons misread. Zero stays unlimited on the wire.
func (q *RoleQuotas) Sanitized() *RoleQuotas {
	if q == nil {
		return nil
	}
	clamp := func(v int) int {
		if v < 0 {
			return 0
		}
		return v
	}
	out := &RoleQuotas{
		MaxInstances:    clamp(q.MaxInstances),
		MaxNodes:        clamp(q.MaxNodes),
		MaxTemplates:    clamp(q.MaxTemplates),
		MaxAPIKeys:      clamp(q.MaxAPIKeys),
		MaxUsers:        clamp(q.MaxUsers),
		MaxRoles:        clamp(q.MaxRoles),
		MaxMods:         clamp(q.MaxMods),
		MaxApplications: clamp(q.MaxApplications),
		MaxStacks:       clamp(q.MaxStacks),
		MaxInstancePages: clamp(q.MaxInstancePages),
		MaxTickets:      clamp(q.MaxTickets),
	}
	if !out.HasAny() {
		return nil
	}
	return out
}

// RoleAllowLists carries the dropdown pickers behind the Limits section.
// Nil slice = unrestricted (not saved / no blob). Explicit empty slice =
// deny-all (saved as "[]", enforced as 403 on every create/deploy).
type RoleAllowLists struct {
	AllowedTemplateIDs []int64  `json:"allowed_template_ids,omitempty"`
	AllowedNodeIDs     []int64  `json:"allowed_node_ids,omitempty"`
	AllowedKinds       []string `json:"allowed_kinds,omitempty"`
	AllowedRoleIDs     []int64  `json:"allowed_role_ids,omitempty"`
	AllowedCategories  []string `json:"allowed_categories,omitempty"`
}

// HasAny reports whether any allow-list restriction is present (non-nil,
// including explicit empty deny-all). Nil everywhere = unrestricted.
func (a *RoleAllowLists) HasAny() bool {
	if a == nil {
		return false
	}
	return a.AllowedTemplateIDs != nil || a.AllowedNodeIDs != nil ||
		a.AllowedKinds != nil || a.AllowedRoleIDs != nil ||
		a.AllowedCategories != nil
}

// Sanitized returns a copy with blanks/zeros dropped and kinds/categories
// lower-cased + trimmed. Nil stays nil (unrestricted); explicit empty stays
// empty (deny-all) so the admin's intent round-trips.
func (a *RoleAllowLists) Sanitized() *RoleAllowLists {
	if a == nil {
		return nil
	}
	cleanIDs := func(in []int64) []int64 {
		if in == nil {
			return nil
		}
		seen := map[int64]bool{}
		out := []int64{}
		for _, v := range in {
			if v <= 0 || seen[v] {
				continue
			}
			seen[v] = true
			out = append(out, v)
		}
		return out
	}
	cleanStrs := func(in []string) []string {
		if in == nil {
			return nil
		}
		seen := map[string]bool{}
		out := []string{}
		for _, v := range in {
			v = strings.ToLower(strings.TrimSpace(v))
			if v == "" || seen[v] {
				continue
			}
			seen[v] = true
			out = append(out, v)
		}
		return out
	}
	out := &RoleAllowLists{
		AllowedTemplateIDs: cleanIDs(a.AllowedTemplateIDs),
		AllowedNodeIDs:     cleanIDs(a.AllowedNodeIDs),
		AllowedKinds:       cleanStrs(a.AllowedKinds),
		AllowedRoleIDs:     cleanIDs(a.AllowedRoleIDs),
		AllowedCategories:  cleanStrs(a.AllowedCategories),
	}
	if !out.HasAny() {
		return nil
	}
	return out
}

type RoleQuotaRepository struct {
	db *sql.DB
}

func NewRoleQuotaRepository(db *sql.DB) *RoleQuotaRepository {
	return &RoleQuotaRepository{db: db}
}

func roleQuotasKey(roleID int64) string {
	return fmt.Sprintf("role_quotas:%d", roleID)
}

func roleAllowListsKey(roleID int64) string {
	return fmt.Sprintf("role_allowlists:%d", roleID)
}

func readSettingsBlob(db *sql.DB, key string) (string, error) {
	var raw string
	err := db.QueryRow(
		`SELECT COALESCE((SELECT value FROM settings WHERE key = ?), '')`,
		key,
	).Scan(&raw)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(raw), nil
}

func writeSettingsBlob(db *sql.DB, key string, blob []byte) error {
	res, uerr := db.Exec(`UPDATE settings SET value = ? WHERE key = ?`, blob, key)
	if uerr != nil {
		return uerr
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	if _, uerr = db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?)`, key, blob); uerr != nil {
		if isDupKeyErr(uerr) {
			_, _ = db.Exec(`UPDATE settings SET value = ? WHERE key = ?`, blob, key)
			return nil
		}
		return uerr
	}
	return nil
}

// GetRoleQuotas returns the sanitized quotas for the role, or (nil, nil)
// when unrestricted (no blob or all-zero). Corrupt blobs fail open to
// unlimited so a mis-edit never locks every user out of creating.
func (r *RoleQuotaRepository) GetRoleQuotas(roleID int64) (*RoleQuotas, error) {
	raw, err := readSettingsBlob(r.db, roleQuotasKey(roleID))
	if err != nil {
		return nil, fmt.Errorf("read role quotas: %w", err)
	}
	if raw == "" {
		return nil, nil
	}
	var q RoleQuotas
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		return nil, nil
	}
	return q.Sanitized(), nil
}

// SetRoleQuotas persists quotas (nil/empty → unrestricted, row deleted).
func (r *RoleQuotaRepository) SetRoleQuotas(roleID int64, q *RoleQuotas) error {
	q = q.Sanitized()
	if q == nil {
		_, err := r.db.Exec(`DELETE FROM settings WHERE key = ?`, roleQuotasKey(roleID))
		return err
	}
	blob, err := json.Marshal(q)
	if err != nil {
		return fmt.Errorf("encode role quotas: %w", err)
	}
	return writeSettingsBlob(r.db, roleQuotasKey(roleID), blob)
}

// GetRoleAllowLists returns sanitized allow-lists, or (nil, nil) when
// unrestricted. Corrupt blobs fail open to unrestricted (same rationale).
func (r *RoleQuotaRepository) GetRoleAllowLists(roleID int64) (*RoleAllowLists, error) {
	raw, err := readSettingsBlob(r.db, roleAllowListsKey(roleID))
	if err != nil {
		return nil, fmt.Errorf("read role allow-lists: %w", err)
	}
	if raw == "" {
		return nil, nil
	}
	var a RoleAllowLists
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return nil, nil
	}
	return a.Sanitized(), nil
}

// SetRoleAllowLists persists allow-lists (nil → unrestricted, row deleted).
func (r *RoleQuotaRepository) SetRoleAllowLists(roleID int64, a *RoleAllowLists) error {
	a = a.Sanitized()
	if a == nil {
		_, err := r.db.Exec(`DELETE FROM settings WHERE key = ?`, roleAllowListsKey(roleID))
		return err
	}
	blob, err := json.Marshal(a)
	if err != nil {
		return fmt.Errorf("encode role allow-lists: %w", err)
	}
	return writeSettingsBlob(r.db, roleAllowListsKey(roleID), blob)
}

// QuotasForUser resolves the quotas for a user via their role_id. Returns
// (nil, nil) for unknown users/roles (unlimited). Callers treat nil as
// "no quota configured" and skip counting.
func QuotasForUser(db *sql.DB, userID int64) (*RoleQuotas, error) {
	var roleID sql.NullInt64
	if err := db.QueryRow(`SELECT role_id FROM users WHERE id = ?`, userID).Scan(&roleID); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !roleID.Valid || roleID.Int64 == 0 {
		return nil, nil
	}
	return NewRoleQuotaRepository(db).GetRoleQuotas(roleID.Int64)
}

// AllowListsForUser resolves the allow-lists for a user via their role_id.
func AllowListsForUser(db *sql.DB, userID int64) (*RoleAllowLists, error) {
	var roleID sql.NullInt64
	if err := db.QueryRow(`SELECT role_id FROM users WHERE id = ?`, userID).Scan(&roleID); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if !roleID.Valid || roleID.Int64 == 0 {
		return nil, nil
	}
	return NewRoleQuotaRepository(db).GetRoleAllowLists(roleID.Int64)
}

// CountOwned counts rows in table WHERE ownerCol = userID. Table/column are
// allow-listed by the caller (never user input) so string interpolation is
// safe here — placeholders can't bind identifiers.
func CountOwned(db *sql.DB, table, ownerCol string, userID int64) (int, error) {
	var n int
	q := fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s = ?`, table, ownerCol)
	if err := db.QueryRow(q, userID).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// CheckQuota fails with a human message when count >= max (max <= 0 means
// unlimited). Callers map the error to 403.
func CheckQuota(count, max int, noun string) error {
	if max <= 0 {
		return nil
	}
	if count >= max {
		return fmt.Errorf("quota exceeded: max %d %s (you own %d)", max, noun, count)
	}
	return nil
}

func containsInt64(list []int64, v int64) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func containsString(list []string, v string) bool {
	v = strings.ToLower(strings.TrimSpace(v))
	for _, x := range list {
		if strings.ToLower(strings.TrimSpace(x)) == v {
			return true
		}
	}
	return false
}

// CheckAllowedID fails when the allow-list is non-nil (restricted) and id
// is not a member. Nil = unrestricted (pass). Explicit empty = deny-all.
func CheckAllowedID(list []int64, id int64, noun string) error {
	if list == nil {
		return nil
	}
	if !containsInt64(list, id) {
		return fmt.Errorf("forbidden: %s not allowed for your role", noun)
	}
	return nil
}

// CheckAllowedString is the string variant (kinds, categories).
func CheckAllowedString(list []string, v, noun string) error {
	if list == nil {
		return nil
	}
	if !containsString(list, v) {
		return fmt.Errorf("forbidden: %s %q not allowed for your role", noun, v)
	}
	return nil
}
