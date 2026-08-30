package models

import "time"

// NotificationPriority is the urgency of a notification.
type NotificationPriority string

const (
	NotificationPriorityLow      NotificationPriority = "low"
	NotificationPriorityNormal   NotificationPriority = "normal"
	NotificationPriorityHigh     NotificationPriority = "high"
	NotificationPriorityUrgent   NotificationPriority = "urgent"
	NotificationPriorityCritical NotificationPriority = "critical"
)

// NotificationCategory groups notifications the way ActivityCategory does.
type NotificationCategory string

const (
	NotificationCategorySystem      NotificationCategory = "system"
	NotificationCategoryUser        NotificationCategory = "user"
	NotificationCategoryRole        NotificationCategory = "role"
	NotificationCategoryNode        NotificationCategory = "node"
	NotificationCategoryTemplate    NotificationCategory = "template"
	NotificationCategoryInstance    NotificationCategory = "instance"
	NotificationCategoryAPIKey      NotificationCategory = "api_key"
	NotificationCategoryAuth        NotificationCategory = "auth"
	NotificationCategoryMod         NotificationCategory = "mod"
	NotificationCategoryApplication NotificationCategory = "application"
	NotificationCategorySecurity    NotificationCategory = "security"
	NotificationCategoryTheme       NotificationCategory = "theme"
	NotificationCategoryUpdate      NotificationCategory = "update"
	NotificationCategoryGeneral     NotificationCategory = "general"
)

// AllNotificationCategories is the whitelist used for validation server-side.
var AllNotificationCategories = []NotificationCategory{
	NotificationCategorySystem,
	NotificationCategoryUser,
	NotificationCategoryRole,
	NotificationCategoryNode,
	NotificationCategoryTemplate,
	NotificationCategoryInstance,
	NotificationCategoryAPIKey,
	NotificationCategoryAuth,
	NotificationCategoryMod,
	NotificationCategoryApplication,
	NotificationCategorySecurity,
	NotificationCategoryTheme,
	NotificationCategoryUpdate,
	NotificationCategoryGeneral,
}

// AllNotificationPriorities is the whitelist used for validation.
var AllNotificationPriorities = []NotificationPriority{
	NotificationPriorityLow,
	NotificationPriorityNormal,
	NotificationPriorityHigh,
	NotificationPriorityUrgent,
	NotificationPriorityCritical,
}

// Notification is one inbox row for a specific user. Broadcasts are stored as
// one row per recipient (fan-out at create time) so per-user read/delete stays
// simple and concurrent — no "read by user X masks read by user Y" bug.
type Notification struct {
	ID         int64                `json:"id"`
	UserID     int64                `json:"user_id"`
	ActorID    *int64               `json:"actor_id,omitempty"`
	ActorName  string               `json:"actor_name"`
	Category   NotificationCategory `json:"category"`
	Priority   NotificationPriority `json:"priority"`
	Title      string               `json:"title"`
	Message    string               `json:"message"`
	Link       string               `json:"link,omitempty"`
	ActionLabel string              `json:"action_label,omitempty"`
	Metadata   string               `json:"metadata,omitempty"`
	IsRead     bool                 `json:"is_read"`
	IsBroadcast bool                `json:"is_broadcast"`
	CreatedAt  time.Time            `json:"created_at"`
	ReadAt     *time.Time           `json:"read_at,omitempty"`
}
