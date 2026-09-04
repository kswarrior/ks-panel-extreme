package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/models"
)

// NotificationPrefsRepository owns the 065 notification_prefs table — one
// row per user with delivery mode (realtime|digest|off) + email opt-out.
// Missing rows read back as defaults (realtime, opted in) so the feature
// works before any user ever opens the preferences UI.
type NotificationPrefsRepository struct {
	db *sql.DB
}

func NewNotificationPrefsRepository(db *sql.DB) *NotificationPrefsRepository {
	return &NotificationPrefsRepository{db: db}
}

// Get returns the user's prefs, or defaults when no row exists yet.
func (r *NotificationPrefsRepository) Get(userID int64) (*models.NotificationPrefs, error) {
	p := &models.NotificationPrefs{UserID: userID, Mode: models.NotificationModeRealtime}
	var mode sql.NullString
	var optOut sql.NullInt64
	var lastDigest sql.NullString
	err := r.db.QueryRow(
		`SELECT mode, email_opt_out, last_digest_at FROM notification_prefs WHERE user_id = ?`,
		userID,
	).Scan(&mode, &optOut, &lastDigest)
	if err != nil {
		if err == sql.ErrNoRows {
			return p, nil
		}
		return nil, err
	}
	if mode.Valid && models.ValidNotificationModes[strings.ToLower(mode.String)] {
		p.Mode = models.NotificationMode(strings.ToLower(mode.String))
	}
	p.EmailOptOut = optOut.Valid && optOut.Int64 != 0
	if lastDigest.Valid && lastDigest.String != "" {
		if t := parseTicketTime(lastDigest.String); !t.IsZero() {
			p.LastDigestAt = &t
		}
	}
	return p, nil
}

// Set validates and upserts the user's prefs. Mode must be one of
// realtime|digest|off; anything else is a 400 at the handler via this error.
func (r *NotificationPrefsRepository) Set(userID int64, mode string, emailOptOut bool) (*models.NotificationPrefs, error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if !models.ValidNotificationModes[mode] {
		return nil, fmt.Errorf("invalid mode %q (want realtime|digest|off)", mode)
	}
	optOut := 0
	if emailOptOut {
		optOut = 1
	}
	// Probe-then-write: MySQL has no ON CONFLICT, so the shared upsert
	// idiom in this codebase (settings) can't be reused verbatim here.
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM notification_prefs WHERE user_id = ?`, userID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		_, err := r.db.Exec(
			`INSERT INTO notification_prefs (user_id, mode, email_opt_out, last_digest_at) VALUES (?, ?, ?, NULL)`,
			userID, mode, optOut,
		)
		if err != nil {
			return nil, err
		}
	} else {
		_, err := r.db.Exec(
			`UPDATE notification_prefs SET mode = ?, email_opt_out = ? WHERE user_id = ?`,
			mode, optOut, userID,
		)
		if err != nil {
			return nil, err
		}
	}
	return r.Get(userID)
}

// MarkDigestSent stamps last_digest_at after a digest email flush.
func (r *NotificationPrefsRepository) MarkDigestSent(userID int64, ts string) error {
	_, err := r.db.Exec(
		`UPDATE notification_prefs SET last_digest_at = ? WHERE user_id = ?`,
		ts, userID,
	)
	return err
}

// DigestCandidates returns users in digest mode with unread notifications
// whose last digest is older than maxAge (or never sent) — the daily digest
// sweep's work list, joined with their email address.
type DigestCandidate struct {
	UserID int64
	Email  string
	Unread int
}

func (r *NotificationPrefsRepository) DigestCandidates(olderThan string) ([]DigestCandidate, error) {
	rows, err := r.db.Query(
		`SELECT p.user_id, u.email, COUNT(n.id) FROM notification_prefs p
		 JOIN users u ON u.id = p.user_id
		 JOIN notifications n ON n.user_id = p.user_id AND n.is_read = 0
		 WHERE p.mode = 'digest' AND COALESCE(u.email, '') != ''
		   AND (p.last_digest_at IS NULL OR p.last_digest_at = '' OR p.last_digest_at < ?)
		 GROUP BY p.user_id, u.email`,
		olderThan,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DigestCandidate{}
	for rows.Next() {
		var c DigestCandidate
		var uid sql.NullInt64
		var email sql.NullString
		var unread sql.NullInt64
		if err := rows.Scan(&uid, &email, &unread); err != nil {
			// modernc phantom NULL row on empty result — treat as no work.
			if strings.Contains(err.Error(), "converting NULL") {
				continue
			}
			return nil, err
		}
		if !uid.Valid {
			continue
		}
		c.UserID = uid.Int64
		c.Email = email.String
		if unread.Valid {
			c.Unread = int(unread.Int64)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
