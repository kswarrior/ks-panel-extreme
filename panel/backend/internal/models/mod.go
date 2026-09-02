package models

import (
	"encoding/json"
	"regexp"
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
// Capability is one of the fixed CapXxx codes below; the repo validates it at
// insert time so a mod can't smuggle an arbitrary string.
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
// surfaced to the admin through the existing grant checklist alongside the
// host capabilities, but the code is namespaced under the mod (`<slug>:<key>`)
// so two mods can't collide on "admin" or "configure". The panel does not
// enforce custom permissions today beyond surfacing them; mods read them from
// the grant table to gate their own actions.
type CustomPermission struct {
	Key         string `json:"key"`
	Description string `json:"description,omitempty"`
}

// ModManifestV2 is the superset manifest the parser decodes into. Every v2
// field is optional; for a v1 manifest only the v1 fields (Name/Slug/Version/
// Description/Spec/PermissionsRequested — parsed in the repository) are
// populated. ParseV2Manifest fills the v2 fields when the manifest opted into
// engine version 2.
type ModManifestV2 struct {
	Name                 string             `json:"name"`
	Slug                 string             `json:"slug"`
	Version              string             `json:"version"`
	Description          string             `json:"description"`
	EngineVersion        int                `json:"engineVersion"`
	BackendScript        string             `json:"backendScript"`
	BackendScriptSource  string             `json:"backendScriptSource"`
	Slots                []SlotDefinition   `json:"slots"`
	Hooks                []HookDefinition   `json:"hooks"`
	PermissionsDeclared  []CustomPermission `json:"permissionsDeclared"`
	Spec                 json.RawMessage    `json:"spec"`
	PermissionsRequested []PermissionReqV2  `json:"permissionsRequested"`
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
