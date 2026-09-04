package repository

import (
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/example/kspanel/internal/models"
	_ "modernc.org/sqlite"
)

func newTestTicketDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	stmts := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, email TEXT DEFAULT '', role_id INTEGER DEFAULT 1)`,
		`CREATE TABLE permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL)`,
		`CREATE TABLE role_permissions (role_id INTEGER NOT NULL, permission_id INTEGER NOT NULL)`,
		`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_no TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'general', priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', created_by INTEGER NOT NULL, assigned_to INTEGER, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', closed_at TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]')`,
		`CREATE TABLE ticket_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL DEFAULT '', is_internal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE ticket_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, comment_id INTEGER, file_name TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT 'application/octet-stream', size_bytes INTEGER NOT NULL DEFAULT 0, sha256 TEXT NOT NULL DEFAULT '', uploaded_by INTEGER NOT NULL, created_at TEXT NOT NULL)`,
		`CREATE TABLE ticket_sla (ticket_id INTEGER PRIMARY KEY, first_response_at TEXT, sla_breached INTEGER NOT NULL DEFAULT 0, escalated INTEGER NOT NULL DEFAULT 0, escalated_at TEXT)`,
		`CREATE TABLE notification_prefs (user_id INTEGER PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'realtime', email_opt_out INTEGER NOT NULL DEFAULT 0, last_digest_at TEXT)`,
		`CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, actor_id INTEGER, actor_name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'general', priority TEXT NOT NULL DEFAULT 'normal', title TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', action_label TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '', is_broadcast INTEGER NOT NULL DEFAULT 0, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, read_at TEXT)`,
		`INSERT INTO users (id, username, email, role_id) VALUES (1, 'alice', 'alice@example.com', 1), (2, 'bob', 'bob@example.com', 1)`,
		`INSERT INTO permissions (id, key) VALUES (1, 'MANAGE_TICKETS')`,
		`INSERT INTO role_permissions (role_id, permission_id) VALUES (1, 1)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup %q: %v", s[:40], err)
		}
	}
	return db
}

// --- Attachments: allowlist + caps ---

func TestValidateAttachmentAllowlist(t *testing.T) {
	png := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 'I', 'H', 'D', 'R'}
	if _, err := ValidateAttachment("shot.png", int64(len(png)), png); err != nil {
		t.Fatalf("png must pass: %v", err)
	}
	if _, err := ValidateAttachment("doc.pdf", 100, []byte("%PDF-1.4 fake")); err != nil {
		t.Fatalf("pdf must pass: %v", err)
	}
	// Executable bytes must be rejected even with a friendly name.
	if _, err := ValidateAttachment("run.png", 10, []byte("#!/bin/sh\nevil")); err == nil {
		t.Fatal("mismatched extension/content must be rejected")
	}
	if _, err := ValidateAttachment("evil.exe", 10, []byte("MZ fake binary")); err == nil {
		t.Fatal("exe must be rejected")
	}
	if _, err := ValidateAttachment("empty.log", 0, []byte{}); err == nil {
		t.Fatal("empty file must be rejected")
	}
	big := make([]byte, models.MaxTicketAttachmentBytes+1)
	for i := range big {
		big[i] = 'a'
	}
	if _, err := ValidateAttachment("big.log", int64(len(big)), big); err == nil {
		t.Fatal("oversize must be rejected")
	}
}

func TestAttachmentExtMismatch(t *testing.T) {
	// Real PNG bytes under a .log name must be rejected (family check).
	png := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00}
	if _, err := ValidateAttachment("notes.log", int64(len(png)), png); err == nil {
		t.Fatal("png bytes as .log must be rejected")
	}
}

// --- SLA: priorities + config ---

func TestEscalatedPrioritySteps(t *testing.T) {
	cases := map[string]string{"low": "medium", "medium": "high", "high": "urgent", "urgent": "critical", "critical": "critical"}
	for in, want := range cases {
		if got := models.EscalatedPriority(in); got != want {
			t.Fatalf("EscalatedPriority(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSLAConfigDefaultsAndValidation(t *testing.T) {
	db := newTestTicketDB(t)
	repo := NewTicketRepository(db)
	cfg := repo.GetSLAConfig()
	if cfg["technical"].FirstResponseMins != 30 || cfg["technical"].ResolveHours != 12 {
		t.Fatalf("seed/default technical policy wrong: %+v", cfg["technical"])
	}
	if err := repo.SetSLAConfig(map[string]models.TicketSLAPolicy{"nope": {FirstResponseMins: 1, ResolveHours: 1}}); err == nil {
		t.Fatal("unknown category must be rejected")
	}
	if err := repo.SetSLAConfig(map[string]models.TicketSLAPolicy{"general": {FirstResponseMins: 0, ResolveHours: 1}}); err == nil {
		t.Fatal("non-positive durations must be rejected")
	}
	good := map[string]models.TicketSLAPolicy{"general": {FirstResponseMins: 15, ResolveHours: 4}}
	if err := repo.SetSLAConfig(good); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}
	if got := repo.PolicyFor("general").FirstResponseMins; got != 15 {
		t.Fatalf("persisted policy not read back: %d", got)
	}
	if due := repo.ComputeDueAt("general", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)); due.Hour() != 4 {
		t.Fatalf("ComputeDueAt must add resolve_hours, got %v", due)
	}
}

// --- SLA sidecar + overdue ---

func TestFirstResponseAndOverdue(t *testing.T) {
	db := newTestTicketDB(t)
	repo := NewTicketRepository(db)
	past := time.Now().UTC().Add(-2 * time.Hour).Format("2006-01-02 15:04:05")
	res, err := db.Exec(`INSERT INTO tickets (ticket_no, subject, category, priority, status, created_by, created_at, updated_at, due_at, tags) VALUES ('TKT-000001','s','general','medium','open',1,'2026-01-01 00:00:00','2026-01-01 00:00:00',?, '[]')`, past)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	if err := repo.MarkFirstResponse(id, time.Now().UTC()); err != nil {
		t.Fatalf("MarkFirstResponse: %v", err)
	}
	sla, err := repo.GetSLA(id)
	if err != nil || sla == nil || sla.FirstResponseAt == nil {
		t.Fatalf("first response must be stamped: %+v err=%v", sla, err)
	}
	// Second stamp must not overwrite the first.
	first := *sla.FirstResponseAt
	if err := repo.MarkFirstResponse(id, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	sla2, _ := repo.GetSLA(id)
	if !sla2.FirstResponseAt.Equal(first) {
		t.Fatal("first response must be sticky")
	}
	overdue, err := repo.OverdueTickets(time.Now().UTC())
	if err != nil {
		t.Fatalf("OverdueTickets: %v", err)
	}
	if len(overdue) != 1 || overdue[0].ID != id {
		t.Fatalf("overdue must list the ticket, got %+v", overdue)
	}
	if err := repo.MarkBreachedAndEscalate(id, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	overdue2, _ := repo.OverdueTickets(time.Now().UTC())
	if len(overdue2) != 0 {
		t.Fatal("breached ticket must leave the overdue set")
	}
	if sla3, _ := repo.GetSLA(id); sla3 == nil || !sla3.SLABreached || !sla3.Escalated {
		t.Fatalf("breach flags must flip: %+v", sla3)
	}
}

func TestTicketStatsSLAPct(t *testing.T) {
	db := newTestTicketDB(t)
	repo := NewTicketRepository(db)
	for i := 0; i < 3; i++ {
		if _, err := db.Exec(`INSERT INTO tickets (ticket_no, subject, category, priority, status, created_by, created_at, updated_at, tags) VALUES (?,?,?,?, 'open', 1, '2026-01-01 00:00:00','2026-01-01 00:00:00','[]')`, "TKT-00000"+string(rune('1'+i)), "s", "general", "medium"); err != nil {
			t.Fatal(err)
		}
	}
	s, err := repo.Stats(1, true)
	if err != nil {
		t.Fatal(err)
	}
	if s.Total != 3 || s.SLAPct != 100 {
		t.Fatalf("fresh stats wrong: %+v", s)
	}
	if _, err := db.Exec(`INSERT INTO ticket_sla (ticket_id, sla_breached, escalated) VALUES (1, 1, 1)`); err != nil {
		t.Fatal(err)
	}
	s2, _ := repo.Stats(1, true)
	if s2.Breached != 1 {
		t.Fatalf("breached count wrong: %+v", s2)
	}
	want := float64(2) * 100 / float64(3)
	if s2.SLAPct < want-0.01 || s2.SLAPct > want+0.01 {
		t.Fatalf("sla_pct = %v, want ~%v", s2.SLAPct, want)
	}
}

// --- Notification prefs gating ---

func TestNotificationPrefsDefaultsAndValidation(t *testing.T) {
	db := newTestTicketDB(t)
	repo := NewNotificationPrefsRepository(db)
	p, err := repo.Get(1)
	if err != nil {
		t.Fatal(err)
	}
	if p.Mode != models.NotificationModeRealtime || p.EmailOptOut {
		t.Fatalf("defaults must be realtime/opted-in: %+v", p)
	}
	if _, err := repo.Set(1, "bogus", false); err == nil {
		t.Fatal("invalid mode must be rejected")
	}
	set, err := repo.Set(1, "digest", true)
	if err != nil {
		t.Fatal(err)
	}
	if set.Mode != models.NotificationModeDigest || !set.EmailOptOut {
		t.Fatalf("set not persisted: %+v", set)
	}
}

func TestShouldEmailGating(t *testing.T) {
	db := newTestTicketDB(t)
	// Realtime + opted in → mail.
	if _, ok := ShouldEmailUser(db, 1); !ok {
		t.Fatal("realtime opted-in user must be mailable")
	}
	// Opt-out blocks everything.
	if _, err := NewNotificationPrefsRepository(db).Set(1, "realtime", true); err != nil {
		t.Fatal(err)
	}
	if _, ok := ShouldEmailUser(db, 1); ok {
		t.Fatal("opted-out user must not be mailable")
	}
	// Digest mode → no immediate mail, but digest mail allowed.
	if _, err := NewNotificationPrefsRepository(db).Set(1, "digest", false); err != nil {
		t.Fatal(err)
	}
	if _, ok := ShouldEmailUser(db, 1); ok {
		t.Fatal("digest user must not get immediate mail")
	}
	if _, ok := ShouldEmailUserDigest(db, 1); !ok {
		t.Fatal("digest user must get the daily summary")
	}
	// Off → nothing.
	if _, err := NewNotificationPrefsRepository(db).Set(1, "off", false); err != nil {
		t.Fatal(err)
	}
	if _, ok := ShouldEmailUserDigest(db, 1); ok {
		t.Fatal("off user must not get digest mail")
	}
}

// --- Mail bodies never carry credentials ---

func TestMailBodiesHaveNoSecrets(t *testing.T) {
	s1, b1 := TicketCreatedMail("P", "TKT-1", "subj", "general", "high", "alice")
	s2, b2 := TicketEscalatedMail("P", "TKT-1", "subj", "urgent")
	s3, b3 := DigestMailBody("P", 2, []string{"a", "b"})
	for _, s := range []string{s1, b1, s2, b2, s3, b3} {
		low := strings.ToLower(s)
		if strings.Contains(low, "password") || strings.Contains(low, "secret") {
			t.Fatalf("mail body must not mention secrets: %q", s)
		}
	}
	if !strings.Contains(s1, "TKT-1") || !strings.Contains(s2, "urgent") || !strings.Contains(b3, "unread") {
		t.Fatal("mail bodies must carry the ticket context")
	}
}

func TestBuildEmailHeaders(t *testing.T) {
	raw := string(buildEmail("kspanel <a@b.c>", "u@d.e", "subj", "body"))
	if !strings.Contains(raw, "From: kspanel <a@b.c>\r\n") || !strings.Contains(raw, "To: u@d.e\r\n") || !strings.Contains(raw, "Subject: subj\r\n") {
		t.Fatalf("email headers malformed: %q", raw)
	}
}
