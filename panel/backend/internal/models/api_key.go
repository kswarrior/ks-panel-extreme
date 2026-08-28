package models

import "time"

type ApiKey struct {
	ID     int64 `json:"id"`
	UserID int64 `json:"user_id"`
	// OwnerName is the username of the key's owner. Populated only when the
	// key is loaded via the admin (all-keys) list; it's empty for per-user queries.
	OwnerName   string     `json:"owner_name,omitempty"`
	Name        string     `json:"name"`
	Prefix      string     `json:"prefix"`
	CreatedAt   time.Time  `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	Permissions []string   `json:"permissions"`
	// ExpiresAt is the optional absolute expiry of the key. nil/no-value
	// means the key never expires.
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	// RateLimit is the max number of requests allowed within the
	// RateWindowSeconds window. nil/no-value means no rate limit is
	// enforced.
	RateLimit *int64 `json:"rate_limit,omitempty"`
	// RateWindowSeconds is the size of the rate-limit window in seconds.
	// Defaults to 60 when a RateLimit is set; 0 is treated as 60.
	RateWindowSeconds int64 `json:"rate_window_seconds,omitempty"`
	// Active indicates whether the key is currently active. When false, the
	// key is soft-revoked — requests with this key will be rejected with 401.
	// This allows admins to disable a key without deleting it (audit trail).
	Active bool `json:"active"`
	// Description is a free-form note shown alongside the key in the admin list.
	Description string `json:"description,omitempty"`
	// DisplayName is the friendly label rendered in the UI instead of the machine name.
	DisplayName string `json:"display_name,omitempty"`
	// AccentColor is the optional CSS colour used to tint the key's badge in the admin list.
	AccentColor string `json:"accent_color,omitempty"`
}

// User struct already exists elsewhere – this file only adds the ApiKey model.
