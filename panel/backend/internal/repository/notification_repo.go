package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// NotificationRepository owns the `notifications` table — a powerful per-user
// inbox where every row is scoped to ONE recipient. Broadcasts fan out at
// create time (one row per user) so reads/deletes stay isolated.
type NotificationRepository struct {
	db *sql.DB
}

func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// CreateInput is the write shape — validated server-side before insert.
type CreateNotificationInput struct {
	UserID      int64
	ActorID     *int64
	ActorName   string
	Category    models.NotificationCategory
	Priority    models.NotificationPriority
	Title       string
	Message     string
	Link        string
	ActionLabel string
	Metadata    string
	IsBroadcast bool
}

// Create inserts one notification for UserID and returns its id.
func (r *NotificationRepository) Create(in CreateNotificationInput) (int64, error) {
	if strings.TrimSpace(in.Title) == "" {
		return 0, fmt.Errorf("title is required")
	}
	// Normalise enums: caller should already have validated, but we keep a
	// safe default rather than storing garbage.
	if in.Category == "" {
		in.Category = models.NotificationCategoryGeneral
	}
	if in.Priority == "" {
		in.Priority = models.NotificationPriorityNormal
	}
	q := `INSERT INTO notifications
		(user_id, actor_id, actor_name, category, priority, title, message, link, action_label, metadata, is_broadcast, is_read)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
	var actorID interface{}
	if in.ActorID != nil {
		actorID = *in.ActorID
	} else {
		actorID = nil
	}
	// SQLite rejects Go nil as ? param via modernc — we handle the two nullable
	// columns with literal NULL + separate branches. To keep the query simple
	// we use sql.NullInt64 binding via interface: modernc handles nil interface
	// as NULL only when the arg is typed nil interface{}, but driver needs
	// explicit handling. We switch on presence.
	var res sql.Result
	var err error
	if in.ActorID == nil {
		// splice NULL for actor_id
		q2 := `INSERT INTO notifications
			(user_id, actor_name, category, priority, title, message, link, action_label, metadata, is_broadcast, is_read)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
		isB := 0
		if in.IsBroadcast {
			isB = 1
		}
		res, err = r.db.Exec(q2, in.UserID, in.ActorName, string(in.Category), string(in.Priority), in.Title, in.Message, in.Link, in.ActionLabel, in.Metadata, isB)
	} else {
		isB := 0
		if in.IsBroadcast {
			isB = 1
		}
		// use original q but with concrete actor_id
		res, err = r.db.Exec(q, in.UserID, actorID, in.ActorName, string(in.Category), string(in.Priority), in.Title, in.Message, in.Link, in.ActionLabel, in.Metadata, isB)
	}
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// CreateBroadcast fans out one logical notification to every user row —
// one physical row per user. The caller is typically an admin broadcast.
func (r *NotificationRepository) CreateBroadcast(in CreateNotificationInput, userIDs []int64) ([]int64, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	ids := make([]int64, 0, len(userIDs))
	for _, uid := range userIDs {
		cpy := in
		cpy.UserID = uid
		cpy.IsBroadcast = true
		id, err := r.Create(cpy)
		if err != nil {
			return ids, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// ListFilter scopes the inbox listing.
type NotificationFilter struct {
	UserID   int64
	Category string
	Priority string
	IsRead   *bool
	Search   string
	Limit    int
	Offset   int
}

// List returns the most recent notifications for UserID matching filter,
// newest first.
func (r *NotificationRepository) List(f NotificationFilter) ([]models.Notification, int, error) {
	conds := []string{"user_id = ?"}
	args := []interface{}{f.UserID}
	if f.Category != "" {
		conds = append(conds, "category = ?")
		args = append(args, f.Category)
	}
	if f.Priority != "" {
		conds = append(conds, "priority = ?")
		args = append(args, f.Priority)
	}
	if f.IsRead != nil {
		if *f.IsRead {
			conds = append(conds, "is_read = 1")
		} else {
			conds = append(conds, "is_read = 0")
		}
	}
	if q := strings.TrimSpace(f.Search); q != "" {
		conds = append(conds, "(title LIKE ? OR message LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	where := strings.Join(conds, " AND ")

	// Count total for pagination header.
	var total int
	countQ := `SELECT COUNT(*) FROM notifications WHERE ` + where
	if err := r.db.QueryRow(countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []models.Notification{}, 0, nil
	}

	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	query := `SELECT id, user_id, actor_id, actor_name, category, priority, title, message, link, action_label, metadata, is_read, is_broadcast, created_at, read_at
		FROM notifications WHERE ` + where + ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		var actorID sql.NullInt64
		var actorName sql.NullString
		var cat, pri, title, msg, link, alabel, meta sql.NullString
		var isRead, isBroadcast sql.NullInt64
		var createdStr, readStr sql.NullString
		var uid int64
		if err := rows.Scan(&n.ID, &uid, &actorID, &actorName, &cat, &pri, &title, &msg, &link, &alabel, &meta, &isRead, &isBroadcast, &createdStr, &readStr); err != nil {
			return nil, 0, err
		}
		n.UserID = uid
		if actorID.Valid {
			v := actorID.Int64
			n.ActorID = &v
		}
		n.ActorName = actorName.String
		n.Category = models.NotificationCategory(cat.String)
		n.Priority = models.NotificationPriority(pri.String)
		n.Title = title.String
		n.Message = msg.String
		n.Link = link.String
		n.ActionLabel = alabel.String
		n.Metadata = meta.String
		n.IsRead = isRead.Valid && isRead.Int64 != 0
		n.IsBroadcast = isBroadcast.Valid && isBroadcast.Int64 != 0
		if t, err := parseNotifTime(createdStr.String); err == nil {
			n.CreatedAt = t
		}
		if readStr.Valid && readStr.String != "" {
			if t, err := parseNotifTime(readStr.String); err == nil {
				n.ReadAt = &t
			}
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// Get returns one notification if it belongs to userID.
func (r *NotificationRepository) Get(id, userID int64) (*models.Notification, error) {
	q := `SELECT id, user_id, actor_id, actor_name, category, priority, title, message, link, action_label, metadata, is_read, is_broadcast, created_at, read_at
		FROM notifications WHERE id = ? AND user_id = ?`
	row := r.db.QueryRow(q, id, userID)
	var n models.Notification
	var actorID sql.NullInt64
	var actorName sql.NullString
	var cat, pri, title, msg, link, alabel, meta sql.NullString
	var isRead, isBroadcast sql.NullInt64
	var createdStr, readStr sql.NullString
	var uid int64
	if err := row.Scan(&n.ID, &uid, &actorID, &actorName, &cat, &pri, &title, &msg, &link, &alabel, &meta, &isRead, &isBroadcast, &createdStr, &readStr); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	n.UserID = uid
	if actorID.Valid {
		v := actorID.Int64
		n.ActorID = &v
	}
	n.ActorName = actorName.String
	n.Category = models.NotificationCategory(cat.String)
	n.Priority = models.NotificationPriority(pri.String)
	n.Title = title.String
	n.Message = msg.String
	n.Link = link.String
	n.ActionLabel = alabel.String
	n.Metadata = meta.String
	n.IsRead = isRead.Valid && isRead.Int64 != 0
	n.IsBroadcast = isBroadcast.Valid && isBroadcast.Int64 != 0
	if t, err := parseNotifTime(createdStr.String); err == nil {
		n.CreatedAt = t
	}
	if readStr.Valid && readStr.String != "" {
		if t, err := parseNotifTime(readStr.String); err == nil {
			n.ReadAt = &t
		}
	}
	return &n, nil
}

// UnreadCount is the badge number.
func (r *NotificationRepository) UnreadCount(userID int64) (int, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0`, userID).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// MarkRead flips one row to read, only if it belongs to userID.
func (r *NotificationRepository) MarkRead(id, userID int64) error {
	res, err := r.db.Exec(`UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// MarkAllRead marks every unread for userID as read.
func (r *NotificationRepository) MarkAllRead(userID int64) (int64, error) {
	res, err := r.db.Exec(`UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0`, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// Delete removes one row if it belongs to userID.
func (r *NotificationRepository) Delete(id, userID int64) error {
	res, err := r.db.Exec(`DELETE FROM notifications WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DeleteAll removes every row for userID (optionally only read ones).
func (r *NotificationRepository) DeleteAll(userID int64, onlyRead bool) (int64, error) {
	q := `DELETE FROM notifications WHERE user_id = ?`
	args := []interface{}{userID}
	if onlyRead {
		q += ` AND is_read = 1`
	}
	res, err := r.db.Exec(q, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ListAllUserIDs returns every user id — used for broadcast fan-out.
func (r *NotificationRepository) ListAllUserIDs() ([]int64, error) {
	rows, err := r.db.Query(`SELECT id FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// Summary holds aggregate stats for the /stats endpoint.
type NotificationStats struct {
	Total      int            `json:"total"`
	Unread     int            `json:"unread"`
	ByCategory map[string]int `json:"by_category"`
	ByPriority map[string]int `json:"by_priority"`
	Broadcast  int            `json:"broadcast"`
}

// Stats returns totals for the header chips/dashboard.
func (r *NotificationRepository) Stats(userID int64) (NotificationStats, error) {
	var s NotificationStats
	s.ByCategory = map[string]int{}
	s.ByPriority = map[string]int{}
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ?`, userID).Scan(&s.Total); err != nil {
		return s, err
	}
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0`, userID).Scan(&s.Unread); err != nil {
		return s, err
	}
	rows, err := r.db.Query(`SELECT category, COUNT(*) FROM notifications WHERE user_id = ? GROUP BY category`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var n int
			if err := rows.Scan(&cat, &n); err == nil {
				s.ByCategory[cat] = n
			}
		}
	}
	rows2, err := r.db.Query(`SELECT priority, COUNT(*) FROM notifications WHERE user_id = ? GROUP BY priority`, userID)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var pri string
			var n int
			if err := rows2.Scan(&pri, &n); err == nil {
				s.ByPriority[pri] = n
			}
		}
	}
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_broadcast = 1`, userID).Scan(&s.Broadcast)
	return s, nil
}

func parseNotifTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("empty")
	}
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02T15:04:05Z", s); err == nil {
		return t, nil
	}
	// SQLite may store with nanos or without T.
	if t, err := time.Parse("2006-01-02 15:04:05.999999999", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339Nano, s)
}
