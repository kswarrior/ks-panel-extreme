package repository

import (
	"database/sql"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// ActivityRepository writes + reads the panel's audit timeline. The store is
// append-only by intent: there is no Update / Delete surface, only insert +
// list (and a small helper for the Dashboard's recent-events strip).
type ActivityRepository struct {
	db *sql.DB
}

func NewActivityRepository(db *sql.DB) *ActivityRepository {
	return &ActivityRepository{db: db}
}

// ActivityInput is the write-time payload. All fields except Category and
// Action are optional; the Activity handler fills in user/IP/MAC from the
// request context right before calling Create.
type ActivityInput struct {
	UserID      *int64
	Username    string
	Role        string
	Category    models.ActivityCategory
	Action      string
	TargetID    *int64
	TargetLabel string
	Message     string
	IPAddress   string
	UserAgent   string
}

// Create appends a new audit row. Returns the assigned id so callers can
// echo it in the response if they want.
//
// modernc.org/sqlite rejects a raw Go nil as a parameter value, so the
// optional pointer fields (user_id, target_id) can't be passed through
// Exec as Go `*int64`. We handle the two optional columns by switching on
// whether they're nil — binding the integer directly when present, and
// substituting a literal SQL NULL otherwise. Username / role /
// target_label / message / ip_address / user_agent are user-controllable
// strings, so they are ALWAYS bound as ?-parameters to keep injection
// out of the picture.
func (r *ActivityRepository) Create(in ActivityInput) (int64, error) {
	var (
		q    string
		args []interface{}
	)
	q = `INSERT INTO activity_logs
		(user_id, username, role, category, action, target_id, target_label,
		 message, ip_address, user_agent)
		VALUES (`
	if in.UserID == nil {
		q += "NULL, "
	} else {
		q += "?, "
		args = append(args, *in.UserID)
	}
	q += "?, ?, ?, ?, " // username, role, category, action
	args = append(args, in.Username, in.Role, string(in.Category), in.Action)
	if in.TargetID == nil {
		q += "NULL, ?, ?, ?, ?)"
	} else {
		q += "?, ?, ?, ?, ?)"
		args = append(args, *in.TargetID)
	}
	args = append(args, in.TargetLabel, in.Message, in.IPAddress, in.UserAgent)

	return insertReturningID(r.db, q, args...)
}

// ListFilter scopes the List query. Default values (limit=0, empty category)
// mean "no constraint" so callers can pass a zero-value struct.
type ListFilter struct {
	Category string
	UserID   *int64
	// Limit caps the rows returned. 0 means "no explicit cap" but List
	// itself applies an internal max (200) to keep the page responsive.
	Limit int
}

// List returns the most recent activity rows matching the filter, newest
// first. Joins the users table for live usernames when the user_id is still
// present in the users table, falling back to the denormalised username.
func (r *ActivityRepository) List(f ListFilter) ([]models.ActivityLog, error) {
	// COUNT(*) before scanning avoids the modernc empty-set quirk; we still
	// allocate a zero-length slice so the JSON serialises as `[]` not `null`.
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM activity_logs`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.ActivityLog, 0, n)
	if n == 0 {
		return out, nil
	}

	// Build the WHERE clause incrementally so unused filters aren't bound.
	// Each append must also append a corresponding arg to `args` in the
	// same order.
	var (
		conds []string
		args  []interface{}
	)
	if f.Category != "" {
		conds = append(conds, "al.category = ?")
		args = append(args, f.Category)
	}
	if f.UserID != nil {
		conds = append(conds, "al.user_id = ?")
		args = append(args, *f.UserID)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 200
	}

	// COALESCE(u.username, al.username) keeps the row readable even when
	// the live users row is gone — the denormalised column takes over.
	query := `SELECT al.id, al.user_id, COALESCE(u.username, al.username), al.role,
		al.category, al.action, al.target_id, al.target_label, al.message,
		al.ip_address, al.user_agent, al.created_at
		FROM activity_logs al
		LEFT JOIN users u ON u.id = al.user_id` +
		where +
		` ORDER BY al.created_at DESC, al.id DESC LIMIT ?`
	args = append(args, limit)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			l         models.ActivityLog
			uid       sql.NullInt64
			username  sql.NullString
			role      sql.NullString
			category  sql.NullString
			action    sql.NullString
			tid       sql.NullInt64
			label     sql.NullString
			message   sql.NullString
			ip        sql.NullString
			ua        sql.NullString
			createdAt sql.NullString
		)
		if err := rows.Scan(&l.ID, &uid, &username, &role, &category, &action,
			&tid, &label, &message, &ip, &ua, &createdAt); err != nil {
			return nil, err
		}
		if uid.Valid {
			v := uid.Int64
			l.UserID = &v
		}
		if tid.Valid {
			v := tid.Int64
			l.TargetID = &v
		}
		l.Username = username.String
		l.Role = role.String
		l.Category = models.ActivityCategory(category.String)
		l.Action = action.String
		l.TargetLabel = label.String
		l.Message = message.String
		l.IPAddress = ip.String
		l.UserAgent = ua.String
		if t, perr := time.Parse("2006-01-02 15:04:05", createdAt.String); perr == nil {
			l.CreatedAt = t
		} else if t, perr := time.Parse(time.RFC3339, createdAt.String); perr == nil {
			l.CreatedAt = t
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// CountByCategory returns totals per category in one query — useful for the
// Dashboard page so we don't make N round-trips. It queries the full set
// (no time filter) so the totals match the Activity page.
func (r *ActivityRepository) CountByCategory() (map[string]int64, error) {
	rows, err := r.db.Query(`SELECT category, COUNT(*) FROM activity_logs GROUP BY category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var cat string
		var n int64
		if err := rows.Scan(&cat, &n); err != nil {
			return nil, err
		}
		out[cat] = n
	}
	return out, rows.Err()
}
