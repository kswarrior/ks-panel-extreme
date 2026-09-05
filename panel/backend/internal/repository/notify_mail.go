package repository

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/models"
)

// notify_mail.go — ticket/notification email delivery.
//
// SMTP settings live in Settings/Authority (host/port/user/pass/from, all
// five mirrored between the settings KV and the authority blob). The TLS
// mode is the settings-KV `smtp_tls` key (065 seed "auto"):
//   auto     — 465 = implicit TLS, everything else = smtp.SendMail
//              (STARTTLS when the server advertises it)
//   implicit — always implicit-TLS dial, any port
//   starttls — smtp.SendMail (requires STARTTLS-capable relay)
//   off      — plain SMTP, never upgrades (LAN relays only)
//
// Delivery is an in-process worker with retries (3 attempts, 2s/10s
// backoff): handlers EnqueueMail and return immediately so a down relay
// never blocks the ticket/notifications HTTP path. Per-user gating
// (opt-out + realtime/digest/off) happens BEFORE enqueue — see
// ShouldEmailUser.
//
// Security: credentials are NEVER logged. Log lines carry only the user id
// and the error string from the SMTP dialogue (which never echoes the
// password — auth failures surface as opaque 535 codes).

// SMTPTLSKey is the settings-KV key for the TLS mode (065 seed "auto").
const SMTPTLSKey = "smtp_tls"

// SMTPUseTLS / SMTPTLSPort live beside the other SMTP keys in settings_repo.go.

// TLSMode reads the configured TLS mode, defaulting to "auto" on any
// missing/unknown value so a fresh install behaves like before.
func (r *SettingsRepository) TLSMode() string {
	v := strings.ToLower(strings.TrimSpace(r.getString(SMTPTLSKey, "auto")))
	switch v {
	case "implicit", "starttls", "off", "auto":
		return v
	default:
		return "auto"
	}
}

// SendMail delivers a generic plaintext email via the configured relay.
// Empty host = not configured (error, no-op for callers that treat it as
// "admin hasn't wired SMTP yet").
func (s *smtpSettingsRepo) SendMail(to, subject, body string) error {
	host, portStr, user, password, from := s.repo.SMTPConfig()
	if strings.TrimSpace(host) == "" {
		return fmt.Errorf("SMTP is not configured")
	}
	if strings.TrimSpace(to) == "" {
		return fmt.Errorf("no recipient")
	}
	port, err := strconv.Atoi(strings.TrimSpace(portStr))
	if err != nil || port <= 0 || port > 65535 {
		return fmt.Errorf("invalid SMTP port %q", portStr)
	}
	if from == "" {
		from = "kspanel <kspanel@localhost>"
	}
	msg := buildEmail(from, to, subject, body)
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	// Anonymous relays leave user/password empty — skip AUTH entirely so
	// the handshake doesn't attempt an empty login the server may reject.
	var auth smtp.Auth
	if user != "" || password != "" {
		auth = smtp.PlainAuth("", user, password, host)
	}
	switch s.repo.TLSMode() {
	case "implicit":
		return sendTLS(addr, host, auth, from, []string{to}, msg)
	case "off":
		return sendPlain(addr, host, auth, from, []string{to}, msg)
	default: // auto | starttls
		if s.repo.TLSMode() == "auto" && port == 465 {
			return sendTLS(addr, host, auth, from, []string{to}, msg)
		}
		return smtp.SendMail(addr, auth, from, []string{to}, msg)
	}
}

// sendPlain dials a painful-LAN-relay plain SMTP port without ever
// upgrading to TLS. AUTH is attempted only when the server advertises it
// and credentials are configured.
func sendPlain(addr, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	conn, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer c.Quit()
	if auth != nil {
		if ok, _ := c.Extension("AUTH"); ok {
			if err := c.Auth(auth); err != nil {
				return err
			}
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := c.Rcpt(rcpt); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	return w.Close()
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker (in-process queue with retries)
// ─────────────────────────────────────────────────────────────────────────────

// MailJob is one queued email. UserID is only for safe log lines.
type MailJob struct {
	UserID  int64
	To      string
	Subject string
	Body    string
}

var (
	mailQueue       = make(chan MailJob, 256)
	mailStartOnce   sync.Once
	mailRetryDelays = []time.Duration{2 * time.Second, 10 * time.Second}
	// mailSend is the actual delivery func — swapped in tests so no relay
	// is dialled. The default opens the DB fresh per attempt so a settings
	// change mid-retry is honoured.
	mailSend = func(to, subject, body string) error {
		con, err := OpenDB()
		if err != nil {
			return err
		}
		defer con.Close()
		return NewSettingsRepository(con).SMTPSender().SendMail(to, subject, body)
	}
)

// StartMailWorker launches the background delivery loop (idempotent). Call
// once at panel launch next to scheduler.Start.
func StartMailWorker(ctx context.Context) {
	mailStartOnce.Do(func() {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case job := <-mailQueue:
					deliverWithRetry(ctx, job)
				}
			}
		}()
	})
}

// EnqueueMail queues one email without blocking the caller. A full queue
// drops with a (credential-free) log line — memory stays bounded on a
// misconfigured relay that backs jobs up.
func EnqueueMail(job MailJob) {
	select {
	case mailQueue <- job:
	default:
		log.Printf("mail worker: queue full, dropped mail for user %d", job.UserID)
	}
}

func deliverWithRetry(job MailJob) {
	var err error
	for attempt := 0; attempt <= len(mailRetryDelays); attempt++ {
		if attempt > 0 {
			d := mailRetryDelays[attempt-1]
			select {
			case <-time.After(d):
			}
		}
		if err = mailSend(job.To, job.Subject, job.Body); err == nil {
			return
		}
	}
	// Credential-free: err comes from the SMTP dialogue (opaque codes) and
	// job fields logged are the user id only — never the address/body.
	log.Printf("mail worker: giving up on mail for user %d: %v", job.UserID, err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Gating + ticket body builders
// ─────────────────────────────────────────────────────────────────────────────

// ShouldEmailUser reports whether userID may receive ticket/notification
// email right now: needs an email address, no opt-out, and mode == realtime
// (digest users get the daily summary instead; off gets nothing). It
// returns the address to send to.
func ShouldEmailUser(db *sql.DB, userID int64) (string, bool) {
	var email sql.NullString
	if err := db.QueryRow(`SELECT email FROM users WHERE id = ?`, userID).Scan(&email); err != nil {
		return "", false
	}
	if !email.Valid || strings.TrimSpace(email.String) == "" {
		return "", false
	}
	prefs, err := NewNotificationPrefsRepository(db).Get(userID)
	if err != nil {
		return "", false
	}
	if prefs.EmailOptOut || prefs.Mode != models.NotificationModeRealtime {
		return "", false
	}
	return strings.TrimSpace(email.String), true
}

// ShouldEmailUserDigest reports whether userID may receive the daily digest
// mail: needs an email address, no opt-out, and mode == digest. Realtime
// users already got immediate mail; off users get nothing.
func ShouldEmailUserDigest(db *sql.DB, userID int64) (string, bool) {
	var email sql.NullString
	if err := db.QueryRow(`SELECT email FROM users WHERE id = ?`, userID).Scan(&email); err != nil {
		return "", false
	}
	if !email.Valid || strings.TrimSpace(email.String) == "" {
		return "", false
	}
	prefs, err := NewNotificationPrefsRepository(db).Get(userID)
	if err != nil {
		return "", false
	}
	if prefs.EmailOptOut || prefs.Mode != models.NotificationModeDigest {
		return "", false
	}
	return strings.TrimSpace(email.String), true
}

// TicketCreatedMail builds the "ticket opened" email.
func TicketCreatedMail(panelName, ticketNo, subject, category, priority, owner string) (string, string) {
	subj := fmt.Sprintf("[%s] New ticket %s: %s", panelName, ticketNo, subject)
	body := fmt.Sprintf("A new ticket was opened by %s.\n\nTicket: %s\nSubject: %s\nCategory: %s\nPriority: %s\n\nOpen it in the panel: Tickets → %s\n",
		owner, ticketNo, subject, category, priority, ticketNo)
	return subj, body
}

// TicketAssignedMail builds the "ticket assigned to you" email.
func TicketAssignedMail(panelName, ticketNo, subject, assigner string) (string, string) {
	subj := fmt.Sprintf("[%s] Ticket %s assigned to you", panelName, ticketNo)
	body := fmt.Sprintf("%s assigned ticket %s to you.\n\nSubject: %s\n\nOpen it in the panel: Tickets → %s\n",
		assigner, ticketNo, subject, ticketNo)
	return subj, body
}

// TicketRepliedMail builds the "new reply" email (excerpt capped so the
// message stays a notification, not a full dump).
func TicketRepliedMail(panelName, ticketNo, author, excerpt string) (string, string) {
	if len(excerpt) > 500 {
		excerpt = excerpt[:500] + "…"
	}
	subj := fmt.Sprintf("[%s] New reply on %s", panelName, ticketNo)
	body := fmt.Sprintf("%s replied on ticket %s:\n\n%s\n\nOpen it in the panel: Tickets → %s\n",
		author, ticketNo, excerpt, ticketNo)
	return subj, body
}

// TicketEscalatedMail builds the SLA breach/escalation email.
func TicketEscalatedMail(panelName, ticketNo, subject, newPriority string) (string, string) {
	subj := fmt.Sprintf("[%s] SLA breached on %s — escalated to %s", panelName, ticketNo, newPriority)
	body := fmt.Sprintf("Ticket %s (%s) passed its due date while still open.\n\nIt was auto-escalated to priority %s.\n\nOpen it in the panel: Tickets → %s\n",
		ticketNo, subject, newPriority, ticketNo)
	return subj, body
}

// DigestMailBody builds the daily digest summary.
func DigestMailBody(panelName string, unread int, titles []string) (string, string) {
	subj := fmt.Sprintf("[%s] Daily digest: %d unread notification%s", panelName, unread, plural(unread))
	var b strings.Builder
	fmt.Fprintf(&b, "You have %d unread notification%s.\n\n", unread, plural(unread))
	for _, t := range titles {
		fmt.Fprintf(&b, "• %s\n", t)
	}
	b.WriteString("\nOpen the panel → Notifications to catch up.\n")
	return subj, b.String()
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
