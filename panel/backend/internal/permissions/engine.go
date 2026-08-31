package permissions

import (
	"database/sql"
	"fmt"
	"strings"
)

type Checker struct {
	db *sql.DB
}

func NewChecker(db *sql.DB) *Checker {
	return &Checker{db: db}
}

// HasPermission returns true if the user (by ID) possesses the given permission key.
func (c *Checker) HasPermission(userID int64, permKey string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM users u
		JOIN roles r ON u.role_id = r.id
		JOIN role_permissions rp ON r.id = rp.role_id
		JOIN permissions p ON rp.permission_id = p.id
		WHERE u.id = ? AND p.key = ?`
	if err := c.db.QueryRow(query, userID, permKey).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

// ListUserPermissions returns a slice of permission keys for the given user.
func (c *Checker) ListUserPermissions(userID int64) ([]string, error) {
	rows, err := c.db.Query(`SELECT p.key FROM users u
		JOIN roles r ON u.role_id = r.id
		JOIN role_permissions rp ON r.id = rp.role_id
		JOIN permissions p ON rp.permission_id = p.id
		WHERE u.id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	perms := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		perms = append(perms, key)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return perms, nil
}

// Must be used in HTTP middleware – see internal/api/middleware.go.
func (c *Checker) Ensure(userID int64, perm string) error {
	has, err := c.HasPermission(userID, perm)
	if err != nil {
		return err
	}
	if !has {
		return fmt.Errorf("forbidden: missing permission %s", perm)
	}
	return nil
}

// HasAnyPermission returns true if the user holds ANY of the supplied keys.
// Used by the granular CRUD route gates: a route accepts the area umbrella
// (e.g. MANAGE_USERS) OR the specific action key (e.g. USERS_CREATE), so a
// role is allowed in if it carries either. The honest, drop-unknown-keys
// equivalent of ORing HasPermission across the slice — done in one query.
func (c *Checker) HasAnyPermission(userID int64, keys ...string) (bool, error) {
	if len(keys) == 0 {
		return false, nil
	}
	placeholders := ""
	for i := range keys {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
	}
	args := make([]interface{}, 0, len(keys)+1)
	args = append(args, userID)
	for _, k := range keys {
		args = append(args, k)
	}
	var count int
	query := `SELECT COUNT(*) FROM users u
		JOIN roles r ON u.role_id = r.id
		JOIN role_permissions rp ON r.id = rp.role_id
		JOIN permissions p ON rp.permission_id = p.id
		WHERE u.id = ? AND p.key IN (` + placeholders + `)`
	if err := c.db.QueryRow(query, args...).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

// EnsureAny short-circuits on the first key the user holds; returns nil if
// any key is present, else an error naming every key the gate required.
func (c *Checker) EnsureAny(userID int64, keys ...string) error {
	has, err := c.HasAnyPermission(userID, keys...)
	if err != nil {
		return err
	}
	if !has {
		return fmt.Errorf("forbidden: missing any of [%s]", strings.Join(keys, ", "))
	}
	return nil
}

// ----------------------------------------------------------------------
// Ownership scope helpers — Own vs All per area.
// ----------------------------------------------------------------------

// HasScope checks the ownership-scope keys for the given area. It returns
// (hasOwn, hasAll, error). The umbrella key is considered an implicit ALL
// so a role that carries the umbrella but has not been granted the explicit
// ALL key still passes an "any" check. Callers combine this with their
// action-level gate (VIEW/CREATE/EDIT/DELETE) to decide filtering:
//
//   hasOwn, hasAll, _ := checker.HasScope(uid, group.OwnKey, group.AllKey, group.Umbrella)
//   if hasAll { // may touch any row }
//   else if hasOwn { // restrict to owned rows }
//   else { // legacy fallback — treat as All when neither scope is present }
//
func (c *Checker) HasScope(userID int64, ownKey, allKey, umbrella string) (bool, bool, error) {
	keys := []string{}
	if ownKey != "" {
		keys = append(keys, ownKey)
	}
	if allKey != "" {
		keys = append(keys, allKey)
	}
	if umbrella != "" {
		keys = append(keys, umbrella)
	}
	if len(keys) == 0 {
		return false, false, nil
	}
	placeholders := ""
	for i := range keys {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
	}
	args := make([]interface{}, 0, len(keys)+1)
	args = append(args, userID)
	for _, k := range keys {
		args = append(args, k)
	}
	rows, err := c.db.Query(`SELECT p.key FROM users u
		JOIN roles r ON u.role_id = r.id
		JOIN role_permissions rp ON r.id = rp.role_id
		JOIN permissions p ON rp.permission_id = p.id
		WHERE u.id = ? AND p.key IN (`+placeholders+`)`, args...)
	if err != nil {
		return false, false, err
	}
	defer rows.Close()
	var hasOwn, hasAll bool
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return false, false, err
		}
		if k == ownKey {
			hasOwn = true
		}
		if k == allKey || k == umbrella {
			hasAll = true
		}
	}
	if err := rows.Err(); err != nil {
		return false, false, err
	}
	return hasOwn, hasAll, nil
}

// CanViewAll reports whether the user may view ANY resource in the area.
// It is true when the user holds the All scope (or the umbrella, which
// implies All).
func (c *Checker) CanViewAll(userID int64, g Group) (bool, error) {
	_, hasAll, err := c.HasScope(userID, g.OwnKey, g.AllKey, g.Umbrella)
	return hasAll, err
}

// CanViewOwn reports whether the user is restricted to own resources.
// It is true when the user holds the Own scope without the All scope.
func (c *Checker) CanViewOwn(userID int64, g Group) (bool, error) {
	hasOwn, hasAll, err := c.HasScope(userID, g.OwnKey, g.AllKey, g.Umbrella)
	if err != nil {
		return false, err
	}
	return hasOwn && !hasAll, nil
}

// ScopeAllowsAll is the common decision point for handler filtering:
// true  → the caller may act on any row (ALL or umbrella)
// false → the caller is either Own-restricted or has no explicit scope.
// Callers typically branch:
//
//   hasAll, _ := checker.ScopeAllowsAll(uid, instancesGroup)
//   if hasAll { listAll } else { // Own path: filter to owner_id = uid or check ownership
//   }
//
// When neither Own nor All is present the helper returns (false, nil) —
 // callers should treat that as "legacy All" for backward compatibility
// (see instance_handler.go for the exact fallback).
func (c *Checker) ScopeAllowsAll(userID int64, g Group) (bool, error) {
	return c.CanViewAll(userID, g)
}
