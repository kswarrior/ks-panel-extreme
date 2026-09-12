package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"

	"github.com/example/kspanel/internal/repository"
)

// ListActivityHandler returns the most recent audit rows for the Activity
// page. Admins see everything; non-admin callers see only their own rows.
// The optional `category` query param constrains to a single bucket
// (user/role/node/...) so the UI can show a tab filter without a round-trip
// to refetch.
func ListActivityHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewActivityRepository(con)
	filter := repository.ListFilter{
		Category: r.URL.Query().Get("category"),
	}
	// Allow non-admins (no ACCESS_ADMIN_PANEL) to view *their own* audit
	// timeline by injecting their user_id filter. Admin users see every
	// row regardless.
	if !hasAdminAccess(con, r) {
		uid, err := UserIDFromContext(r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		v := uid
		filter.UserID = &v
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, perr := strconv.Atoi(v); perr == nil && n > 0 && n <= 500 {
			filter.Limit = n
		}
	}

	rows, err := repo.List(filter)
	if err != nil {
		log.Println("ListActivity error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// hasAdminAccess reports whether the caller carries the ACCESS_ADMIN_PANEL
// permission key. The Activity page uses this to decide whether to show
// every user's activity or only the caller's own.
func hasAdminAccess(con *sql.DB, r *http.Request) bool {
	uid, err := UserIDFromContext(r)
	if err != nil {
		return false
	}
	perms, err := repoPermissionsForUser(con, uid)
	if err != nil {
		return false
	}
	for _, p := range perms {
		if p == "ACCESS_ADMIN_PANEL" {
			return true
		}
	}
	return false
}

// repoPermissionsForUser returns the user's permission-key list directly
// from the DB (one SELECT through role_permissions). It's much cheaper than
// spinning up the permissions.Checker for a single boolean decision and
// keeps this handler independent of that package.
func repoPermissionsForUser(con *sql.DB, uid int64) ([]string, error) {
	rows, err := con.Query(
		`SELECT p.key FROM users u
		 JOIN role_permissions rp ON rp.role_id = u.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 WHERE u.id = ? ORDER BY p.key`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}
