package models

import "time"

// ActivityCategory is the broad bucket the Activity page groups by.
type ActivityCategory string

const (
	ActivityCategoryUser     ActivityCategory = "user"
	ActivityCategoryRole     ActivityCategory = "role"
	ActivityCategoryNode     ActivityCategory = "node"
	ActivityCategoryTemplate ActivityCategory = "template"
	ActivityCategoryInstance ActivityCategory = "instance"
	ActivityCategoryAPIKey   ActivityCategory = "api_key"
	ActivityCategorySettings ActivityCategory = "settings"
	ActivityCategoryAuth     ActivityCategory = "auth"
	ActivityCategorySystem   ActivityCategory = "system"
	ActivityCategoryMod      ActivityCategory = "mod"
	ActivityCategorySecret   ActivityCategory = "secret"
	ActivityCategoryAutomationCategory ActivityCategory = "automation"
	ActivityCategorySnapshot ActivityCategory = "snapshot"
	ActivityCategorySecurity ActivityCategory = "security"
)

// ActivityLog is one row of the admin audit timeline.
//
// UserID / UserIDValid model the "deleted user" case — a historically valid
// user_id whose users row is gone should still render the activity row, with
// the denormalised `Username` field carrying the label.
type ActivityLog struct {
	ID          int64            `json:"id"`
	UserID      *int64           `json:"user_id,omitempty"`
	Username    string           `json:"username"`
	Role        string           `json:"role"`
	Category    ActivityCategory `json:"category"`
	Action      string           `json:"action"`
	TargetID    *int64           `json:"target_id,omitempty"`
	TargetLabel string           `json:"target_label"`
	Message     string           `json:"message"`
	IPAddress   string           `json:"ip_address"`
	UserAgent   string           `json:"user_agent"`
	CreatedAt   time.Time        `json:"created_at"`
}
