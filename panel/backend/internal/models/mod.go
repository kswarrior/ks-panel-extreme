package models

import (
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Mod is an admin-uploaded add-on package that extends the panel. It can
// register pages, ship tools, expose integrations — anything the manifest's
// `spec` describes. A mod is SILENT until activated, and activation is gated by
// an explicit per-capability grant: see ModPermission.
//
// Manifest is the opaque JSON the mod ships (name/version/description/pages/
// permissionsRequested/...). The backend only inspects `permissionsRequested`
// at upload time (to seed the mod_permissions rows the admin must approve); the
// rest is stored verbatim so the frontend can lay the page out later without a
// schema change — same pass-through approach as themes.
type Mod struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Slug        string          `json:"slug"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	Manifest    json.RawMessage `json:"manifest"`
	Spec        json.RawMessage `json:"spec,omitempty"`
	Active      bool            `json:"active"`
	UploadedBy  *int64          `json:"uploaded_by,omitempty"`
	// OwnerID ties the mod to the user that uploaded it (the same value
	// that backs the upload audit row). Migration 054 wires the
	// MODS_OWN/MODS_ALL scope keys: an Own role only sees rows where
	// OwnerID = caller; All / umbrella keep the full catalog. Zero =
	// pre-054 row (orphan).
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username joined from users so the
	// admin mod list can render "alice" instead of just the integer id.
	OwnerName string `json:"owner_name,omitempty"`
	// EngineVersion records which Mod Engine the row targets. 1 == the static
	// v1 manifest system (no JS runtime). 2 == the event-driven Goja engine:
	// the manifest may carry `backendScript`, `slots`, `hooks`,
	// `permissionsDeclared`. Defaults to 1 for any manifest created before
	// migration 020 so v1 mods keep working unchanged.
	EngineVersion int `json:"engine_version"`
	// Source records where this mod came from: "file" (manifest upload),
	// "url" (manifest fetched from a URL), "studio" (authored in the
	// Mod Studio), or "json" (POST'd as a JSON body). Surfaced on the mod
	// card + audit timeline so the admin can see the install provenance.
	Source    string `json:"source"`
	SourceURL string `json:"source_url,omitempty"`
	// PackageSize is the byte size of the on-disk .kspm package zip stored
	// under <datadir>/mod-packages/<slug>.kspm. 0 means no package file was
	// stored (a Studio/URL/JSON install that never carried a zip); the
	// download handler synthesises a minimal .kspm from the manifest + spec
	// in that case so every mod stays downloadable. Surfaced on the mod
	// card as "package: N KB".
	PackageSize int64     `json:"package_size"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Mod install provenance codes. Matches the `mods.source` column default and
// the values the URL/studio handlers stamp on insert.
const (
	ModSourceFile   = "file"
	ModSourceURL    = "url"
	ModSourceStudio = "studio"
	ModSourceJSON   = "json"
	// ModSourceSample tags mods installed from the panel's built-in sample
	// catalog (GET/POST /api/mods/samples). Surfaced like every other source
	// so the admin can tell a test mod from a real install at a glance.
	ModSourceSample = "sample"
)

// modSlugRe is the server-side slug contract: lowercase alphanumerics and
// hyphens, 1-64 chars, starting with a letter/digit. It matches exactly what
// the frontend slugify() produces, so anything it rejects was hand-forged.
// The check lives here (not only in pkgstore.safeSlug) because the DB row +
// route params are consumed long before any filesystem path is derived.
var modSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// ValidModSlug reports whether slug satisfies the panel's slug contract. A
// hostile slug ("", "../x", "A B", 200 chars) must be rejected at insert time
// so it can never reach the asset routes or the package store.
func ValidModSlug(slug string) bool {
	return modSlugRe.MatchString(slug)
}

// ModPermission is one capability a mod declared it needs (from its manifest's
// `permissionsRequested[]`). The panel treats activation as unsafe until every
// row for the mod has Granted == true — the admin must explicitly approve each
// request. The access_level string echoes the level the mod asked for
// (read_only / read_write) so the activation modal can render "Database
// (read-only)" vs "Database (read+write)" distinctly.
//
// Capability is either a fixed CapXxx code (requested host capabilities) or a
// mod-namespaced custom permission ("<slug>:<key>") from the manifest's
// `permissionsDeclared[]` — the repo validates both at insert time so a mod
// can't smuggle an arbitrary string. Custom rows carry access_level "custom"
// so the grant UI can tell them apart; at runtime a script reads them through
// ks.permissions.has(key).
type ModPermission struct {
	ID          int64  `json:"id"`
	ModID       int64  `json:"mod_id"`
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
	Granted     bool   `json:"granted"`
}

// Capability codes the mod permission system understands. Keep these in sync
// with the frontend ModCapability catalogue (web/src/types/mod.ts).
const (
	CapDatabaseRead      = "db.read_only"
	CapDatabaseReadWrite = "db.read_write"
	CapTerminal          = "terminal"
	CapContainerControl  = "container.control"
	CapVMControl         = "vm.control"
	CapFilesystem        = "filesystem"
)

// AllowedCapabilties returns the well-known capability codes a mod is allowed
// to request. The repo rejects any other string so a malicious manifest can't
// mint a capability that maps to nothing on the admin side.
func AllowedCapabilties() []string {
	return []string{
		CapDatabaseRead,
		CapDatabaseReadWrite,
		CapTerminal,
		CapContainerControl,
		CapVMControl,
		CapFilesystem,
	}
}

// ---------------------------------------------------------------------------
// Mod Engine v2 manifest extensions.
//
// A v1 manifest is just {name, slug, version, description, spec,
// permissionsRequested[]}. A v2 manifest adds four OPTIONAL blocks on top:
//
//   backendScript       — entry JS file the Goja VM evaluates on activation
//   slots               — frontend injection points the mod registers
//   hooks               — event listeners (pre / post) the script subscribes to
//   permissionsDeclared  — custom mod RBAC keys (mod-scoped, not host caps)
//
// Everything below is intentionally optional and additive: a manifest with none
// of these fields parses as a v1 manifest and runs through the static v1 path.
// The engine version (`engineVersion` in the manifest) is the opt-in flag; an
// absent `engineVersion` field is treated as v1.
// ---------------------------------------------------------------------------

// SlotDefinition is one frontend injection point a v2 mod declares. `name` is
// the well-known layout slot the panel renders (e.g. "instance.detail.tabs");
// `component` is the export name inside the mod's JS bundle that the browser
// registry will mount when the slot is reached; `props` are passed through
// verbatim to the rendered component.
//
// Canonical slot catalog (v1) — these are the slot names the panel actually
// mounts (host components call <Slot name="…" />):
//
//	instance.detail.tabs          — top of an instance detail panel   context {instanceId}
//	instance.card.actions         — instance card action row          context {instanceId}
//	dashboard.cards               — instances home page, above grid   context {}
//	settings.general.below        — bottom of the Settings page       context {}
//	admin.mods.detail.after       — bottom of a mod's detail page     context {modSlug}
//	mod.screen                    — full-screen admin page at /mods/view/<slug>/*
//	                                context {slug, path}; props title/icon/nav/order
//	                                drive the Sidebar "Mods" entry
//
// Mods may declare any of these; the host renders whatever is registered for
// the slot name, each in its own ErrorBoundary. Keep this list in sync with
// frontend `shared/types/mod.ts` and `aiskills/mods.md`.
type SlotDefinition struct {
	Name      string          `json:"name"`
	Component string          `json:"component"`
	Props     json.RawMessage `json:"props,omitempty"`
}

// HookDefinition is one event listener a v2 mod registers declaratively in its
// manifest. Coupled with a runtime `ks.events.on(name, fn)` call from the
// backendScript this lets a mod react to host lifecycle events ("pre:instance.stop",
// "post:instance.deploy", …). Phase is "pre" (cancellable, runs before the host
// action) or "post" (async, runs after). Handler is the function name the
// backendScript exported for this hook.
type HookDefinition struct {
	Event   string `json:"event"`
	Phase   string `json:"phase"`   // "pre" | "post"
	Handler string `json:"handler"` // exported JS function name
}

// CustomPermission is one mod-scoped RBAC key the mod declares. These are
// persisted as mod_permissions rows alongside the host capabilities,
// namespaced under the mod (`<slug>:<key>`) so two mods can't collide on
// "admin" or "configure". The admin approves them in the same grant checklist
// (activation waits until every row is granted) and the mod reads them at
// runtime through ks.permissions.has(key).
type CustomPermission struct {
	Key         string `json:"key"`
	Description string `json:"description,omitempty"`
}

// ModSettingDefinition is one typed setting a v2 mod declares in its manifest
// (`settings: [...]`). The admin edits the values in the panel (typed form on
// the mod's detail page); the mod reads them at runtime through
// `ks.settings.get(key)`. Values are stored as TEXT in mod_settings — secrets
// AES-256-GCM-encrypted via internal/secretbox when Type == "password" — and
// the declared schema is what the PUT endpoint + the sandbox binding validate
// writes against.
//
// Scope is global per mod for v1 (per-instance / per-user / per-server scopes
// are noted as a stretch in plan/mod.md, not built).
type ModSettingDefinition struct {
	// Key is the stable identifier scripts pass to ks.settings.get/set.
	// `[a-z0-9_]{1,64}`, unique within the manifest.
	Key string `json:"key"`
	// Label is the human-readable field label (falls back to Key in the UI).
	Label string `json:"label,omitempty"`
	// Type is one of "text", "password", "number", "toggle", "select".
	Type string `json:"type"`
	// Options lists the allowed values for Type "select" (1..64 entries).
	Options []string `json:"options,omitempty"`
	// Default is shown by the UI (and documented) when no value is stored.
	// Never allowed for Type "password" — a plaintext secret in the manifest
	// would be a lie.
	Default string `json:"default,omitempty"`
	// Description is optional help text rendered under the field.
	Description string `json:"description,omitempty"`
}

// Mod settings limits (validated at upload + on every write).
const (
	// MaxSettingsPerMod caps the number of declared settings.
	MaxSettingsPerMod = 32
	// MaxModSettingValueBytes caps one stored value (all types).
	MaxModSettingValueBytes = 4096
	// MaxSettingOptions caps the option list of a select setting.
	MaxSettingOptions = 64
)

// settingKeyRE is the setting-key contract: lowercase alphanumerics +
// underscore, 1..64 chars. Kept identical to the documented contract so a
// manifest that validates at upload can never address a key the API or the
// sandbox binding would refuse.
var settingKeyRE = regexp.MustCompile(`^[a-z0-9_]{1,64}$`)

// settingTypes is the fixed type vocabulary for declared settings.
var settingTypes = map[string]bool{
	"text": true, "password": true, "number": true, "toggle": true, "select": true,
}

// ValidateSettings checks the v2 `settings` block on an upload: count cap,
// key shape + uniqueness, type vocabulary, select option list, and the
// declared default against its own type. Called by the repository on every
// install path so a malformed schema can never reach the settings API or the
// sandbox binding.
func ValidateSettings(m ModManifestV2) error {
	if len(m.Settings) > MaxSettingsPerMod {
		return fmt.Errorf("too many settings (%d; max %d)", len(m.Settings), MaxSettingsPerMod)
	}
	seen := make(map[string]bool, len(m.Settings))
	for i, s := range m.Settings {
		if !settingKeyRE.MatchString(s.Key) {
			return fmt.Errorf("setting #%d: key %q must match [a-z0-9_]{1,64}", i+1, s.Key)
		}
		if seen[s.Key] {
			return fmt.Errorf("setting %q declared more than once", s.Key)
		}
		seen[s.Key] = true
		if !settingTypes[s.Type] {
			return fmt.Errorf("setting %q: unknown type %q (text|password|number|toggle|select)", s.Key, s.Type)
		}
		if len(s.Label) > 128 {
			return fmt.Errorf("setting %q: label too long (max 128 chars)", s.Key)
		}
		if len(s.Description) > 512 {
			return fmt.Errorf("setting %q: description too long (max 512 chars)", s.Key)
		}
		if s.Type == "select" {
			if len(s.Options) == 0 || len(s.Options) > MaxSettingOptions {
				return fmt.Errorf("setting %q: select needs 1..%d options", s.Key, MaxSettingOptions)
			}
			opts := make(map[string]bool, len(s.Options))
			for _, o := range s.Options {
				if o == "" || len(o) > 128 {
					return fmt.Errorf("setting %q: select options must be 1..128 chars", s.Key)
				}
				if opts[o] {
					return fmt.Errorf("setting %q: duplicate select option %q", s.Key, o)
				}
				opts[o] = true
			}
		} else if len(s.Options) > 0 {
			return fmt.Errorf("setting %q: options are only valid for type \"select\"", s.Key)
		}
		if s.Default != "" {
			if s.Type == "password" {
				return fmt.Errorf("setting %q: password settings must not declare a default", s.Key)
			}
			if err := ValidateSettingValue(s, s.Default); err != nil {
				return fmt.Errorf("setting %q: bad default: %w", s.Key, err)
			}
		}
	}
	return nil
}

// ValidateSettingValue checks one non-empty value against a declared setting.
// An empty value is the caller's "clear this setting" signal and is handled
// before validation (the API + sandbox binding delete the row instead).
func ValidateSettingValue(def ModSettingDefinition, value string) error {
	if len(value) > MaxModSettingValueBytes {
		return fmt.Errorf("value too large (%d bytes; max %d)", len(value), MaxModSettingValueBytes)
	}
	switch def.Type {
	case "text", "password":
		return nil
	case "number":
		if _, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err != nil {
			return fmt.Errorf("number setting must be a number (got %q)", value)
		}
		return nil
	case "toggle":
		if value != "true" && value != "false" {
			return fmt.Errorf("toggle setting must be \"true\" or \"false\" (got %q)", value)
		}
		return nil
	case "select":
		for _, o := range def.Options {
			if o == value {
				return nil
			}
		}
		return fmt.Errorf("select setting must be one of the declared options")
	default:
		return fmt.Errorf("unknown setting type %q", def.Type)
	}
}

// SettingByKey returns the declared definition for a key (nil when the
// manifest does not declare it). Used by the API PUT path and the sandbox
// binding to enforce the schema on every write.
func (m ModManifestV2) SettingByKey(key string) *ModSettingDefinition {
	for i := range m.Settings {
		if m.Settings[i].Key == key {
			return &m.Settings[i]
		}
	}
	return nil
}

// ModManifestV2 is the superset manifest the parser decodes into. Every v2
// field is optional; for a v1 manifest only the v1 fields (Name/Slug/Version/
// Description/Spec/PermissionsRequested — parsed in the repository) are
// populated. ParseV2Manifest fills the v2 fields when the manifest opted into
// engine version 2.
type ModManifestV2 struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Version     string `json:"version"`
	Description string `json:"description"`
	// APIVersion is the manifest schema version (1, 2 or 3). It is separate
	// from EngineVersion: apiVersion describes which manifest fields are
	// understood, engineVersion describes whether a JS runtime is required.
	// A v3 manifest opts into requires/provides/conflicts + marketplace
	// metadata; older manifests keep parsing unchanged.
	APIVersion int `json:"apiVersion,omitempty"`
	// EngineVersion is 1 (static manifest) or 2 (Goja runtime). engineVersion
	// 3 is accepted as a shorthand for apiVersion 3 when apiVersion is absent.
	EngineVersion       int    `json:"engineVersion"`
	BackendScript       string `json:"backendScript"`
	BackendScriptSource string `json:"backendScriptSource"`
	// UIBundle is the zip-relative path of the mod's frontend bundle inside its
	// .kspm package (default "frontend/bundle.js" when empty). The panel serves
	// it at /api/mods/v1/assets/<slug>/<uiBundle> and the loader injects it as
	// an ES module when the mod declares slots. Must stay zip-relative: absolute
	// paths and ".." escapes are rejected at upload.
	UIBundle string `json:"uiBundle"`
	// UIBundleSource is the inline JS variant (mirrors BackendScriptSource):
	// Studio / sample / JSON installs have no package zip, so the bundle source
	// travels inside the manifest and the asset handler serves it at the
	// UIBundle path; it wins over a file with the same name. Capped at
	// MaxUIBundleSourceBytes (1 MiB) at upload.
	UIBundleSource      string                 `json:"uiBundleSource"`
	Slots               []SlotDefinition       `json:"slots"`
	Hooks               []HookDefinition       `json:"hooks"`
	PermissionsDeclared []CustomPermission     `json:"permissionsDeclared"`
	Settings            []ModSettingDefinition `json:"settings"`
	// Requires declares mod-to-mod dependencies plus the panel/engine/SDK
	// compatibility matrix. Both the legacy flat form
	// {"other-mod": ">=1.2.3"} and the object form
	// {"mods": {...}, "panel": ">=1.1", "engine": ">=2", "sdk": ">=1"}
	// are accepted (see ModRequires.UnmarshalJSON).
	Requires ModRequires `json:"requires,omitempty"`
	// Provides/Conflicts are v3 ownership tokens. A token is a stable string
	// such as "slot:instance.detail.tabs", "component:my-widget" or
	// "page:/reports"; two active mods may not provide the same token.
	Provides  []string `json:"provides,omitempty"`
	Conflicts []string `json:"conflicts,omitempty"`
	// Marketplace metadata (v3). Rendered by the Mods UI; none of it is
	// trusted for execution.
	Publisher            string            `json:"publisher,omitempty"`
	License              string            `json:"license,omitempty"`
	Homepage             string            `json:"homepage,omitempty"`
	Icon                 string            `json:"icon,omitempty"`
	Screenshots          []string          `json:"screenshots,omitempty"`
	Changelog            string            `json:"changelog,omitempty"`
	Tags                 []string          `json:"tags,omitempty"`
	Spec                 json.RawMessage   `json:"spec"`
	PermissionsRequested []PermissionReqV2 `json:"permissionsRequested"`
}

// DefaultUIBundlePath is the bundle path a mod's manifest refers to when it
// omits `uiBundle`. Also the path the inline `uiBundleSource` is served at.
const DefaultUIBundlePath = "frontend/bundle.js"

// MaxUIBundleSourceBytes caps the inline `uiBundleSource` (1 MiB). Frontend
// bundles are usually built/minified to well under this; the cap protects the
// manifest row + asset route from a hostile payload.
const MaxUIBundleSourceBytes = 1 << 20

// EffectiveUIBundlePath returns the mod's frontend bundle path, applying the
// default when the manifest omits one.
func (m ModManifestV2) EffectiveUIBundlePath() string {
	if p := strings.TrimSpace(m.UIBundle); p != "" {
		return p
	}
	return DefaultUIBundlePath
}

// ValidateUIBundle checks the v2 frontend-bundle declarations on an upload:
// the path must stay zip-relative (no absolute paths, drive letters or ".."
// escapes, max 256 chars, forward slashes) and the inline source must respect
// the size cap. Called by the repository on every install path (file, URL,
// Studio, JSON, sample) so a hostile manifest can never make the asset route
// serve a file outside the mod's workdir or bloat the row.
func ValidateUIBundle(m ModManifestV2) error {
	if p := strings.TrimSpace(m.UIBundle); p != "" {
		if len(p) > 256 {
			return fmt.Errorf("uiBundle path too long (max 256 chars)")
		}
		if strings.ContainsRune(p, 0) || strings.Contains(p, "\\") {
			return fmt.Errorf("uiBundle path must use forward slashes")
		}
		clean := path.Clean(p)
		if clean != p {
			return fmt.Errorf("uiBundle path must be clean (got %q, want %q)", p, clean)
		}
		if path.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, "../") {
			return fmt.Errorf("uiBundle path must be zip-relative (no absolute paths or ..)")
		}
	}
	if len(m.UIBundleSource) > MaxUIBundleSourceBytes {
		return fmt.Errorf("uiBundleSource too large (%d bytes; max %d)", len(m.UIBundleSource), MaxUIBundleSourceBytes)
	}
	return nil
}

// PermissionReqV2 mirrors repository.PermissionReq but lives here so the
// models package stays free of an import cycle (repository imports models).
type PermissionReqV2 struct {
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
}

// ParseV2Manifest decodes a raw manifest blob into ModManifestV2. It is lenient:
// it never returns a hard error for a v1 manifest — the v1-only validation of
// name/slug/capabilities stays the responsibility of repository.ParseManifest
// (used at upload). Here we only surface the v2 fields the engine needs to
// boot a runtime. `backendScriptSource` may carry an inline script (so a mod
// can ship a single self-contained manifest file in dev); `backendScript` is
// a file path resolved by the loader if present.
//
// The function is safe to call with nil/empty input; it returns a zero struct
// with EngineVersion == 1 in that case.
func ParseV2Manifest(raw []byte) ModManifestV2 {
	var m ModManifestV2
	if len(raw) == 0 {
		m.EngineVersion = 1
		return m
	}
	// Decode into a raw map first so we can detect "engineVersion" cheaply
	// without letting strict-mode decoder reject unknown v1 fields.
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		m.EngineVersion = 1
		return m
	}
	_ = json.Unmarshal(raw, &m)
	if m.EngineVersion == 0 {
		// Default to v1 unless the manifest explicitly opted into 2.
		m.EngineVersion = 1
	}
	if m.APIVersion == 0 {
		switch {
		case m.EngineVersion >= ManifestAPIVersionV3:
			// engineVersion: 3 is the documented shorthand for apiVersion 3.
			m.APIVersion = ManifestAPIVersionV3
		case m.EngineVersion == ManifestAPIVersionV2:
			m.APIVersion = ManifestAPIVersionV2
		default:
			m.APIVersion = ManifestAPIVersionV1
		}
	}
	// Normalise the declared custom-permission codes so callers can match
	// them against granted rows without re-decoding the manifest.
	for i := range m.PermissionsDeclared {
		if m.PermissionsDeclared[i].Key != "" {
			m.PermissionsDeclared[i].Key = normaliseCustomPerm(m.Slug, m.PermissionsDeclared[i].Key)
		}
	}
	return m
}

// normaliseCustomPerm turns a manifest-declared custom permission key into the
// namespaced code the grant table stores. If the mod already prefixed it
// (e.g. "my-slug:admin") we leave it; otherwise we prepend "<slug>:". A blank
// slug yields the bare key (only useful for tests).
func normaliseCustomPerm(slug, key string) string {
	if key == "" {
		return key
	}
	if strings.Contains(key, ":") {
		return key
	}
	if slug == "" {
		return key
	}
	return slug + ":" + key
}
