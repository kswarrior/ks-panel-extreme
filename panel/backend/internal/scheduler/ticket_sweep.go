package scheduler

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// sweepTickets drives the SLA overdue sweep + the digest-mail sweep. It runs
// inside the minute tick (after automation + backups) and never fails the
// tick: every error is logged, never returned.
func sweepTickets(ctx context.Context) {
	select {
	case <-ctx.Done():
		return
	default:
	}
	sweepTicketSLA()
	select {
	case <-ctx.Done():
		return
	default:
	}
	sweepDigests()
}

// sweepTicketSLA escalates overdue tickets: due_at passed while still
// open/pending/in_progress and not yet marked breached. Each ticket is
// escalated once (OverdueTickets excludes already-breached rows):
//   - sidecar flips sla_breached + escalated (+ escalated_at)
//   - priority steps up one rung (EscalatedPriority; critical stays)
//   - unassigned tickets are dealt to the least-loaded staff member
//   - owner + (new) assignee each get a ticket-category notification
//     (WS push + email per their notification_prefs via Emit*).
func sweepTicketSLA() {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("ticket sla sweep: open db:", err)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	now := time.Now().UTC()
	overdue, err := repo.OverdueTickets(now)
	if err != nil {
		// Pre-065 DBs (no ticket_sla table in a test) surface here — treat
		// as "nothing to do", never as a sweep failure.
		if containsNoSuchTable(err.Error()) {
			return
		}
		log.Println("ticket sla sweep: query overdue:", err)
		return
	}
	if len(overdue) == 0 {
		return
	}
	panelName := "KS Panel"
	if snap, serr := repository.NewSettingsRepository(con).Get(); serr == nil && snap != nil && snap.PanelName != "" {
		panelName = snap.PanelName
	}
	for _, tk := range overdue {
		t := tk
		newPriority := models.EscalatedPriority(t.Priority)
		assignee := t.AssignedTo
		if assignee == nil {
			if staffID := repo.LeastLoadedStaffID(); staffID != 0 {
				assignee = &staffID
			}
		}
		if _, uerr := repo.Update(t.ID, repository.UpdateTicketInput{
			Priority:    &newPriority,
			AssignedSet: assignee != nil,
			AssignedTo:  assignee,
		}); uerr != nil {
			log.Printf("ticket sla sweep: update ticket %d: %v", t.ID, uerr)
			continue
		}
		if merr := repo.MarkBreachedAndEscalate(t.ID, now); merr != nil {
			log.Printf("ticket sla sweep: mark breached %d: %v", t.ID, merr)
			continue
		}
		subj, body := repository.TicketEscalatedMail(panelName, t.TicketNo, t.Subject, newPriority)
		link := "/tickets/" + itoa(t.ID)
		seen := map[int64]bool{}
		notify := func(uid int64) {
			if uid == 0 || seen[uid] {
				return
			}
			seen[uid] = true
			handlers.EmitNotification(uid, nil, "system", models.NotificationCategoryTicket, notifPriorityFor(newPriority), subj, body, link, "Open ticket", "")
		}
		notify(t.CreatedBy)
		if assignee != nil {
			notify(*assignee)
		} else if t.AssignedTo != nil {
			notify(*t.AssignedTo)
		}
		// Staff audience: when the ticket is still unassigned after the
		// least-loaded attempt (no staff exists), fan out to every staff
		// member so the breach is still visible in someone's bell.
		if assignee == nil && t.AssignedTo == nil {
			for _, sid := range staffIDsForSweep(con) {
				notify(sid)
			}
		}
		log.Printf("ticket sla sweep: ticket %s breached, escalated to %s", t.TicketNo, newPriority)
	}
}

// sweepDigests sends the daily summary mail to digest-mode users with unread
// notifications whose last digest is older than 24h (or never sent).
// Realtime users already got immediate mail via pushAndMailNotification;
// off users and opted-out users are excluded by DigestCandidates/ShouldEmail.
func sweepDigests() {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("digest sweep: open db:", err)
		return
	}
	defer con.Close()
	prefsRepo := repository.NewNotificationPrefsRepository(con)
	cutoff := time.Now().UTC().Add(-24 * time.Hour).Format("2006-01-02 15:04:05")
	cands, err := prefsRepo.DigestCandidates(cutoff)
	if err != nil {
		if containsNoSuchTable(err.Error()) {
			return
		}
		log.Println("digest sweep: query candidates:", err)
		return
	}
	if len(cands) == 0 {
		return
	}
	panelName := "KS Panel"
	if snap, serr := repository.NewSettingsRepository(con).Get(); serr == nil && snap != nil && snap.PanelName != "" {
		panelName = snap.PanelName
	}
	notifRepo := repository.NewNotificationRepository(con)
	for _, c := range cands {
		if c.Email == "" || c.Unread <= 0 {
			continue
		}
		// Honour the per-user opt-out even in digest mode.
		if _, ok := repository.ShouldEmailUserDigest(con, c.UserID); !ok {
			continue
		}
		isUnread := false
		rows, _, lerr := notifRepo.List(repository.NotificationFilter{UserID: c.UserID, IsRead: &isUnread, Limit: 10})
		if lerr != nil {
			continue
		}
		titles := make([]string, 0, len(rows))
		for _, n := range rows {
			titles = append(titles, n.Title)
		}
		subj, body := repository.DigestMailBody(panelName, c.Unread, titles)
		repository.EnqueueMail(repository.MailJob{UserID: c.UserID, To: c.Email, Subject: subj, Body: body})
		_ = prefsRepo.MarkDigestSent(c.UserID, time.Now().UTC().Format("2006-01-02 15:04:05"))
	}
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	pos := len(b)
	for n > 0 {
		pos--
		b[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}

func notifPriorityFor(ticketPriority string) models.NotificationPriority {
	// Mirror handlers.ticketNotifPriority: normalize case/whitespace so a
	// non-canonical stored value still maps to the right bell urgency
	// instead of silently falling back to normal.
	switch strings.ToLower(strings.TrimSpace(ticketPriority)) {
	case "low":
		return models.NotificationPriorityLow
	case "high":
		return models.NotificationPriorityHigh
	case "urgent":
		return models.NotificationPriorityUrgent
	case "critical":
		return models.NotificationPriorityCritical
	default:
		return models.NotificationPriorityNormal
	}
}

// containsNoSuchTable reports whether err is a missing-table error from a
// pre-065 database (notably in unit tests that build a minimal schema).
func containsNoSuchTable(msg string) bool {
	m := strings.ToLower(msg)
	return strings.Contains(m, "no such table")
}

// staffIDsForSweep lists MANAGE_TICKETS holders for breach fan-out when no
// assignee could be chosen. Mirrors the handler helper without importing it.
func staffIDsForSweep(con *sql.DB) []int64 {
	rows, err := con.Query(
		`SELECT DISTINCT u.id FROM users u
		 JOIN role_permissions rp ON rp.role_id = u.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 WHERE p.key = 'MANAGE_TICKETS'`,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			out = append(out, id)
		}
	}
	return out
}
