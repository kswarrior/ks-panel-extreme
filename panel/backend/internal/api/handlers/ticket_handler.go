package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

func canSeeInternal(con *sql.DB, uid int64) bool {
	perms, _ := repoPermissionsForUser(con, uid)
	for _, p := range perms {
		if p == "MANAGE_TICKETS" || p == "TICKETS_EDIT" {
			return true
		}
	}
	return false
}

func isTicketStaff(con *sql.DB, uid int64) bool {
	perms, _ := repoPermissionsForUser(con, uid)
	for _, p := range perms {
		if p == "MANAGE_TICKETS" {
			return true
		}
	}
	// Ownership scope: TICKETS_ALL also grants full visibility, mirroring the umbrella.
	if checker := permissions.NewChecker(con); checker != nil {
		if hasOwn, hasAll, _ := checker.HasScope(uid, permissions.TicketsOwnKey, permissions.TicketsAllKey, permissions.ManageTicketsKey); hasAll {
			_ = hasOwn
			return true
		}
	}
	return false
}

// ListTicketsHandler returns paginated tickets.
// Query params: category, priority, status, search, mine, limit, offset, include_internal (staff)
// Non-staff automatically sees only own tickets unless they hold MANAGE_TICKETS/TICKETS_VIEW.
func ListTicketsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)

	q := r.URL.Query()
	category := strings.TrimSpace(q.Get("category"))
	priority := strings.TrimSpace(q.Get("priority"))
	status := strings.TrimSpace(q.Get("status"))
	search := strings.TrimSpace(q.Get("search"))
	mineStr := q.Get("mine")
	mineOnly := mineStr == "1" || strings.EqualFold(mineStr, "true")
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	if category != "" && !models.ValidTicketCategories[category] {
		http.Error(w, "invalid category", http.StatusBadRequest)
		return
	}
	if priority != "" && !models.ValidTicketPriorities[priority] {
		http.Error(w, "invalid priority", http.StatusBadRequest)
		return
	}
	if status != "" && !models.ValidTicketStatuses[status] {
		http.Error(w, "invalid status", http.StatusBadRequest)
		return
	}

	isStaff := isTicketStaff(con, uid) // only MANAGE_TICKETS sees all; others see own even if they have VIEW
	tickets, total, err := repo.List(category, priority, status, search, mineOnly, uid, limit, offset, isStaff)
	if err != nil {
		log.Println("ListTickets error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if tickets == nil {
		tickets = []models.Ticket{}
	}
	writeJSON(w, map[string]any{
		"tickets": tickets,
		"total":   total,
	})
}

func GetTicketHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	tk, err := repo.Get(id)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	// Access check: only staff (MANAGE_TICKETS) can see any ticket; others only own
	if !isTicketStaff(con, uid) {
		if tk.CreatedBy != uid && (tk.AssignedTo == nil || *tk.AssignedTo != uid) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	// Load comments with appropriate visibility
	includeInternal := canSeeInternal(con, uid)
	comments, _ := repo.ListComments(id, includeInternal)
	if comments == nil {
		comments = []models.TicketComment{}
	}
	writeJSON(w, map[string]any{
		"ticket":   tk,
		"comments": comments,
	})
}

type createTicketRequest struct {
	Subject     string  `json:"subject"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	Priority    string  `json:"priority"`
	AssignedTo  *int64  `json:"assigned_to,omitempty"`
	DueAt       *string `json:"due_at,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

func CreateTicketHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req createTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req.Subject = strings.TrimSpace(req.Subject)
	if req.Subject == "" {
		http.Error(w, "subject is required", http.StatusBadRequest)
		return
	}
	if len(req.Subject) > 200 {
		http.Error(w, "subject must be 200 characters or fewer", http.StatusBadRequest)
		return
	}
	if len(req.Description) > 10000 {
		http.Error(w, "description must be 10000 characters or fewer", http.StatusBadRequest)
		return
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if !models.ValidTicketCategories[req.Category] {
		http.Error(w, "invalid category", http.StatusBadRequest)
		return
	}
	if req.Priority == "" {
		req.Priority = "medium"
	}
	if !models.ValidTicketPriorities[req.Priority] {
		http.Error(w, "invalid priority", http.StatusBadRequest)
		return
	}
	var dueAt *time.Time
	if req.DueAt != nil && strings.TrimSpace(*req.DueAt) != "" {
		if t, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.DueAt)); err == nil {
			dueAt = &t
		} else if t, err := time.Parse("2006-01-02 15:04:05", strings.TrimSpace(*req.DueAt)); err == nil {
			dueAt = &t
		} else if t, err := time.Parse("2006-01-02", strings.TrimSpace(*req.DueAt)); err == nil {
			dueAt = &t
		} else {
			http.Error(w, "invalid due_at (use RFC3339)", http.StatusBadRequest)
			return
		}
	}
	tagsJSON := "[]"
	if len(req.Tags) > 0 {
		if len(req.Tags) > 20 {
			http.Error(w, "too many tags (max 20)", http.StatusBadRequest)
			return
		}
		for _, t := range req.Tags {
			if len(t) > 30 {
				http.Error(w, "tag too long (max 30)", http.StatusBadRequest)
				return
			}
		}
		b, _ := json.Marshal(req.Tags)
		tagsJSON = string(b)
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	// Only staff can assign on create; non-staff assignment is ignored.
	if req.AssignedTo != nil {
		if !canSeeInternal(con, uid) {
			req.AssignedTo = nil
		} else {
			// validate user exists
			var cnt int
			_ = con.QueryRow(`SELECT COUNT(*) FROM users WHERE id = ?`, *req.AssignedTo).Scan(&cnt)
			if cnt == 0 {
				http.Error(w, "assigned user not found", http.StatusBadRequest)
				return
			}
		}
	}
	tk, err := repo.Create(repository.CreateTicketInput{
		Subject:     req.Subject,
		Description: req.Description,
		Category:    req.Category,
		Priority:    req.Priority,
		CreatedBy:   uid,
		AssignedTo:  req.AssignedTo,
		DueAt:       dueAt,
		Tags:        tagsJSON,
	})
	if err != nil {
		log.Println("CreateTicket error:", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "create",
		TargetID:    &tk.ID,
		TargetLabel: tk.TicketNo,
		Message:     fmt.Sprintf("opened ticket %s %q (priority=%s category=%s)", tk.TicketNo, tk.Subject, tk.Priority, tk.Category),
	})
	writeJSONStatus(w, http.StatusCreated, tk)
}

type updateTicketRequest struct {
	Subject     *string  `json:"subject,omitempty"`
	Description *string  `json:"description,omitempty"`
	Category    *string  `json:"category,omitempty"`
	Priority    *string  `json:"priority,omitempty"`
	Status      *string  `json:"status,omitempty"`
	AssignedTo  *int64   `json:"assigned_to"`
	AssignedSet bool     `json:"-"`
	DueAt       *string  `json:"due_at"`
	DueSet      bool     `json:"-"`
	Tags        *[]string `json:"tags,omitempty"`
}

func (u *updateTicketRequest) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	// subject: string or null (null = no change). Any other type is a 400.
	if v, ok := raw["subject"]; ok {
		if string(v) == "null" {
			u.Subject = nil
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("invalid subject")
			}
			u.Subject = &s
		}
	}
	if v, ok := raw["description"]; ok {
		if string(v) == "null" {
			s := ""
			u.Description = &s
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("invalid description")
			}
			u.Description = &s
		}
	}
	if v, ok := raw["category"]; ok {
		if string(v) == "null" {
			s := ""
			u.Category = &s
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("invalid category")
			}
			u.Category = &s
		}
	}
	if v, ok := raw["priority"]; ok {
		if string(v) == "null" {
			s := ""
			u.Priority = &s
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("invalid priority")
			}
			u.Priority = &s
		}
	}
	if v, ok := raw["status"]; ok {
		if string(v) == "null" {
			s := ""
			u.Status = &s
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("invalid status")
			}
			u.Status = &s
		}
	}
	if v, ok := raw["assigned_to"]; ok {
		u.AssignedSet = true
		if string(v) == "null" {
			u.AssignedTo = nil
		} else {
			var id int64
			if err := json.Unmarshal(v, &id); err != nil {
				return fmt.Errorf("invalid assigned_to")
			}
			u.AssignedTo = &id
		}
	}
	if v, ok := raw["due_at"]; ok {
		u.DueSet = true
		if string(v) == "null" || string(v) == `""` {
			u.DueAt = nil
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return fmt.Errorf("invalid due_at")
			}
			if strings.TrimSpace(s) == "" {
				u.DueAt = nil
			} else {
				u.DueAt = &s
			}
		}
	}
	if v, ok := raw["tags"]; ok {
		if string(v) == "null" {
			empty := []string{}
			u.Tags = &empty
		} else {
			var tags []string
			if err := json.Unmarshal(v, &tags); err != nil {
				return fmt.Errorf("invalid tags")
			}
			u.Tags = &tags
		}
	}
	return nil
}

func UpdateTicketHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	existing, err := repo.Get(id)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	// Permission: owner can edit subject/description/category/priority? But status/assign restricted to staff.
	// Simple rule: owner can edit own ticket's content unless closed; staff can edit everything.
	isOwner := existing.CreatedBy == uid
	isStaff := canSeeInternal(con, uid)
	if !isOwner && !isStaff {
		if existing.AssignedTo == nil || *existing.AssignedTo != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	var req updateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	// Validate and enforce policy: non-staff cannot change status to beyond pending/open or assign or priority beyond? Let's allow owner to update subject/desc/category but restrict status/assigned/priority change to staff.
	// If non-staff tries to set status/assigned/priority, reject.
	if !isStaff {
		if req.Status != nil {
			http.Error(w, "only staff can change status", http.StatusForbidden)
			return
		}
		if req.AssignedSet {
			http.Error(w, "only staff can assign tickets", http.StatusForbidden)
			return
		}
		if req.Priority != nil {
			// allow owner to change priority? Let's restrict to staff for elevated priorities
			// Owner can still change priority within low/medium
			if *req.Priority == "urgent" || *req.Priority == "critical" || *req.Priority == "high" {
				http.Error(w, "only staff can escalate priority", http.StatusForbidden)
				return
			}
		}
	}
	// Build repo input
	in := repository.UpdateTicketInput{}
	if req.Subject != nil {
		s := strings.TrimSpace(*req.Subject)
		if s == "" {
			http.Error(w, "subject cannot be empty", http.StatusBadRequest)
			return
		}
		if len(s) > 200 {
			http.Error(w, "subject too long", http.StatusBadRequest)
			return
		}
		in.Subject = &s
	}
	if req.Description != nil {
		if len(*req.Description) > 10000 {
			http.Error(w, "description too long", http.StatusBadRequest)
			return
		}
		in.Description = req.Description
	}
	if req.Category != nil {
		in.Category = req.Category
	}
	if req.Priority != nil {
		in.Priority = req.Priority
	}
	if req.Status != nil {
		in.Status = req.Status
	}
	if req.AssignedSet {
		in.AssignedSet = true
		in.AssignedTo = req.AssignedTo
		if req.AssignedTo != nil {
			var cnt int
			_ = con.QueryRow(`SELECT COUNT(*) FROM users WHERE id = ?`, *req.AssignedTo).Scan(&cnt)
			if cnt == 0 {
				http.Error(w, "assigned user not found", http.StatusBadRequest)
				return
			}
		}
	}
	if req.DueSet {
		in.DueSet = true
		if req.DueAt != nil {
			if t, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.DueAt)); err == nil {
				in.DueAt = &t
			} else if t, err := time.Parse("2006-01-02 15:04:05", strings.TrimSpace(*req.DueAt)); err == nil {
				in.DueAt = &t
			} else if t, err := time.Parse("2006-01-02", strings.TrimSpace(*req.DueAt)); err == nil {
				in.DueAt = &t
			} else {
				http.Error(w, "invalid due_at", http.StatusBadRequest)
				return
			}
		} else {
			in.DueAt = nil
		}
	}
	if req.Tags != nil {
		if len(*req.Tags) > 20 {
			http.Error(w, "too many tags", http.StatusBadRequest)
			return
		}
		b, _ := json.Marshal(*req.Tags)
		s := string(b)
		in.Tags = &s
	}
	updated, err := repo.Update(id, in)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: updated.TicketNo,
		Message:     fmt.Sprintf("updated ticket %s", updated.TicketNo),
	})
	writeJSON(w, updated)
}

func DeleteTicketHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	tk, err := repo.Get(id)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	// Only staff or owner can delete? Restrict delete to staff + owner when open. For safety, allow staff OR owner if ticket still open.
	isStaff := canSeeInternal(con, uid)
	isOwner := tk.CreatedBy == uid
	if !isStaff && !isOwner {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if !isStaff && tk.Status == "closed" {
		http.Error(w, "cannot delete closed ticket", http.StatusForbidden)
		return
	}
	if err := repo.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: tk.TicketNo,
		Message:     fmt.Sprintf("deleted ticket %s %q", tk.TicketNo, tk.Subject),
	})
	w.WriteHeader(http.StatusNoContent)
}

func TicketStatsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	isStaff := isTicketStaff(con, uid)
	stats, err := repo.Stats(uid, isStaff)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, stats)
}

// Comments

type addCommentRequest struct {
	Body       string `json:"body"`
	IsInternal bool   `json:"is_internal"`
}

func AddTicketCommentHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req addCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		http.Error(w, "comment body is required", http.StatusBadRequest)
		return
	}
	if len(req.Body) > 10000 {
		http.Error(w, "comment too long", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	tk, err := repo.Get(id)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	// Access check: staff sees any, others only own/assigned
	if !isTicketStaff(con, uid) {
		if tk.CreatedBy != uid && (tk.AssignedTo == nil || *tk.AssignedTo != uid) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	if req.IsInternal && !canSeeInternal(con, uid) {
		http.Error(w, "only staff can post internal notes", http.StatusForbidden)
		return
	}
	if tk.Status == "closed" {
		http.Error(w, "cannot comment on closed ticket", http.StatusBadRequest)
		return
	}
	comment, err := repo.AddComment(id, uid, req.Body, req.IsInternal)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "comment",
		TargetID:    &id,
		TargetLabel: tk.TicketNo,
		Message:     fmt.Sprintf("replied to ticket %s", tk.TicketNo),
	})
	writeJSONStatus(w, http.StatusCreated, comment)
}

func ListTicketCommentsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	tk, err := repo.Get(id)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	if !isTicketStaff(con, uid) {
		if tk.CreatedBy != uid && (tk.AssignedTo == nil || *tk.AssignedTo != uid) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	includeInternal := canSeeInternal(con, uid)
	comments, err := repo.ListComments(id, includeInternal)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if comments == nil {
		comments = []models.TicketComment{}
	}
	writeJSON(w, comments)
}

func DeleteTicketCommentHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	tid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid ticket id", http.StatusBadRequest)
		return
	}
	cid, err := strconv.ParseInt(chi.URLParam(r, "commentId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid comment id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	tk, err := repo.Get(tid)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	comment, err := repo.GetComment(cid)
	if err != nil {
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}
	if comment.TicketID != tid {
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}
	// Only author or staff can delete
	isStaff := canSeeInternal(con, uid)
	if comment.AuthorID != uid && !isStaff {
		// also allow ticket owner to delete? no, restrict.
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	// If ticket is closed, only staff can delete comments
	if tk.Status == "closed" && !isStaff {
		http.Error(w, "cannot delete comment on closed ticket", http.StatusBadRequest)
		return
	}
	if err := repo.DeleteComment(cid, tid); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "delete_comment",
		TargetID:    &tid,
		TargetLabel: tk.TicketNo,
		Message:     fmt.Sprintf("deleted comment on ticket %s", tk.TicketNo),
	})
	w.WriteHeader(http.StatusNoContent)
}

// AssignTicketHandler sets assigned_to explicitly (staff only).
func AssignTicketHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		AssignedTo *int64 `json:"assigned_to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if !canSeeInternal(con, uid) {
		http.Error(w, "only staff can assign tickets", http.StatusForbidden)
		return
	}
	repo := repository.NewTicketRepository(con)
	if req.AssignedTo != nil {
		var cnt int
		_ = con.QueryRow(`SELECT COUNT(*) FROM users WHERE id = ?`, *req.AssignedTo).Scan(&cnt)
		if cnt == 0 {
			http.Error(w, "assigned user not found", http.StatusBadRequest)
			return
		}
	}
	in := repository.UpdateTicketInput{
		AssignedSet: true,
		AssignedTo:  req.AssignedTo,
	}
	updated, err := repo.Update(id, in)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "assign",
		TargetID:    &id,
		TargetLabel: updated.TicketNo,
		Message:     fmt.Sprintf("assigned ticket %s", updated.TicketNo),
	})
	writeJSON(w, updated)
}

// ListUsersForAssign returns users for the assign dropdown (staff only).
// Non-staff callers get 403 so the endpoint cannot be used to enumerate accounts.
func ListUsersForAssignHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if !canSeeInternal(con, uid) {
		http.Error(w, "only staff can list assignable users", http.StatusForbidden)
		return
	}
	repo := repository.NewTicketRepository(con)
	users, err := repo.ListUsersForAssign()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, users)
}
