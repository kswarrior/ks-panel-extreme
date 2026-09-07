package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// AI persistence (migration 066): DB-backed confirmation tickets (survive
// restarts, unlike the old process-local map) and per-user chat threads.
// Every method is scoped by user_id so users can never touch each other's
// rows. Timestamps are written UTC "2006-01-02 15:04:05" and read back
// through sql.NullString + parse, the same portable shape the template /
// theme repositories use on all three engines.

// ---------------------------------------------------------------------------
// Confirmation tickets.
// ---------------------------------------------------------------------------

// AITicketRow is one pending write-tool proposal awaiting approval.
type AITicketRow struct {
	ID        string
	UserID    int64
	Tool      string
	ArgsJSON  string
	Summary   string
	Diff      string
	ExpiresAt time.Time
}

type AITicketRepository struct {
	db *sql.DB
}

func NewAITicketRepository(db *sql.DB) *AITicketRepository {
	return &AITicketRepository{db: db}
}

func aiParseTime(s string) time.Time {
	s = strings.TrimSpace(s)
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC()
	}
	return time.Time{}
}

func aiFormatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02 15:04:05")
}

// Store inserts the ticket after sweeping expired rows (mirrors the old
// in-memory store's sweep-on-write so the table stays bounded).
func (r *AITicketRepository) Store(t *AITicketRow) error {
	if t == nil || strings.TrimSpace(t.ID) == "" || t.UserID == 0 {
		return fmt.Errorf("invalid ticket")
	}
	_, _ = r.db.Exec(`DELETE FROM ai_confirmation_tickets WHERE expires_at <= ?`, aiFormatTime(time.Now().UTC()))
	_, err := r.db.Exec(`INSERT INTO ai_confirmation_tickets (id, user_id, tool, args_json, summary, diff, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.UserID, t.Tool, t.ArgsJSON, t.Summary, t.Diff, aiFormatTime(t.ExpiresAt))
	return err
}

// Take returns the ticket and deletes it (single-use) when it exists, is
// owned by uid and is not expired. Anything else reports ok=false so the
// caller answers 410 Gone — same contract as the old map version.
func (r *AITicketRepository) Take(id string, uid int64) (*AITicketRow, bool) {
	var t AITicketRow
	var uidOut int64
	var tool, argsJSON, summary, diff, expires sql.NullString
	err := r.db.QueryRow(`SELECT id, user_id, tool, args_json, summary, diff, expires_at FROM ai_confirmation_tickets WHERE id = ?`, id).
		Scan(&t.ID, &uidOut, &tool, &argsJSON, &summary, &diff, &expires)
	if err != nil {
		return nil, false
	}
	t.UserID = uidOut
	t.Tool = tool.String
	t.ArgsJSON = argsJSON.String
	t.Summary = summary.String
	t.Diff = diff.String
	t.ExpiresAt = aiParseTime(expires.String)
	if t.UserID != uid || t.ExpiresAt.IsZero() || !t.ExpiresAt.After(time.Now().UTC()) {
		return nil, false
	}
	// Conditional delete: a concurrent take of the same id wins only once.
	res, err := r.db.Exec(`DELETE FROM ai_confirmation_tickets WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return nil, false
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, false
	}
	return &t, true
}

// ---------------------------------------------------------------------------
// Chat threads + messages.
// ---------------------------------------------------------------------------

// AIThread is one persisted conversation.
type AIThread struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	MsgCount  int       `json:"msg_count"`
	CreatedAt time.Time `json:"created_at"`
}

// AIMessage is one persisted turn.
type AIMessage struct {
	ID      int64  `json:"id"`
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIThreadRepository struct {
	db *sql.DB
}

func NewAIThreadRepository(db *sql.DB) *AIThreadRepository {
	return &AIThreadRepository{db: db}
}

// Create opens a thread for uid. An empty title becomes "New chat".
func (r *AIThreadRepository) Create(uid int64, title string) (int64, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "New chat"
	}
	if len(title) > 120 {
		title = title[:120]
	}
	res, err := r.db.Exec(`INSERT INTO ai_chat_threads (user_id, title) VALUES (?, ?)`, uid, title)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// List returns uid's threads newest-first with message counts. Rows with a
// NULL id are skipped: the pinned sqlite driver (modernc v1.6.0) yields one
// all-NULL phantom row for empty result sets instead of zero rows, so a
// plain Scan into int64 would fail the list exactly when the user has no
// threads yet. Skipping NULL ids is a no-op on drivers with correct
// empty-set semantics.
func (r *AIThreadRepository) List(uid int64) ([]AIThread, error) {
	rows, err := r.db.Query(`SELECT t.id, t.title, t.created_at,
		(SELECT COUNT(*) FROM ai_chat_messages m WHERE m.thread_id = t.id)
		FROM ai_chat_threads t WHERE t.user_id = ? ORDER BY t.id DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AIThread{}
	for rows.Next() {
		var th AIThread
		var id, msgCount sql.NullInt64
		var title, created sql.NullString
		if err := rows.Scan(&id, &title, &created, &msgCount); err != nil {
			return nil, err
		}
		if !id.Valid {
			continue
		}
		th.ID, th.Title, th.MsgCount = id.Int64, title.String, int(msgCount.Int64)
		th.CreatedAt = aiParseTime(created.String)
		out = append(out, th)
	}
	return out, rows.Err()
}

// Owned resolves a thread id to its row when it belongs to uid.
func (r *AIThreadRepository) Owned(uid, id int64) (*AIThread, error) {
	var th AIThread
	var created sql.NullString
	err := r.db.QueryRow(`SELECT id, title, created_at FROM ai_chat_threads WHERE id = ? AND user_id = ?`, id, uid).
		Scan(&th.ID, &th.Title, &created)
	if err != nil {
		return nil, fmt.Errorf("thread not found")
	}
	th.CreatedAt = aiParseTime(created.String)
	return &th, nil
}

// Rename changes the title of uid's thread.
func (r *AIThreadRepository) Rename(uid, id int64, title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return fmt.Errorf("title cannot be empty")
	}
	if len(title) > 120 {
		title = title[:120]
	}
	res, err := r.db.Exec(`UPDATE ai_chat_threads SET title = ? WHERE id = ? AND user_id = ?`, title, id, uid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("thread not found")
	}
	return nil
}

// Delete removes uid's thread; messages cascade via FK.
func (r *AIThreadRepository) Delete(uid, id int64) error {
	res, err := r.db.Exec(`DELETE FROM ai_chat_threads WHERE id = ? AND user_id = ?`, id, uid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("thread not found")
	}
	return nil
}

// AddMessage appends a turn to uid's thread. Role is allow-listed so the
// stored transcript only ever holds model-protocol roles.
func (r *AIThreadRepository) AddMessage(uid, threadID int64, role, content string) error {
	role = strings.ToLower(strings.TrimSpace(role))
	if role != "user" && role != "assistant" {
		return fmt.Errorf("role must be user or assistant")
	}
	if strings.TrimSpace(content) == "" {
		return fmt.Errorf("content cannot be empty")
	}
	if len(content) > 20000 {
		content = content[:20000]
	}
	if _, err := r.Owned(uid, threadID); err != nil {
		return err
	}
	_, err := r.db.Exec(`INSERT INTO ai_chat_messages (thread_id, role, content) VALUES (?, ?, ?)`, threadID, role, content)
	return err
}

// MessageCount returns the TOTAL persisted turns in uid's thread (no window
// cap), matching List's MsgCount semantics. The detail endpoint serves the
// last-50 window for messages but reports the total here.
func (r *AIThreadRepository) MessageCount(uid, threadID int64) (int, error) {
	if _, err := r.Owned(uid, threadID); err != nil {
		return 0, err
	}
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM ai_chat_messages WHERE thread_id = ?`, threadID).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// LastMessages returns up to n of uid's thread turns, oldest-first (model
// context order). n is clamped to 1..50 — the server's context window.
// NULL-id rows are skipped for the same phantom-row reason as List, so a
// thread with no messages yet reads as empty instead of erroring.
func (r *AIThreadRepository) LastMessages(uid, threadID int64, n int) ([]AIMessage, error) {
	if n <= 0 {
		n = 50
	}
	if n > 50 {
		n = 50
	}
	if _, err := r.Owned(uid, threadID); err != nil {
		return nil, err
	}
	rows, err := r.db.Query(`SELECT id, role, content FROM ai_chat_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?`, threadID, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AIMessage
	for rows.Next() {
		var m AIMessage
		var id sql.NullInt64
		var role, content sql.NullString
		if err := rows.Scan(&id, &role, &content); err != nil {
			return nil, err
		}
		if !id.Valid {
			continue
		}
		m.ID, m.Role, m.Content = id.Int64, role.String, content.String
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Reverse to chronological order.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}
