package repository

import (
	"database/sql"
	"testing"

	"github.com/example/kspanel/internal/db"
	_ "modernc.org/sqlite"
)

// newEnrichTestDB builds a sqlite fixture with the full users face columns
// the batched enrich query selects, plus tickets/comments/sla rows.
func newEnrichTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	stmts := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', accent_color TEXT NOT NULL DEFAULT '', avatar_symbol TEXT NOT NULL DEFAULT '', avatar_mime TEXT, avatar_filename TEXT, email TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_no TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'general', priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', created_by INTEGER NOT NULL, assigned_to INTEGER, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', closed_at TEXT, due_at TEXT, tags TEXT NOT NULL DEFAULT '[]')`,
		`CREATE TABLE ticket_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL DEFAULT '', is_internal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE ticket_sla (ticket_id INTEGER PRIMARY KEY, first_response_at TEXT, sla_breached INTEGER NOT NULL DEFAULT 0, escalated INTEGER NOT NULL DEFAULT 0, escalated_at TEXT)`,
		`INSERT INTO users (id, username, display_name, email) VALUES (1, 'alice', 'Alice', 'alice@example.com'), (2, 'bob', 'Bob', 'bob@example.com')`,
		`INSERT INTO tickets (id, ticket_no, subject, category, priority, status, created_by, assigned_to, created_at, updated_at, tags) VALUES (1, 'TKT-000001', 'first', 'general', 'medium', 'open', 1, 2, '2026-01-01 10:00:00', '2026-01-01 10:00:00', '[]')`,
		`INSERT INTO tickets (id, ticket_no, subject, category, priority, status, created_by, created_at, updated_at, tags) VALUES (2, 'TKT-000002', 'second', 'general', 'low', 'open', 2, '2026-01-01 11:00:00', '2026-01-01 11:00:00', '[]')`,
		`INSERT INTO ticket_comments (ticket_id, author_id, body, created_at, updated_at) VALUES (1, 1, 'hello', '2026-01-01 10:05:00', '2026-01-01 10:05:00')`,
		`INSERT INTO ticket_comments (ticket_id, author_id, body, created_at, updated_at) VALUES (1, 2, 'reply', '2026-01-01 10:06:00', '2026-01-01 10:06:00')`,
		`INSERT INTO ticket_sla (ticket_id, first_response_at, sla_breached, escalated) VALUES (1, '2026-01-01 10:05:00', 1, 0)`,
	}
	for _, s := range stmts {
		if _, err := conn.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return conn
}

// TestRebindPostgres proves the central ? -> $N rewrite (no live PG in CI,
// so this dialect-level test is the portability proof for proposal 1).
func TestRebindPostgres(t *testing.T) {
	q := "SELECT * FROM tickets WHERE status = ? AND id IN (?,?) ORDER BY id LIMIT ? OFFSET ?"
	want := "SELECT * FROM tickets WHERE status = $1 AND id IN ($2,$3) ORDER BY id LIMIT $4 OFFSET $5"
	if got := db.Rebind("postgres", q); got != want {
		t.Fatalf("postgres rebind wrong:\n got %q\nwant %q", got, want)
	}
	for _, eng := range []string{"postgresql", "pg", " Postgres "} {
		if got := db.Rebind(eng, "a=? AND b=?"); got != "a=$1 AND b=$2" {
			t.Fatalf("engine %q must rebind, got %q", eng, got)
		}
	}
	for _, eng := range []string{"", "sqlite", "mysql", "mariadb"} {
		if got := db.Rebind(eng, q); got != q {
			t.Fatalf("engine %q must pass through, got %q", eng, got)
		}
	}
	if got := db.Rebind("postgres", "SELECT 1"); got != "SELECT 1" {
		t.Fatalf("bind-free query must be unchanged, got %q", got)
	}
}

// TestTicketRepoRebindWiring proves the repository routes through Rebind
// with an explicit postgres dialect, and sniffs sqlite for the default
// constructor (modernc driver) without any handler changes.
func TestTicketRepoRebindWiring(t *testing.T) {
	conn := newEnrichTestDB(t)
	d, err := db.NewDialect("postgres")
	if err != nil {
		t.Fatalf("NewDialect(postgres): %v", err)
	}
	pg := NewTicketRepositoryWithDialect(conn, d)
	if pg.engineOf() != "postgres" {
		t.Fatalf("explicit dialect must win, got %q", pg.engineOf())
	}
	if got := pg.rebind("WHERE a = ? AND b = ?"); got != "WHERE a = $1 AND b = $2" {
		t.Fatalf("pg repo must emit $N, got %q", got)
	}
	plain := NewTicketRepository(conn)
	if plain.engineOf() != "sqlite" {
		t.Fatalf("sqlite driver must sniff as sqlite, got %q", plain.engineOf())
	}
	if got := plain.rebind("WHERE a = ?"); got != "WHERE a = ?" {
		t.Fatalf("sqlite repo must keep ?, got %q", got)
	}
}

// TestEnrichTicketsBatched proves one batched enrich fills names, counts,
// last-reply author and SLA flags for a multi-ticket list.
func TestEnrichTicketsBatched(t *testing.T) {
	conn := newEnrichTestDB(t)
	repo := NewTicketRepository(conn)
	out, total, err := repo.List("", "", "", "", false, 0, 10, 0, true)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if total != 2 || len(out) != 2 {
		t.Fatalf("want 2 tickets, got total=%d len=%d", total, len(out))
	}
	byNo := map[string]int{}
	for i, tk := range out {
		byNo[tk.TicketNo] = i
	}
	first := out[byNo["TKT-000001"]]
	if first.CreatorName != "alice" || first.CreatorDisplayName != "Alice" || first.CreatorEmail != "alice@example.com" {
		t.Fatalf("creator not enriched: %+v", first)
	}
	if first.AssigneeName != "bob" || first.AssigneeDisplayName != "Bob" {
		t.Fatalf("assignee not enriched: %+v", first)
	}
	if first.CommentCount != 2 {
		t.Fatalf("CommentCount = %d, want 2", first.CommentCount)
	}
	if first.LastReplyBy == nil || *first.LastReplyBy != 2 {
		t.Fatalf("LastReplyBy must be bob(2), got %+v", first.LastReplyBy)
	}
	if first.LastReplyAt == nil || first.LastReplyAt.Format("2006-01-02 15:04:05") != "2026-01-01 10:06:00" {
		t.Fatalf("LastReplyAt must be latest comment time, got %+v", first.LastReplyAt)
	}
	if !first.SLABreached || first.FirstResponseAt == nil {
		t.Fatalf("SLA sidecar not enriched: breached=%v first=%+v", first.SLABreached, first.FirstResponseAt)
	}
	second := out[byNo["TKT-000002"]]
	if second.CreatorName != "bob" {
		t.Fatalf("second creator must be bob, got %q", second.CreatorName)
	}
	if second.CommentCount != 0 || second.LastReplyBy != nil {
		t.Fatalf("comment-free ticket must have zero state, got count=%d by=%+v", second.CommentCount, second.LastReplyBy)
	}
	if second.SLABreached || second.FirstResponseAt != nil {
		t.Fatalf("missing SLA row must read as zero state: %+v", second)
	}
}

// TestEnrichPropagatesErrors proves enrich failures surface instead of
// being swallowed (proposal 2): a broken connection must fail List/Get.
func TestEnrichPropagatesErrors(t *testing.T) {
	conn := newEnrichTestDB(t)
	repo := NewTicketRepository(conn)
	conn.Close()
	if _, _, err := repo.List("", "", "", "", true, 0, 10, 0, true); err == nil {
		t.Fatal("List on closed DB must return an error, got nil")
	}
	if _, err := repo.Get(1); err == nil {
		t.Fatal("Get on closed DB must return an error, got nil")
	}
}

// TestTicketCreateCommentRoundtrip exercises the portable INSERT-id helper
// on the default engine: Create stamps TKT-00000{id} and AddComment links.
func TestTicketCreateCommentRoundtrip(t *testing.T) {
	conn := newEnrichTestDB(t)
	repo := NewTicketRepository(conn)
	created, err := repo.Create(CreateTicketInput{Subject: "hello", Category: "general", Priority: "high", CreatedBy: 1})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID <= 0 || created.TicketNo == "TMP" || created.TicketNo == "" {
		t.Fatalf("ticket_no must be stamped, got %+v", created)
	}
	if created.CreatorName != "alice" {
		t.Fatalf("created ticket must be enriched, got %+v", created)
	}
	c, err := repo.AddComment(created.ID, 2, "ack", false)
	if err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	if c.ID <= 0 || c.TicketID != created.ID {
		t.Fatalf("comment mislinked: %+v", c)
	}
	got, err := repo.Get(created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.CommentCount != 1 || got.LastReplyBy == nil || *got.LastReplyBy != 2 {
		t.Fatalf("enrich after comment wrong: count=%d by=%+v", got.CommentCount, got.LastReplyBy)
	}
}
