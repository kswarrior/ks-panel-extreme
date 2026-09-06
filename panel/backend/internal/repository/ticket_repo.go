package repository

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/models"
)

type TicketRepository struct {
	db *sql.DB
	// dialect pins the engine for placeholder rebinding ("?" -> "$N" on
	// Postgres) and INSERT id retrieval (RETURNING id on Postgres).
	// Nil means "sniff the live connection's driver" (see pg_compat.go),
	// so existing NewTicketRepository callers keep SQLite behaviour
	// without changes.
	dialect db.Dialect
}

func NewTicketRepository(db *sql.DB) *TicketRepository {
	return &TicketRepository{db: db}
}

// NewTicketRepositoryWithDialect constructs a TicketRepository with an
// explicit engine. Tests and Postgres/MySQL callers use it to prove the
// rebind/RETURNING paths without a live server; handlers keep using
// NewTicketRepository (driver sniffing covers them).
func NewTicketRepositoryWithDialect(conn *sql.DB, d db.Dialect) *TicketRepository {
	return &TicketRepository{db: conn, dialect: d}
}

func parseTicketTime(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t
	}
	return time.Time{}
}

func parseTicketTimePtr(s sql.NullString) *time.Time {
	if !s.Valid || s.String == "" {
		return nil
	}
	t := parseTicketTime(s.String)
	if t.IsZero() {
		return nil
	}
	return &t
}

const ticketColumns = `t.id, t.ticket_no, t.subject, t.description, t.category, t.priority, t.status,
	t.created_by, t.assigned_to, t.created_at, t.updated_at, t.closed_at, t.due_at, t.tags`

func scanTicket(scanner interface{ Scan(...any) error }) (*models.Ticket, error) {
	var tk models.Ticket
	var ticketNo, subject, description, category, priority, status, tags sql.NullString
	var createdBy int64
	var assignedTo sql.NullInt64
	var createdAt, updatedAt sql.NullString
	var closedAt, dueAt sql.NullString
	if err := scanner.Scan(&tk.ID, &ticketNo, &subject, &description, &category, &priority, &status,
		&createdBy, &assignedTo, &createdAt, &updatedAt, &closedAt, &dueAt, &tags); err != nil {
		return nil, err
	}
	tk.TicketNo = ticketNo.String
	tk.Subject = subject.String
	tk.Description = description.String
	tk.Category = category.String
	tk.Priority = priority.String
	tk.Status = status.String
	tk.CreatedBy = createdBy
	if assignedTo.Valid {
		v := assignedTo.Int64
		tk.AssignedTo = &v
	}
	tk.CreatedAt = parseTicketTime(createdAt.String)
	tk.UpdatedAt = parseTicketTime(updatedAt.String)
	tk.ClosedAt = parseTicketTimePtr(closedAt)
	tk.DueAt = parseTicketTimePtr(dueAt)
	tk.Tags = tags.String
	if tk.Tags == "" {
		tk.Tags = "[]"
	}
	return &tk, nil
}

// enrichTickets fills denormalised names + comment counts + last reply.
//
// Every lookup is batched no matter the batch size: one users
// SELECT ... WHERE id IN, one comment-count GROUP BY, one last-reply
// GROUP BY MAX(id), one SLA SELECT ... WHERE id IN. There are no
// per-ticket queries. Every query/scan failure is propagated to the
// caller; only a missing user row (deleted author) or a missing SLA
// sidecar table (pre-065 database) degrades to zero values.
func (r *TicketRepository) enrichTickets(tickets []models.Ticket) ([]models.Ticket, error) {
	if len(tickets) == 0 {
		return tickets, nil
	}
	ids := make([]int64, len(tickets))
	idIdx := make(map[int64]int, len(tickets))
	for i, t := range tickets {
		ids[i] = t.ID
		idIdx[t.ID] = i
	}
	// Batch users: every creator + assignee in a single IN query.
	userSet := make(map[int64]struct{}, len(tickets)*2)
	for i := range tickets {
		userSet[tickets[i].CreatedBy] = struct{}{}
		if tickets[i].AssignedTo != nil {
			userSet[*tickets[i].AssignedTo] = struct{}{}
		}
	}
	if len(userSet) > 0 {
		uids := make([]int64, 0, len(userSet))
		for id := range userSet {
			uids = append(uids, id)
		}
		holders := strings.Repeat("?,", len(uids))
		holders = holders[:len(holders)-1]
		args := make([]any, len(uids))
		for i, id := range uids {
			args[i] = id
		}
		type userFace struct {
			name, display, accent, symbol, mime, file, email string
		}
		faces := make(map[int64]userFace, len(uids))
		rows, err := r.db.Query(r.rebind(`SELECT id, username, display_name, accent_color, avatar_symbol, avatar_mime, avatar_filename, email FROM users WHERE id IN (`+holders+`)`), args...)
		if err != nil {
			return nil, err
		}
		func() {
			defer rows.Close()
			for rows.Next() {
				var id int64
				var cName, cDisplay, cAccent, cSymbol, cMime, cFile, cEmail sql.NullString
				if serr := rows.Scan(&id, &cName, &cDisplay, &cAccent, &cSymbol, &cMime, &cFile, &cEmail); serr != nil {
					err = serr
					return
				}
				faces[id] = userFace{
					name: cName.String, display: cDisplay.String, accent: cAccent.String,
					symbol: cSymbol.String, mime: cMime.String, file: cFile.String, email: cEmail.String,
				}
			}
			err = rows.Err()
		}()
		if err != nil {
			return nil, err
		}
		for i := range tickets {
			t := &tickets[i]
			if u, ok := faces[t.CreatedBy]; ok {
				t.CreatorName = u.name
				t.CreatorDisplayName = u.display
				t.CreatorAccentColor = u.accent
				t.CreatorAvatarSymbol = u.symbol
				t.CreatorEmail = u.email
				if u.mime != "" && u.file != "" {
					t.CreatorHasAvatar = true
				}
			}
			if t.AssignedTo != nil {
				if u, ok := faces[*t.AssignedTo]; ok {
					t.AssigneeName = u.name
					t.AssigneeDisplayName = u.display
					t.AssigneeAccentColor = u.accent
					t.AssigneeAvatarSymbol = u.symbol
					if u.mime != "" && u.file != "" {
						t.AssigneeHasAvatar = true
					}
				}
			}
		}
	}
	// Comment counts + last reply + SLA sidecar share one IN holder set.
	holders := strings.Repeat("?,", len(ids))
	holders = holders[:len(holders)-1]
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := r.db.Query(
		r.rebind(`SELECT ticket_id, COUNT(*), MAX(created_at) FROM ticket_comments WHERE ticket_id IN (`+holders+`) GROUP BY ticket_id`),
		args...)
	if err != nil {
		return nil, err
	}
	func() {
		defer rows.Close()
		for rows.Next() {
			var tid int64
			var cnt int
			var maxAt sql.NullString
			if serr := rows.Scan(&tid, &cnt, &maxAt); serr != nil {
				err = serr
				return
			}
			if idx, ok := idIdx[tid]; ok {
				tickets[idx].CommentCount = cnt
				if maxAt.Valid && maxAt.String != "" {
					if tm := parseTicketTime(maxAt.String); !tm.IsZero() {
						tickets[idx].LastReplyAt = &tm
					}
				}
			}
		}
		err = rows.Err()
	}()
	if err != nil {
		return nil, err
	}
	// Last-reply author: latest comment id per ticket in ONE query via
	// GROUP BY MAX(id) (replaces one ORDER BY id DESC LIMIT 1 per ticket).
	lrRows, err := r.db.Query(
		r.rebind(`SELECT ticket_id, author_id, created_at FROM ticket_comments WHERE id IN (SELECT MAX(id) FROM ticket_comments WHERE ticket_id IN (`+holders+`) GROUP BY ticket_id)`),
		args...)
	if err != nil {
		return nil, err
	}
	func() {
		defer lrRows.Close()
		for lrRows.Next() {
			var tid, author int64
			var at sql.NullString
			if serr := lrRows.Scan(&tid, &author, &at); serr != nil {
				err = serr
				return
			}
			if idx, ok := idIdx[tid]; ok {
				v := author
				tickets[idx].LastReplyBy = &v
				if at.Valid && at.String != "" {
					if tm := parseTicketTime(at.String); !tm.IsZero() {
						tickets[idx].LastReplyAt = &tm
					}
				}
			}
		}
		err = lrRows.Err()
	}()
	if err != nil {
		return nil, err
	}
	// SLA sidecar (065): a missing table (pre-065 databases) reads back as
	// zero state; any other failure is propagated.
	slaRows, err := r.db.Query(
		r.rebind(`SELECT ticket_id, first_response_at, sla_breached, escalated, escalated_at FROM ticket_sla WHERE ticket_id IN (`+holders+`)`),
		args...)
	if err != nil {
		if isMissingTableErr(err) {
			return tickets, nil
		}
		return nil, err
	}
	func() {
		defer slaRows.Close()
		for slaRows.Next() {
			var tid int64
			var firstResp, escAt sql.NullString
			var breached, escalated sql.NullInt64
			if serr := slaRows.Scan(&tid, &firstResp, &breached, &escalated, &escAt); serr != nil {
				err = serr
				return
			}
			if idx, ok := idIdx[tid]; ok {
				if firstResp.Valid && firstResp.String != "" {
					if tm := parseTicketTime(firstResp.String); !tm.IsZero() {
						tickets[idx].FirstResponseAt = &tm
					}
				}
				tickets[idx].SLABreached = breached.Valid && breached.Int64 != 0
				tickets[idx].Escalated = escalated.Valid && escalated.Int64 != 0
				if escAt.Valid && escAt.String != "" {
					if tm := parseTicketTime(escAt.String); !tm.IsZero() {
						tickets[idx].EscalatedAt = &tm
					}
				}
			}
		}
		err = slaRows.Err()
	}()
	if err != nil {
		return nil, err
	}
	return tickets, nil
}

func (r *TicketRepository) List(filterCategory, filterPriority, filterStatus, search string, mineOnly bool, uid int64, limit, offset int, isStaff bool) ([]models.Ticket, int, error) {
	where := []string{"1=1"}
	args := []any{}
	if filterCategory != "" {
		where = append(where, "t.category = ?")
		args = append(args, filterCategory)
	}
	if filterPriority != "" {
		where = append(where, "t.priority = ?")
		args = append(args, filterPriority)
	}
	if filterStatus != "" {
		where = append(where, "t.status = ?")
		args = append(args, filterStatus)
	}
	if search != "" {
		where = append(where, "(t.subject LIKE ? OR t.description LIKE ? OR t.ticket_no LIKE ?)")
		like := "%" + search + "%"
		args = append(args, like, like, like)
	}
	if mineOnly {
		where = append(where, "(t.created_by = ? OR t.assigned_to = ?)")
		args = append(args, uid, uid)
	} else if !isStaff {
		// non-staff sees only own tickets
		where = append(where, "(t.created_by = ? OR t.assigned_to = ?)")
		args = append(args, uid, uid)
	}
	whereClause := strings.Join(where, " AND ")
	// Count — early return on 0 avoids modernc's phantom all-NULL row on empty result
	var total int
	if err := r.db.QueryRow(r.rebind(`SELECT COUNT(*) FROM tickets t WHERE `+whereClause), args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []models.Ticket{}, 0, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	query := `SELECT ` + ticketColumns + ` FROM tickets t WHERE ` + whereClause + ` ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)
	rows, err := r.db.Query(r.rebind(query), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []models.Ticket{}
	for rows.Next() {
		tk, err := scanTicket(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *tk)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	enriched, err := r.enrichTickets(out)
	if err != nil {
		return nil, 0, err
	}
	return enriched, total, nil
}

func (r *TicketRepository) Get(id int64) (*models.Ticket, error) {
	row := r.db.QueryRow(r.rebind(`SELECT `+ticketColumns+` FROM tickets t WHERE t.id = ?`), id)
	tk, err := scanTicket(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("ticket not found")
		}
		return nil, err
	}
	tmp := []models.Ticket{*tk}
	enriched, err := r.enrichTickets(tmp)
	if err != nil {
		return nil, err
	}
	return &enriched[0], nil
}

func (r *TicketRepository) GetByTicketNo(no string) (*models.Ticket, error) {
	row := r.db.QueryRow(r.rebind(`SELECT `+ticketColumns+` FROM tickets t WHERE t.ticket_no = ?`), no)
	tk, err := scanTicket(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("ticket not found")
		}
		return nil, err
	}
	tmp := []models.Ticket{*tk}
	enriched, err := r.enrichTickets(tmp)
	if err != nil {
		return nil, err
	}
	return &enriched[0], nil
}

type CreateTicketInput struct {
	Subject     string
	Description string
	Category    string
	Priority    string
	CreatedBy   int64
	AssignedTo  *int64
	DueAt       *time.Time
	Tags        string
}

func (r *TicketRepository) Create(in CreateTicketInput) (*models.Ticket, error) {
	if strings.TrimSpace(in.Subject) == "" {
		return nil, fmt.Errorf("subject is required")
	}
	if in.Category == "" {
		in.Category = "general"
	}
	if in.Priority == "" {
		in.Priority = "medium"
	}
	if !models.ValidTicketCategories[in.Category] {
		return nil, fmt.Errorf("invalid category")
	}
	if !models.ValidTicketPriorities[in.Priority] {
		return nil, fmt.Errorf("invalid priority")
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	tags := in.Tags
	if tags == "" {
		tags = "[]"
	}
	// Generate ticket_no: TKT-<zero-padded id>. Insert first with placeholder then update.
	// Use transaction
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	// modernc.org/sqlite rejects Go nil as a driver.Value, so nullable
	// columns are handled via literal SQL NULL when not set (mirrors
	// activity_repo.Create's pattern) instead of binding a nil.
	// execInsertGetIDTx resolves the new id portably: INSERT...RETURNING
	// on Postgres (pgx has no LastInsertId), Exec+LastInsertId elsewhere.
	var id int64
	if in.AssignedTo == nil && in.DueAt == nil {
		id, err = r.execInsertGetIDTx(tx,
			`INSERT INTO tickets (ticket_no, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, closed_at, due_at, tags)
			 VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?, NULL, NULL, ?)`,
			"TMP",
			in.Subject, in.Description, in.Category, in.Priority,
			in.CreatedBy,
			now, now,
			tags,
		)
	} else if in.AssignedTo != nil && in.DueAt == nil {
		id, err = r.execInsertGetIDTx(tx,
			`INSERT INTO tickets (ticket_no, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, closed_at, due_at, tags)
			 VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL, NULL, ?)`,
			"TMP",
			in.Subject, in.Description, in.Category, in.Priority,
			in.CreatedBy, *in.AssignedTo,
			now, now,
			tags,
		)
	} else if in.AssignedTo == nil && in.DueAt != nil {
		dueStr := in.DueAt.UTC().Format("2006-01-02 15:04:05")
		id, err = r.execInsertGetIDTx(tx,
			`INSERT INTO tickets (ticket_no, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, closed_at, due_at, tags)
			 VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?, NULL, ?, ?)`,
			"TMP",
			in.Subject, in.Description, in.Category, in.Priority,
			in.CreatedBy,
			now, now,
			dueStr,
			tags,
		)
	} else {
		dueStr := in.DueAt.UTC().Format("2006-01-02 15:04:05")
		id, err = r.execInsertGetIDTx(tx,
			`INSERT INTO tickets (ticket_no, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, closed_at, due_at, tags)
			 VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL, ?, ?)`,
			"TMP",
			in.Subject, in.Description, in.Category, in.Priority,
			in.CreatedBy, *in.AssignedTo,
			now, now,
			dueStr,
			tags,
		)
	}
	if err != nil {
		return nil, err
	}
	ticketNo := fmt.Sprintf("TKT-%06d", id)
	if _, err := tx.Exec(r.rebind(`UPDATE tickets SET ticket_no = ? WHERE id = ?`), ticketNo, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.Get(id)
}

type UpdateTicketInput struct {
	Subject     *string
	Description *string
	Category    *string
	Priority    *string
	Status      *string
	AssignedTo  *int64
	AssignedSet bool // true means assign/unassign intention explicit
	DueAt       *time.Time
	DueSet      bool
	Tags        *string
}

func (r *TicketRepository) Update(id int64, in UpdateTicketInput) (*models.Ticket, error) {
	existing, err := r.Get(id)
	if err != nil {
		return nil, err
	}
	subject := existing.Subject
	if in.Subject != nil {
		subject = strings.TrimSpace(*in.Subject)
		if subject == "" {
			return nil, fmt.Errorf("subject cannot be empty")
		}
	}
	description := existing.Description
	if in.Description != nil {
		description = *in.Description
	}
	category := existing.Category
	if in.Category != nil {
		category = strings.TrimSpace(*in.Category)
		if category == "" {
			category = "general"
		}
		if !models.ValidTicketCategories[category] {
			return nil, fmt.Errorf("invalid category")
		}
	}
	priority := existing.Priority
	if in.Priority != nil {
		priority = strings.TrimSpace(*in.Priority)
		if !models.ValidTicketPriorities[priority] {
			return nil, fmt.Errorf("invalid priority")
		}
	}
	status := existing.Status
	if in.Status != nil {
		status = strings.TrimSpace(*in.Status)
		if !models.ValidTicketStatuses[status] {
			return nil, fmt.Errorf("invalid status")
		}
	}
	tags := existing.Tags
	if in.Tags != nil {
		tags = *in.Tags
		if tags == "" {
			tags = "[]"
		}
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	// Build nullable assignments as literal NULL when not set to avoid
	// passing Go nil / sql.Null* to modernc which rejects them.
	var closedVal *string
	if status == "closed" || status == "resolved" {
		if existing.ClosedAt == nil {
			closedVal = &now
		} else {
			s := existing.ClosedAt.UTC().Format("2006-01-02 15:04:05")
			closedVal = &s
		}
	}
	var assignedVal *int64
	if in.AssignedSet {
		assignedVal = in.AssignedTo
	} else {
		assignedVal = existing.AssignedTo
	}
	var dueVal *string
	if in.DueSet {
		if in.DueAt != nil {
			s := in.DueAt.UTC().Format("2006-01-02 15:04:05")
			dueVal = &s
		} else {
			dueVal = nil
		}
	} else if existing.DueAt != nil {
		s := existing.DueAt.UTC().Format("2006-01-02 15:04:05")
		dueVal = &s
	}

	// Dynamic query to avoid binding NULL via driver
	assignedSQL := "assigned_to = NULL"
	closedSQL := "closed_at = NULL"
	dueSQL := "due_at = NULL"
	args := []any{subject, description, category, priority, status}
	if assignedVal != nil {
		assignedSQL = "assigned_to = ?"
		args = append(args, *assignedVal)
	}
	args = append(args, now)
	if closedVal != nil {
		closedSQL = "closed_at = ?"
		args = append(args, *closedVal)
	}
	if dueVal != nil {
		dueSQL = "due_at = ?"
		args = append(args, *dueVal)
	}
	args = append(args, tags, id)
	query := fmt.Sprintf(r.rebind(`UPDATE tickets SET subject = ?, description = ?, category = ?, priority = ?, status = ?, %s, updated_at = ?, %s, %s, tags = ? WHERE id = ?`),
		assignedSQL, closedSQL, dueSQL)
	_, err = r.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}
	return r.Get(id)
}

func (r *TicketRepository) Delete(id int64) error {
	res, err := r.db.Exec(r.rebind(`DELETE FROM tickets WHERE id = ?`), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("ticket not found")
	}
	return nil
}

func (r *TicketRepository) Stats(uid int64, isStaff bool) (*models.TicketStats, error) {
	s := &models.TicketStats{}
	// total depends on visibility: staff sees all, non-staff sees only own
	var where string
	var args []any
	if isStaff {
		where = "1=1"
	} else {
		where = "(created_by = ? OR assigned_to = ?)"
		args = append(args, uid, uid)
	}
	// total
	_ = r.db.QueryRow(r.rebind(`SELECT COUNT(*) FROM tickets WHERE `+where), args...).Scan(&s.Total)
	// per status
	statusMap := map[string]*int{
		"open":        &s.Open,
		"pending":     &s.Pending,
		"in_progress": &s.InProgress,
		"resolved":    &s.Resolved,
		"closed":      &s.Closed,
	}
	for k, ptr := range statusMap {
		q := r.rebind(`SELECT COUNT(*) FROM tickets WHERE status = ? AND ` + where)
		a := append([]any{k}, args...)
		_ = r.db.QueryRow(q, a...).Scan(ptr)
	}
	// unassigned (only meaningful for staff view, but compute anyway with same where)
	qUn := r.rebind(`SELECT COUNT(*) FROM tickets WHERE assigned_to IS NULL AND ` + where)
	_ = r.db.QueryRow(qUn, args...).Scan(&s.Unassigned)
	// mine: tickets created by or assigned to me (even for staff, show personal count)
	_ = r.db.QueryRow(r.rebind(`SELECT COUNT(*) FROM tickets WHERE (created_by = ? OR assigned_to = ?)`), uid, uid).Scan(&s.Mine)
	// SLA (065): breached among the visible set + compliant share. The
	// sidecar table may not exist on pre-065 test DBs — any error reads
	// back as zero state, never a stats failure.
	_ = r.db.QueryRow(r.rebind(`SELECT COUNT(*) FROM ticket_sla WHERE sla_breached = 1 AND ticket_id IN (SELECT id FROM tickets WHERE `+where+`)`), args...).Scan(&s.Breached)
	if s.Total > 0 {
		s.SLAPct = float64(s.Total-s.Breached) * 100 / float64(s.Total)
	} else {
		s.SLAPct = 100
	}
	return s, nil
}

// Comments

func (r *TicketRepository) ListComments(ticketID int64, includeInternal bool) ([]models.TicketComment, error) {
	where := "ticket_id = ?"
	args := []any{ticketID}
	if !includeInternal {
		where += " AND is_internal = 0"
	}
	rows, err := r.db.Query(
		r.rebind(`SELECT id, ticket_id, author_id, body, is_internal, created_at, updated_at FROM ticket_comments WHERE `+where+` ORDER BY created_at ASC, id ASC`),
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.TicketComment{}
	for rows.Next() {
		var c models.TicketComment
		var body, created, updated sql.NullString
		var isInternal int
		if err := rows.Scan(&c.ID, &c.TicketID, &c.AuthorID, &body, &isInternal, &created, &updated); err != nil {
			return nil, err
		}
		c.Body = body.String
		c.IsInternal = isInternal != 0
		c.CreatedAt = parseTicketTime(created.String)
		c.UpdatedAt = parseTicketTime(updated.String)
		var name, displayName, accentColor, avatarSymbol sql.NullString
		var avatarMime, avatarFilename sql.NullString
		_ = r.db.QueryRow(r.rebind(`SELECT username, display_name, accent_color, avatar_symbol, avatar_mime, avatar_filename FROM users WHERE id = ?`), c.AuthorID).Scan(&name, &displayName, &accentColor, &avatarSymbol, &avatarMime, &avatarFilename)
		c.AuthorName = name.String
		c.AuthorDisplayName = displayName.String
		c.AuthorAccentColor = accentColor.String
		c.AuthorAvatarSymbol = avatarSymbol.String
		if avatarMime.Valid && avatarFilename.Valid && avatarMime.String != "" && avatarFilename.String != "" {
			c.AuthorHasAvatar = true
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *TicketRepository) AddComment(ticketID, authorID int64, body string, isInternal bool) (*models.TicketComment, error) {
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("comment body is required")
	}
	if len(body) > 10000 {
		return nil, fmt.Errorf("comment too long (max 10000 chars)")
	}
	// verify ticket exists
	var exists int
	if err := r.db.QueryRow(r.rebind(`SELECT COUNT(*) FROM tickets WHERE id = ?`), ticketID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists == 0 {
		return nil, fmt.Errorf("ticket not found")
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	flag := 0
	if isInternal {
		flag = 1
	}
	id, err := r.execInsertGetID(
		`INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		ticketID, authorID, body, flag, now, now,
	)
	if err != nil {
		return nil, err
	}
	// bump ticket updated_at
	if _, err := r.db.Exec(r.rebind(`UPDATE tickets SET updated_at = ? WHERE id = ?`), now, ticketID); err != nil {
		return nil, err
	}
	return r.GetComment(id)
}

func (r *TicketRepository) GetComment(id int64) (*models.TicketComment, error) {
	var c models.TicketComment
	var body, created, updated sql.NullString
	var isInternal int
	err := r.db.QueryRow(r.rebind(`SELECT id, ticket_id, author_id, body, is_internal, created_at, updated_at FROM ticket_comments WHERE id = ?`), id).
		Scan(&c.ID, &c.TicketID, &c.AuthorID, &body, &isInternal, &created, &updated)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("comment not found")
		}
		return nil, err
	}
	c.Body = body.String
	c.IsInternal = isInternal != 0
	c.CreatedAt = parseTicketTime(created.String)
	c.UpdatedAt = parseTicketTime(updated.String)
	var name, displayName, accentColor, avatarSymbol sql.NullString
	var avatarMime, avatarFilename sql.NullString
	_ = r.db.QueryRow(r.rebind(`SELECT username, display_name, accent_color, avatar_symbol, avatar_mime, avatar_filename FROM users WHERE id = ?`), c.AuthorID).Scan(&name, &displayName, &accentColor, &avatarSymbol, &avatarMime, &avatarFilename)
	c.AuthorName = name.String
	c.AuthorDisplayName = displayName.String
	c.AuthorAccentColor = accentColor.String
	c.AuthorAvatarSymbol = avatarSymbol.String
	if avatarMime.Valid && avatarFilename.Valid && avatarMime.String != "" && avatarFilename.String != "" {
		c.AuthorHasAvatar = true
	}
	return &c, nil
}

func (r *TicketRepository) DeleteComment(commentID, ticketID int64) error {
	r2, err := r.db.Exec(r.rebind(`DELETE FROM ticket_comments WHERE id = ? AND ticket_id = ?`), commentID, ticketID)
	if err != nil {
		return err
	}
	if n, _ := r2.RowsAffected(); n == 0 {
		return fmt.Errorf("comment not found")
	}
	return nil
}

func (r *TicketRepository) UpdateComment(commentID, ticketID int64, body string) (*models.TicketComment, error) {
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("body is required")
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(r.rebind(`UPDATE ticket_comments SET body = ?, updated_at = ? WHERE id = ? AND ticket_id = ?`), body, now, commentID, ticketID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, fmt.Errorf("comment not found")
	}
	return r.GetComment(commentID)
}

// AssignableUser is the assign-dropdown row. JSON keys stay lowercase to
// match every other panel API (id/username) — the frontend still accepts
// the legacy uppercase ID/Username shape for backward compatibility.
type AssignableUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

func (r *TicketRepository) ListUsersForAssign() ([]AssignableUser, error) {
	rows, err := r.db.Query(`SELECT id, username FROM users ORDER BY username ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AssignableUser{}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out = append(out, AssignableUser{ID: id, Username: name})
	}
	return out, rows.Err()
}

// Time parsing helper mirrors template repo but shared
func parseSQLiteTicketTime(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

var _ = strconv.Itoa
