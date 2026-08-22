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
