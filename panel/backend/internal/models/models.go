package models

import (
	"encoding/json"
	"time"
)

// SocialLink is one of the user-curated external links rendered on their
// profile (YouTube, GitHub, Hugging Face, ...). The "type" is a stable key
// the frontend maps to an icon; "label" is an optional display override and
// "url" is the absolute URL the user supplied.
type SocialLink struct {
	Type  string `json:"type"`
	Label string `json:"label,omitempty"`
	URL   string `json:"url"`
}

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	RoleID       int64     `json:"role_id"`
	CreatedAt    time.Time `json:"created_at"`

	// ── Suspension fields (migration 037) ─────────────────────────────────
	// Suspended indicates if the user is currently suspended (0 = no, 1 = yes).
	Suspended int `json:"suspended"`
	// SuspendedUntil is the timestamp when the suspension automatically expires.
	// NULL means suspended until admin manually unsuspends.
	SuspendedUntil *time.Time `json:"suspended_until,omitempty"`
	// SuspensionCount is the total number of times this user has been suspended.
	SuspensionCount int `json:"suspension_count"`
	// SuspensionHistory is a JSON array of suspension records for audit trail.
	SuspensionHistory string `json:"-"`

	// ── Discord-like profile fields (migration 018) ───────────────────────
	// Display name is the public-facing name shown instead of the bare
	// username; empty means "fall back to username".
	DisplayName string `json:"display_name"`
	Bio         string `json:"bio"`
	Pronouns    string `json:"pronouns"`
	// AccentColor is a CSS color string (e.g. "#5865F2"); the SPA tints the
	// profile header / avatar ring with it.
	AccentColor string `json:"accent_color"`
	// AvatarSymbol is a stable key for the built-in default avatar symbol
	// used when the user has not uploaded an avatar image (e.g. an emoji
	// or a short icon code).
	AvatarSymbol string `json:"avatar_symbol"`
	// AvatarMime + AvatarFilename describe the uploaded avatar image (if
	// any). The bytes live on disk under <datadir>/users/<id>/avatar.ext.
	// The filename is server-internal (never serialized over JSON); the SPA
	// streams the image through /api/users/<id>/avatar so it never needs it.
	AvatarMime     string `json:"avatar_mime,omitempty"`
	AvatarFilename string `json:"-"`
	// HasAvatar lets the JSON-layer flag "an avatar image is configured"
	// without leaking the on-disk filename to the client (the public
	// streaming endpoint is what the SPA points <img> at).
	HasAvatar bool `json:"has_avatar,omitempty"`
	// BannerMime + BannerFilename mirror the avatar fields for the banner.
	BannerMime     string `json:"banner_mime,omitempty"`
	BannerFilename string `json:"-"`
	HasBanner      bool   `json:"has_banner,omitempty"`
	// SocialLinks is the user-curated list of external links. Empty slice
	// (not null) is serialized when there are no entries so the frontend
	// can safely .map() over it.
	SocialLinks []SocialLink `json:"social_links"`
}

type Role struct {
	ID          int64    `json:"id"`
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Color       string   `json:"color"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	Permissions []string `json:"permissions,omitempty"`
	// OwnerID ties the role to the user that authored it. Migration 054
	// wires the ROLES_OWN / ROLES_ALL scope keys: an Own role only sees
	// rows where OwnerID = caller; All / umbrella keep the full list.
	// Zero = pre-054 row (orphan) — every role created before this
	// migration lands with NULL and stays visible only to admins.
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username so the admin Roles list
	// can render "alice" instead of just the integer id.
	OwnerName string `json:"owner_name,omitempty"`
	// AllowedAuthTypes is the admin-curated subset of the admin-enabled
	// authority providers that users WITH THIS ROLE are allowed to turn
	// on for their own login (see UserAuthorityConfig). nil/missing
	// (serialized as JSON null) === "unrestricted" — every admin-enabled
	// authority is offered; an explicit empty slice (serialized as `[]`)
	// === the role disallows every non-password authority; non-empty
	// === the curated subset. Kept on the role (not as a permission key)
	// because it's a per-role data attribute, not a CRUD verb. Persisted
	// as a per-role settings-KV JSON blob (migration-free) so repo reads
	// populate it transparently. The omitempty tag is intentionally
	// ABSENT so the null vs [] distinction round-trips over the wire.
	AllowedAuthTypes []string `json:"allowed_auth_types"`
}

type Permission struct {
	ID          int64  `json:"id"`
	Key         string `json:"key"`
	Description string `json:"description"`
}

// Application is an admin-curated bot / service template (Discord, WhatsApp,
// Telegram, Slack, custom). It lives in the catalog (admin-owned) and users
// install it as their own running instance via application_installations.
// The config_schema is a JSON array of field definitions the user must fill
// in; permissions mirrors the requested capabilities so clients can preview
// without a second query, but the canonical grant rows live in
// application_permissions (mirrors ModPermission).
type Application struct {
	ID           int64           `json:"id"`
	Name         string          `json:"name"`
	Slug         string          `json:"slug"`
	Category     string          `json:"category"`
	Version      string          `json:"version"`
	Description  string          `json:"description"`
	Icon         string          `json:"icon"`
	Color        string          `json:"color,omitempty"`
	Runtime      string          `json:"runtime"`
	Entrypoint   string          `json:"entrypoint"`
	ConfigSchema json.RawMessage `json:"config_schema"`
	Files        json.RawMessage `json:"files"` // [{path,content}] staged onto the run target
	// Env holds saved KEY=VALUE defaults (JSON object) merged into every
	// Run's environment under the per-run overrides.
	Env         json.RawMessage `json:"env"`
	Permissions json.RawMessage `json:"permissions"` // []PermissionReq for preview
	Active      bool            `json:"active"`
	UploadedBy  *int64          `json:"uploaded_by,omitempty"`
	// OwnerID ties the application to the user that uploaded it.
	// Migration 054 wires the APPLICATIONS_OWN / APPLICATIONS_ALL scope
	// keys: an Own role only sees rows where OwnerID = caller; All /
	// umbrella keep the full catalog. Zero = pre-054 row (orphan).
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username so the admin Applications
	// list can render "alice" instead of just the integer id.
	OwnerName string `json:"owner_name,omitempty"`
	Source      string          `json:"source"`
	SourceURL   string          `json:"source_url,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ApplicationPermission is one capability an application declares it needs
// (mirrors ModPermission). The admin must explicitly approve each before the
// application can be activated.
type ApplicationPermission struct {
	ID            int64  `json:"id"`
	ApplicationID int64  `json:"application_id"`
	Capability    string `json:"capability"`
	AccessLevel   string `json:"access_level"`
	Granted       bool   `json:"granted"`
}

// ApplicationInstallation is one user-facing bot instance. The user fills in
// config_values (secrets + plain settings), the panel stores them encrypted
// for secret fields, and the runtime updates status / last_error.
type ApplicationInstallation struct {
	ID            int64     `json:"id"`
	ApplicationID int64     `json:"application_id"`
	OwnerID       int64     `json:"owner_id"`
	Name          string    `json:"name"`
	ConfigValues  string    `json:"config_values"` // JSON: {key: value} — secrets encrypted at rest
	Status        string    `json:"status"`        // running | stopped | error
	LastError     string    `json:"last_error"`
	NodeID        int64     `json:"node_id"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ApplicationRun is one execution of an application's script. Target is
// "node" (a registered edge) or "panel" (the panel host: via its local node
// when one exists, otherwise by direct shell from the panel process).
// ExecMode is "host" (target filesystem) or a driver kind (docker / lxd /
// kvm / multipass) in which case Workload names the container/VM to exec
// inside. Output/ErrorOutput carry the captured stdout/stderr.
type ApplicationRun struct {
	ID            int64     `json:"id"`
	ApplicationID int64     `json:"application_id"`
	TriggeredBy   *int64    `json:"triggered_by,omitempty"`
	Target        string    `json:"target"`
	NodeID        int64     `json:"node_id"`
	NodeName      string    `json:"node_name"`
	ExecMode      string    `json:"exec_mode"`
	Workload      string    `json:"workload"`
	Status        string    `json:"status"` // running | succeeded | failed | error
	ExitCode      int       `json:"exit_code"`
	Output        string    `json:"output"`
	ErrorOutput   string    `json:"error_output"`
	Error         string    `json:"error"`
	TimeoutSec    int       `json:"timeout_sec"`
	CreatedAt     time.Time `json:"created_at"`
	EndedAt       time.Time `json:"ended_at,omitempty"`
}

// Application run lifecycle statuses.
const (
	AppRunStatusRunning   = "running"
	AppRunStatusSucceeded = "succeeded"
	AppRunStatusFailed    = "failed" // script ran, non-zero exit
	AppRunStatusError     = "error"  // could not start (dial, staging, …)
)

// Run target + exec-mode codes (wire values shared with the SPA).
const (
	AppRunTargetNode  = "node"
	AppRunTargetPanel = "panel"

	AppExecModeHost      = "host"
	AppExecModeDocker    = "docker"
	AppExecModeLXD       = "lxd"
	AppExecModeKVM       = "kvm"
	AppExecModeMultipass = "multipass"
)

// Application install provenance codes. Matches the `applications.source` column.
const (
	ApplicationSourceFile   = "file"
	ApplicationSourceURL    = "url"
	ApplicationSourceStudio = "studio"
	ApplicationSourceJSON   = "json"
)
