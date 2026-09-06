package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// TicketSLAConfigKey is the settings-KV key holding the per-category SLA
// JSON (seeded by 065, defaults from models.DefaultTicketSLAConfig).
const TicketSLAConfigKey = "ticket_sla_config"

// GetSLAConfig reads the per-category SLA policy, falling back to defaults
// for missing/invalid rows or categories so a fresh install behaves sanely
// before any admin save.
func (r *TicketRepository) GetSLAConfig() map[string]models.TicketSLAPolicy {
	def := models.DefaultTicketSLAConfig()
	var raw string
	if err := r.db.QueryRow(r.rebind(`SELECT value FROM settings WHERE key = ?`), TicketSLAConfigKey).Scan(&raw); err != nil {
		return def
	}
	if strings.TrimSpace(raw) == "" {
		return def
	}
	var cfg map[string]models.TicketSLAPolicy
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil || len(cfg) == 0 {
		return def
	}
	for cat := range models.ValidTicketCategories {
		if _, ok := cfg[cat]; !ok {
			cfg[cat] = def[cat]
		}
	}
	return cfg
}

// SetSLAConfig validates (known categories only, positive durations) and
// persists the per-category SLA policy.
func (r *TicketRepository) SetSLAConfig(cfg map[string]models.TicketSLAPolicy) error {
	if len(cfg) == 0 {
		return fmt.Errorf("sla config is empty")
	}
	for cat, p := range cfg {
		if !models.ValidTicketCategories[cat] {
			return fmt.Errorf("unknown category %q", cat)
		}
		if p.FirstResponseMins <= 0 || p.FirstResponseMins > 60*24*30 {
			return fmt.Errorf("invalid first_response_mins for %q", cat)
		}
		if p.ResolveHours <= 0 || p.ResolveHours > 24*365 {
			return fmt.Errorf("invalid resolve_hours for %q", cat)
		}
	}
	blob, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(
		r.rebind(`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
		TicketSLAConfigKey, string(blob),
	)
	return err
}

// PolicyFor returns the SLA policy for a category (defaults when unknown).
func (r *TicketRepository) PolicyFor(category string) models.TicketSLAPolicy {
	cfg := r.GetSLAConfig()
	if p, ok := cfg[category]; ok {
		return p
	}
	return models.DefaultTicketSLAConfig()["general"]
}

// ComputeDueAt returns now + resolve_hours for the category — the
// auto-computed due_at for tickets created without an explicit due date.
func (r *TicketRepository) ComputeDueAt(category string, now time.Time) time.Time {
	return now.Add(time.Duration(r.PolicyFor(category).ResolveHours) * time.Hour)
}

// GetSLA returns the sidecar row for a ticket, or (nil, nil) when none
// exists yet.
func (r *TicketRepository) GetSLA(ticketID int64) (*models.TicketSLA, error) {
	var s models.TicketSLA
	var firstResp, escAt sql.NullString
	var breached, escalated sql.NullInt64
	err := r.db.QueryRow(
		r.rebind(`SELECT ticket_id, first_response_at, sla_breached, escalated, escalated_at FROM ticket_sla WHERE ticket_id = ?`),
		ticketID,
	).Scan(&s.TicketID, &firstResp, &breached, &escalated, &escAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if firstResp.Valid && firstResp.String != "" {
		if t := parseTicketTime(firstResp.String); !t.IsZero() {
			s.FirstResponseAt = &t
		}
	}
	s.SLABreached = breached.Valid && breached.Int64 != 0
	s.Escalated = escalated.Valid && escalated.Int64 != 0
	if escAt.Valid && escAt.String != "" {
		if t := parseTicketTime(escAt.String); !t.IsZero() {
			s.EscalatedAt = &t
		}
	}
	return &s, nil
}

// ensureSLARow inserts the sidecar row when missing (INSERT OR IGNORE is
// idempotent on sqlite; postgres/mysql go through the same statement via
// the shared query path — ON CONFLICT is not supported by MySQL, so we
// probe first and only insert when absent).
func (r *TicketRepository) ensureSLARow(ticketID int64) error {
	var n int
	if err := r.db.QueryRow(r.rebind(`SELECT COUNT(*) FROM ticket_sla WHERE ticket_id = ?`), ticketID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	_, err := r.db.Exec(
		r.rebind(`INSERT INTO ticket_sla (ticket_id, first_response_at, sla_breached, escalated, escalated_at)
		 VALUES (?, NULL, 0, 0, NULL)`), ticketID,
	)
	return err
}

// MarkFirstResponse stamps first_response_at on the first STAFF comment.
// Later comments are no-ops. Callers decide "staff" (canSeeInternal).
func (r *TicketRepository) MarkFirstResponse(ticketID int64, at time.Time) error {
	if err := r.ensureSLARow(ticketID); err != nil {
		return err
	}
	ts := at.UTC().Format("2006-01-02 15:04:05")
	_, err := r.db.Exec(
		r.rebind(`UPDATE ticket_sla SET first_response_at = COALESCE(first_response_at, ?) WHERE ticket_id = ?`),
		ts, ticketID,
	)
	return err
}

// MarkBreachedAndEscalate flips sla_breached + escalated and stamps
// escalated_at. Priority/assignee mutation happens in the caller's UPDATE
// so the ticket row and sidecar stay consistent in one place.
func (r *TicketRepository) MarkBreachedAndEscalate(ticketID int64, at time.Time) error {
	if err := r.ensureSLARow(ticketID); err != nil {
		return err
	}
	ts := at.UTC().Format("2006-01-02 15:04:05")
	_, err := r.db.Exec(
		r.rebind(`UPDATE ticket_sla SET sla_breached = 1, escalated = 1, escalated_at = COALESCE(escalated_at, ?) WHERE ticket_id = ?`),
		ts, ticketID,
	)
	return err
}

// OverdueTickets returns open (non-closed/resolved) tickets whose due_at
// has passed and which are not yet marked breached — the escalation sweep's
// work list.
func (r *TicketRepository) OverdueTickets(now time.Time) ([]models.Ticket, error) {
	ts := now.UTC().Format("2006-01-02 15:04:05")
	// COUNT first: modernc sqlite surfaces a phantom all-NULL row on empty
	// results (see List's early return) which scanTicket would reject as a
	// NULL→int64 conversion. Early return keeps the sweep log quiet on a
	// fresh panel with no tickets yet.
	var total int
	if err := r.db.QueryRow(
		r.rebind(`SELECT COUNT(*) FROM tickets t
		 WHERE t.due_at IS NOT NULL AND t.due_at != '' AND t.due_at < ?
		   AND t.status NOT IN ('closed', 'resolved')
		   AND NOT EXISTS (SELECT 1 FROM ticket_sla s WHERE s.ticket_id = t.id AND s.sla_breached = 1)`), ts,
	).Scan(&total); err != nil {
		return nil, err
	}
	if total == 0 {
		return []models.Ticket{}, nil
	}
	rows, err := r.db.Query(
		r.rebind(`SELECT `+ticketColumns+` FROM tickets t
		 WHERE t.due_at IS NOT NULL AND t.due_at != '' AND t.due_at < ?
		   AND t.status NOT IN ('closed', 'resolved')
		   AND NOT EXISTS (SELECT 1 FROM ticket_sla s WHERE s.ticket_id = t.id AND s.sla_breached = 1)
		 ORDER BY t.due_at ASC`), ts,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Ticket{}
	for rows.Next() {
		tk, err := scanTicket(rows)
		if err != nil {
			// Tolerate the phantom NULL row defensively even after the
			// COUNT guard (a ticket deleted mid-sweep races the same way).
			if strings.Contains(err.Error(), "converting NULL") {
				continue
			}
			return nil, err
		}
		out = append(out, *tk)
	}
	return out, rows.Err()
}

// LeastLoadedStaffID returns the user id (among MANAGE_TICKETS holders via
// their role) with the fewest open assigned tickets, for auto-escalation
// assignment. Returns 0 when no staff exists.
func (r *TicketRepository) LeastLoadedStaffID() int64 {
	rows, err := r.db.Query(
		`SELECT u.id, COUNT(t.id) FROM users u
		 LEFT JOIN tickets t ON t.assigned_to = u.id AND t.status NOT IN ('closed', 'resolved')
		 WHERE EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
		                WHERE rp.role_id = u.role_id AND p.key = 'MANAGE_TICKETS')
		 GROUP BY u.id ORDER BY COUNT(t.id) ASC, u.id ASC LIMIT 1`,
	)
	if err != nil {
		return 0
	}
	defer rows.Close()
	if rows.Next() {
		var id int64
		var n int
		if err := rows.Scan(&id, &n); err == nil {
			return id
		}
	}
	return 0
}
