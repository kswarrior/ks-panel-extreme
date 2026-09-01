package models

import "time"

// Ticket is a support ticket opened by a user and triaged by staff.
// The panel remains the single source of truth for every ticket; no edge
// involvement is needed — the lifecycle (open → pending → in_progress →
// resolved → closed) is purely panel-side and driven by the operators
// and the reporter.
type Ticket struct {
	ID                  int64      `json:"id"`
	TicketNo            string     `json:"ticket_no"` // human-readable TKT-XXXXXX
	Subject             string     `json:"subject"`
	Description         string     `json:"description"`
	Category            string     `json:"category"` // general | billing | technical | feature | bug | abuse | other
	Priority            string     `json:"priority"` // low | medium | high | urgent | critical
	Status              string     `json:"status"`   // open | pending | in_progress | resolved | closed
	CreatedBy           int64      `json:"created_by"`
	CreatorName         string     `json:"creator_name,omitempty"`
	CreatorDisplayName  string     `json:"creator_display_name,omitempty"`
	CreatorAccentColor  string     `json:"creator_accent_color,omitempty"`
	CreatorAvatarSymbol string     `json:"creator_avatar_symbol,omitempty"`
	CreatorHasAvatar    bool       `json:"creator_has_avatar,omitempty"`
	CreatorEmail        string     `json:"creator_email,omitempty"`
	AssignedTo          *int64     `json:"assigned_to,omitempty"`
	AssigneeName        string     `json:"assignee_name,omitempty"`
	AssigneeDisplayName string     `json:"assignee_display_name,omitempty"`
	AssigneeAccentColor string     `json:"assignee_accent_color,omitempty"`
	AssigneeAvatarSymbol string    `json:"assignee_avatar_symbol,omitempty"`
	AssigneeHasAvatar   bool       `json:"assignee_has_avatar,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	ClosedAt            *time.Time `json:"closed_at,omitempty"`
	DueAt               *time.Time `json:"due_at,omitempty"`
	Tags                string     `json:"tags"` // JSON array string
	CommentCount        int        `json:"comment_count"`
	LastReplyAt         *time.Time `json:"last_reply_at,omitempty"`
	LastReplyBy         *int64     `json:"last_reply_by,omitempty"`
}

// TicketComment is one reply / internal note on a ticket.
// is_internal = 1 means the note is visible only to staff (TICKETS_EDIT holders).
type TicketComment struct {
	ID                 int64     `json:"id"`
	TicketID           int64     `json:"ticket_id"`
	AuthorID           int64     `json:"author_id"`
	AuthorName         string    `json:"author_name,omitempty"`
	AuthorDisplayName  string    `json:"author_display_name,omitempty"`
	AuthorAccentColor  string    `json:"author_accent_color,omitempty"`
	AuthorAvatarSymbol string    `json:"author_avatar_symbol,omitempty"`
	AuthorHasAvatar    bool      `json:"author_has_avatar,omitempty"`
	Body               string    `json:"body"`
	IsInternal         bool      `json:"is_internal"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// TicketStats aggregates counts for the stats dashboard.
type TicketStats struct {
	Total      int `json:"total"`
	Open       int `json:"open"`
	Pending    int `json:"pending"`
	InProgress int `json:"in_progress"`
	Resolved   int `json:"resolved"`
	Closed     int `json:"closed"`
	Unassigned int `json:"unassigned"`
	Mine       int `json:"mine"`
}

// Valid ticket enumerations — keep in sync with handler validation.
var (
	ValidTicketCategories = map[string]bool{
		"general": true, "billing": true, "technical": true, "feature": true,
		"bug": true, "abuse": true, "other": true,
	}
	ValidTicketPriorities = map[string]bool{
		"low": true, "medium": true, "high": true, "urgent": true, "critical": true,
	}
	ValidTicketStatuses = map[string]bool{
		"open": true, "pending": true, "in_progress": true, "resolved": true, "closed": true,
	}
)
