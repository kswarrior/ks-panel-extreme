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
	// SLA sidecar (065, nil when no state yet).
	FirstResponseAt *time.Time `json:"first_response_at,omitempty"`
	SLABreached     bool       `json:"sla_breached,omitempty"`
	Escalated       bool       `json:"escalated,omitempty"`
	EscalatedAt     *time.Time `json:"escalated_at,omitempty"`
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
	// SLA (065): breached counts tickets past due_at while still open;
	// sla_pct is the share of visible tickets NOT breached (0-100).
	Breached int     `json:"breached"`
	SLAPct   float64 `json:"sla_pct"`
}

// TicketSLA is the 065 sidecar row tracking first response + breach +
// auto-escalation for one ticket. Absent (nil) means "no SLA state yet".
type TicketSLA struct {
	TicketID        int64      `json:"ticket_id"`
	FirstResponseAt *time.Time `json:"first_response_at,omitempty"`
	SLABreached     bool       `json:"sla_breached"`
	Escalated       bool       `json:"escalated"`
	EscalatedAt     *time.Time `json:"escalated_at,omitempty"`
}

// TicketAttachment is one uploaded file on a ticket. Bytes live under
// <DataDir>/ticket_attachments/<ticket_id>/; this struct is the metadata
// row. CommentID is nil for ticket-level uploads (TicketDetail) and set
// for chat-message uploads (TicketChat).
type TicketAttachment struct {
	ID         int64     `json:"id"`
	TicketID   int64     `json:"ticket_id"`
	CommentID  *int64    `json:"comment_id,omitempty"`
	FileName   string    `json:"file_name"`
	Mime       string    `json:"mime"`
	SizeBytes  int64     `json:"size_bytes"`
	SHA256     string    `json:"sha256"`
	UploadedBy int64     `json:"uploaded_by"`
	CreatedAt  time.Time `json:"created_at"`
}

// MaxTicketAttachmentBytes caps a single attachment upload (25 MiB). The
// router's DynamicMaxBodySize lift for /api/tickets/*/attachments sits
// slightly above this so the handler — not the middleware — reports the
// friendly 413.
const MaxTicketAttachmentBytes = 25 << 20

// ValidTicketAttachmentMIMEs is the upload allowlist: images (inline
// thumbnails) + pdf (inline preview) + zip (archives) + plain logs.
// The handler additionally sniffs the first 512 bytes and rejects a file
// whose detected type is not in the same family as the claimed extension.
var ValidTicketAttachmentMIMEs = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/gif": true,
	"image/webp": true, "image/svg+xml": true,
	"application/pdf": true,
	"application/zip": true, "application/x-zip-compressed": true,
	"text/plain": true, "text/x-log": true,
}

// TicketSLAPolicy is the per-category SLA: how fast staff must first reply
// and how fast the ticket must resolve.
type TicketSLAPolicy struct {
	FirstResponseMins int `json:"first_response_mins"`
	ResolveHours      int `json:"resolve_hours"`
}

// DefaultTicketSLAConfig mirrors the 065 KV seed so a missing/empty row
// still yields sane behaviour.
func DefaultTicketSLAConfig() map[string]TicketSLAPolicy {
	return map[string]TicketSLAPolicy{
		"general":   {FirstResponseMins: 60, ResolveHours: 24},
		"billing":   {FirstResponseMins: 120, ResolveHours: 48},
		"technical": {FirstResponseMins: 30, ResolveHours: 12},
		"feature":   {FirstResponseMins: 240, ResolveHours: 168},
		"bug":       {FirstResponseMins: 60, ResolveHours: 24},
		"abuse":     {FirstResponseMins: 30, ResolveHours: 8},
		"other":     {FirstResponseMins: 120, ResolveHours: 48},
	}
}

// EscalatedPriority returns the next priority step up for SLA
// auto-escalation. Critical stays critical (already top).
func EscalatedPriority(p string) string {
	switch p {
	case "low":
		return "medium"
	case "medium":
		return "high"
	case "high":
		return "urgent"
	case "urgent", "critical":
		return "critical"
	default:
		return "high"
	}
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
