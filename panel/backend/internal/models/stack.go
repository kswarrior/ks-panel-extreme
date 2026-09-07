package models

import (
	"encoding/json"
	"regexp"
	"time"
)

// Stack is an admin-uploaded full-stack isolated app (dashboard OR tool).
// Like one Mod is one item in Mods, one Stack is one item in Stacks: own
// frontend (spa dist | simple pages) + optional backend sidecar + own nav +
// own data. Dashboard is only category='dashboard', never the system name.
//
// Manifest/spec are opaque pass-through JSON (same contract as mods/themes):
// the backend validates only the enumerated fields below + the requested
// capabilities; the rest is stored verbatim for the frontend.
type Stack struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Slug        string          `json:"slug"`
	Category    string          `json:"category"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	Icon        string          `json:"icon"`
	Color       string          `json:"color,omitempty"`
	Runtime     string          `json:"runtime"`
	Entrypoint  string          `json:"entrypoint,omitempty"`
	Manifest    json.RawMessage `json:"manifest"`
	Spec        json.RawMessage `json:"spec,omitempty"`
	// ThemeMode is panel|custom|none: inherit the panel route theme, ship an
	// own theme.css, or run unthemed. PageStyle is spa|simple: full dist
	// bundle in an iframe, or panel-rendered markdown/html/blocks pages.
	ThemeMode string `json:"theme_mode"`
	PageStyle string `json:"page_style"`
	Active    bool   `json:"active"`
	UploadedBy *int64 `json:"uploaded_by,omitempty"`
	// OwnerID ties the stack to the uploader (migration 071 wires
	// STACKS_OWN/STACKS_ALL: Own sees owner rows only, All/umbrella sees all).
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username joined from users.
	OwnerName string `json:"owner_name,omitempty"`
	// Source is file|url|studio|json|sample (install provenance).
	Source    string `json:"source"`
	SourceURL string `json:"source_url,omitempty"`
	// PackageSize is the .ksps byte size (0 = synthesize on download).
	PackageSize int64     `json:"package_size"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Stack install provenance codes. Matches the `stacks.source` default.
const (
	StackSourceFile   = "file"
	StackSourceURL    = "url"
	StackSourceStudio = "studio"
	StackSourceJSON   = "json"
	StackSourceSample = "sample"
)

// Stack runtimes, theme modes, page styles and categories.
const (
	StackRuntimeStatic = "static"
	StackRuntimeNodeJS = "nodejs"
	StackRuntimePython = "python"

	StackThemePanel  = "panel"
	StackThemeCustom = "custom"
	StackThemeNone   = "none"

	StackPageSPA    = "spa"
	StackPageSimple = "simple"
)

var stackSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// ValidStackSlug reports whether slug satisfies the panel's slug contract
// (same contract as mods: lowercase alphanumerics + hyphens, max 64).
func ValidStackSlug(slug string) bool {
	return stackSlugRe.MatchString(slug)
}

// ValidStackRuntime reports whether runtime is a known sidecar runtime.
func ValidStackRuntime(runtime string) bool {
	switch runtime {
	case StackRuntimeStatic, StackRuntimeNodeJS, StackRuntimePython:
		return true
	}
	return false
}

// ValidStackThemeMode reports whether mode is a known theme mode. Empty
// means "not declared" and normalises to panel at parse time.
func ValidStackThemeMode(mode string) bool {
	switch mode {
	case "", StackThemePanel, StackThemeCustom, StackThemeNone:
		return true
	}
	return false
}

// ValidStackPageStyle reports whether style is a known page style. Empty
// normalises to spa at parse time.
func ValidStackPageStyle(style string) bool {
	switch style {
	case "", StackPageSPA, StackPageSimple:
		return true
	}
	return false
}

// StackPermission is one capability a stack declared it needs. Activation is
// refused until every row has Granted == true (same gate as mods).
type StackPermission struct {
	ID          int64  `json:"id"`
	StackID     int64  `json:"stack_id"`
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
	Granted     bool   `json:"granted"`
}

// Stack capability codes. Deliberately NOT reusing the mod CapXxx codes:
// stacks reach capabilities through the sidecar proxy allow-list, so the
// namespace stays separate even where the English overlaps.
const (
	StackCapMetricsRead  = "metrics.read"
	StackCapInstancesRead = "instances.read"
	StackCapKVReadWrite  = "kv.read_write"
	StackCapDBReadWrite  = "db.read_write"
	StackCapOutboundHTTP = "outbound_http"
	StackCapNotify       = "notify"
)

// AllowedStackCapabilities returns the capability codes a stack manifest may
// request. The repo rejects any other string at insert time.
func AllowedStackCapabilities() []string {
	return []string{
		StackCapMetricsRead,
		StackCapInstancesRead,
		StackCapKVReadWrite,
		StackCapDBReadWrite,
		StackCapOutboundHTTP,
		StackCapNotify,
	}
}

// StackEnv is one saved environment KEY row (secret values stay masked).
type StackEnv struct {
	Key    string `json:"key"`
	Masked bool   `json:"masked,omitempty"`
	Secret bool   `json:"secret"`
}

// StackKV is one namespaced key/value row.
type StackKV struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}
