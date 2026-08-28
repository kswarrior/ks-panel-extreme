package repository

import (
	"database/sql"
	"fmt"

	"github.com/example/kspanel/internal/models"
)

type RoleRepository struct {
	db *sql.DB
}

func NewRoleRepository(db *sql.DB) *RoleRepository {
	return &RoleRepository{db: db}
}

// roleAuthRepoFor is the shared way every role reader resolves the
// optional allowed-auth-types blob (kept in the settings KV — see
// role_auth_repo.go). It is nil-tolerant on the DB error path so a
// transient settings-table hiccup never keeps the roles list from
// rendering (the admin gets the roles back with
// AllowedAuthTypes == nil == "unrestricted"). Kept inline rather than
// imported because readers want the bare []string, not the repo.
func (r *RoleRepository) roleAuthList(ids []int64) (map[int64][]string, error) {
	m := make(map[int64][]string, len(ids))
	authRepo := NewRoleAuthorityRepository(r.db)
	for _, id := range ids {
		allowed, err := authRepo.GetRoleAllowedAuth(id)
		if err != nil {
			return nil, err
		}
		m[id] = allowed
	}
	return m, nil
}

// ListRoles returns all roles, each populated with its permission key list.
func (r *RoleRepository) ListRoles() ([]models.Role, error) {
	rows, err := r.db.Query(`SELECT id, name, display_name, color, description, icon FROM roles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roles := []models.Role{}
	for rows.Next() {
		var rl models.Role
		if err := rows.Scan(&rl.ID, &rl.Name, &rl.DisplayName, &rl.Color, &rl.Description, &rl.Icon); err != nil {
			return nil, err
		}
		roles = append(roles, rl)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range roles {
		perms, err := r.getPermissionKeysByRoleID(roles[i].ID)
		if err != nil {
			return nil, err
		}
		roles[i].Permissions = perms
	}
	// Backfill allowed-auth-types per role. Keeping a separate loop (vs.
	// a JOIN) because the blob lives in the settings KV and a single
	// batched-map read performs better than one SELECT per role on big
	// installs.
	ids := make([]int64, 0, len(roles))
	for i := range roles {
		ids = append(ids, roles[i].ID)
	}
	authMap, aerr := r.roleAuthList(ids)
	if aerr != nil {
		return nil, aerr
	}
	// Preserve the nil/unrestricted-vs-[]/"disallow all" distinction:
	// do NOT coerce nil to []string{} here, the wire serializer needs
	// the two states distinguishable (the field has no omitempty tag).
	for i := range roles {
		roles[i].AllowedAuthTypes = authMap[roles[i].ID]
	}
	return roles, nil
}

func (r *RoleRepository) GetRoleByName(name string) (*models.Role, error) {
	row := r.db.QueryRow(`SELECT id, name, display_name, color, description, icon FROM roles WHERE name = ?`, name)
	var rl models.Role
	var rid sql.NullInt64
	var rname, rdisp, rcolor, rdesc, ric sql.NullString
	if err := row.Scan(&rid, &rname, &rdisp, &rcolor, &rdesc, &ric); err != nil || !rid.Valid {
		return nil, fmt.Errorf("role %s not found", name)
	}
	rl.ID = rid.Int64
	rl.Name = rname.String
	rl.DisplayName = rdisp.String
	rl.Color = rcolor.String
	rl.Description = rdesc.String
	rl.Icon = ric.String
	perms, err := r.getPermissionKeysByRoleID(rl.ID)
	if err != nil {
		return nil, err
	}
	rl.Permissions = perms
	// Preserve the nil (unrestricted) vs [] (disallow all) distinction;
	// the wire serializer requires the absence of a coercion here so the
	// RoleForm's "Unrestricted" checkbox matches what the admin last saved.
	allowed, aerr := NewRoleAuthorityRepository(r.db).GetRoleAllowedAuth(rl.ID)
	if aerr != nil {
		return nil, aerr
	}
	rl.AllowedAuthTypes = allowed
	return &rl, nil
}

func (r *RoleRepository) GetRoleByID(id int64) (*models.Role, error) {
	row := r.db.QueryRow(`SELECT id, name, display_name, color, description, icon FROM roles WHERE id = ?`, id)
	var rl models.Role
	var rid sql.NullInt64
	var rname, rdisp, rcolor, rdesc, ric sql.NullString
	if err := row.Scan(&rid, &rname, &rdisp, &rcolor, &rdesc, &ric); err != nil || !rid.Valid {
		return nil, fmt.Errorf("role %d not found", id)
	}
	rl.ID = rid.Int64
	rl.Name = rname.String
	rl.DisplayName = rdisp.String
	rl.Color = rcolor.String
	rl.Description = rdesc.String
	rl.Icon = ric.String
	perms, err := r.getPermissionKeysByRoleID(rl.ID)
	if err != nil {
		return nil, err
	}
	rl.Permissions = perms
	// Preserve the nil (unrestricted) vs [] (disallow all) distinction;
	// the wire serializer requires the absence of a coercion here so the
	// RoleForm's "Unrestricted" checkbox matches what the admin last saved.
	allowed, aerr := NewRoleAuthorityRepository(r.db).GetRoleAllowedAuth(rl.ID)
	if aerr != nil {
		return nil, aerr
	}
	rl.AllowedAuthTypes = allowed
	return &rl, nil
}

// CreateRole inserts a new role and grants it the supplied permission keys.
// Unknown permission keys (ones that don't exist in the permissions table) are
// silently skipped rather than failing the whole operation. displayName and
// color are stored verbatim — empty strings fall back to defaults on read.
func (r *RoleRepository) CreateRole(name, displayName, color, description, icon string, permissionKeys []string) (int64, error) {
	res, err := r.db.Exec(
		`INSERT INTO roles (name, display_name, color, description, icon) VALUES (?, ?, ?, ?, ?)`,
		name, displayName, color, description, icon)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := r.SetRolePermissions(id, permissionKeys); err != nil {
		// Roll back the role creation so we don't leave a permission-less role.
		_, _ = r.db.Exec(`DELETE FROM roles WHERE id = ?`, id)
		return 0, err
	}
	return id, nil
}

// UpdateRole updates a role's name/display name/color/description and replaces
// its permissions.
func (r *RoleRepository) UpdateRole(id int64, name, displayName, color, description, icon string, permissionKeys []string) error {
	if _, err := r.db.Exec(
		`UPDATE roles SET name = ?, display_name = ?, color = ?, description = ?, icon = ? WHERE id = ?`,
		name, displayName, color, description, icon, id); err != nil {
		return err
	}
	return r.SetRolePermissions(id, permissionKeys)
}

// DeleteRole removes a role. It refuses to delete any of the built-in admin /
// moderator / user roles so the platform never loses its baseline roles.
// It also refuses to delete a role that still has users assigned so the FK
// ON DELETE RESTRICT does not surface as a raw constraint error.
func (r *RoleRepository) DeleteRole(id int64) error {
	var name sql.NullString
	if err := r.db.QueryRow(`SELECT name FROM roles WHERE id = ?`, id).Scan(&name); err != nil || !name.Valid {
		return fmt.Errorf("role not found")
	}
	switch name.String {
	case "admin", "moderator", "user":
		return fmt.Errorf("cannot delete built-in role %q", name.String)
	}
	var assigned int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role_id = ?`, id).Scan(&assigned); err == nil && assigned > 0 {
		return fmt.Errorf("cannot delete role %q: %d user(s) still assigned", name.String, assigned)
	}
	_, err := r.db.Exec(`DELETE FROM roles WHERE id = ?`, id)
	return err
}

// SetRoleAllowedAuthTypes persists the admin-curated picking of authority
// providers a role's users may turn on for their own login. It is a thin
// wrapper over RoleAuthorityRepository so callers don't need to import
// two repos. nil == unrestricted (no row, every admin-enabled provider
// offered); an explicit empty slice == disallow-all (persisted as "[]").
// Called by the admin Roles handler on create / update.
func (r *RoleRepository) SetRoleAllowedAuthTypes(roleID int64, allowed []string) error {
	return NewRoleAuthorityRepository(r.db).SetRoleAllowedAuth(roleID, allowed)
}

// SetRolePermissions replaces the set of permissions granted to the given role
// with the supplied keys. The replacement happens inside a transaction so the
// role is never left half-granted. Unknown keys are dropped.
func (r *RoleRepository) SetRolePermissions(roleID int64, keys []string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM role_permissions WHERE role_id = ?`, roleID); err != nil {
		return err
	}
	if len(keys) > 0 {
		if _, err := tx.Exec(
			`INSERT INTO role_permissions (role_id, permission_id)
			 SELECT ?, p.id FROM permissions p WHERE p.key IN (`+placeholders(len(keys))+`)`,
			append([]interface{}{roleID}, stringsToInterfaces(keys)...)...,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *RoleRepository) getPermissionKeysByRoleID(roleID int64) ([]string, error) {
	rows, err := r.db.Query(
		`SELECT p.key FROM role_permissions rp
		 JOIN permissions p ON rp.permission_id = p.id
		 WHERE rp.role_id = ? ORDER BY p.key`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// placeholders builds a "?,?,?" string of n SQL placeholders for IN clauses.
func placeholders(n int) string {
	out := ""
	for i := 0; i < n; i++ {
		if i > 0 {
			out += ","
		}
		out += "?"
	}
	return out
}

// stringsToInterfaces converts a []string to []interface{} so it can be spread
// into variadic SQL args.
func stringsToInterfaces(s []string) []interface{} {
	out := make([]interface{}, len(s))
	for i, v := range s {
		out[i] = v
	}
	return out
}
