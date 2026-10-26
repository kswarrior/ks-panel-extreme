package models

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Manifest schema versions. v1/v2 are the historical static/Goja manifests;
// v3 adds dependencies, ownership tokens and marketplace metadata. New fields
// are only accepted when the manifest opts into v3 (apiVersion: 3 or the
// engineVersion: 3 shorthand), so old rows keep their old contract.
const (
	ManifestAPIVersionV1 = 1
	ManifestAPIVersionV2 = 2
	ManifestAPIVersionV3 = 3

	// CurrentEngineVersion is the mod-engine API version advertised to
	// requires.engine. It is independent of the manifest schema version.
	CurrentEngineVersion = "2.0.0"
	// CurrentSDKVersion is the panel-side mod SDK contract. The TypeScript SDK
	// (milestone 2) must publish the same version once it exists.
	CurrentSDKVersion = "1.0.0"

	MaxModDependencies = 16
	MaxModProvides     = 64
	MaxModConflicts    = 64
	MaxManifestSlots   = 64
	MaxManifestHooks   = 64
	MaxScreenshots     = 8
	MaxModTags         = 16
)

// ManifestValidationOptions supplies the running panel's compatibility
// versions to ValidateManifest. RequireIdentity is true for upload paths that
// trust the manifest's own name/slug; CreateMod sets it false because it
// already validates the resolved input fields.
type ManifestValidationOptions struct {
	PanelVersion    string
	EngineVersion   string
	SDKVersion      string
	RequireIdentity bool
}

// IncompatibilityError is returned when a manifest's requires.panel/engine/sdk
// constraint does not match the running panel. Handlers surface it as a 409 on
// activation (and 400 on install) with the component + versions so the admin
// can see exactly what is wrong.
type IncompatibilityError struct {
	Component string `json:"component"`
	Required  string `json:"required"`
	Current   string `json:"current"`
}

func (e *IncompatibilityError) Error() string {
	return fmt.Sprintf("incompatible %s: requires %s, running %s", e.Component, e.Required, e.Current)
}

// ModRequires is the v3 dependency + compatibility block. It accepts both the
// legacy flat map ({"other-mod": ">=1.2.3"}) and the structured form
// ({"mods": {...}, "panel": ">=1.1", "engine": ">=2", "sdk": ">=1"}). The flat
// form is kept because models/modver.go documented it before the field existed.
type ModRequires struct {
	Mods   map[string]string `json:"mods,omitempty"`
	Panel  string            `json:"panel,omitempty"`
	Engine string            `json:"engine,omitempty"`
	SDK    string            `json:"sdk,omitempty"`
}

// UnmarshalJSON implements the dual flat/structured requires syntax.
func (r *ModRequires) UnmarshalJSON(data []byte) error {
	*r = ModRequires{}
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("requires must be an object: %w", err)
	}
	structured := false
	for _, key := range []string{"mods", "panel", "engine", "sdk"} {
		if _, ok := raw[key]; ok {
			structured = true
			break
		}
	}
	if structured {
		for key, value := range raw {
			switch key {
			case "mods":
				if err := json.Unmarshal(value, &r.Mods); err != nil {
					return fmt.Errorf("requires.mods must map mod slugs to version constraints: %w", err)
				}
			case "panel":
				if err := json.Unmarshal(value, &r.Panel); err != nil {
					return fmt.Errorf("requires.panel must be a string: %w", err)
				}
			case "engine":
				if err := json.Unmarshal(value, &r.Engine); err != nil {
					return fmt.Errorf("requires.engine must be a string: %w", err)
				}
			case "sdk":
				if err := json.Unmarshal(value, &r.SDK); err != nil {
					return fmt.Errorf("requires.sdk must be a string: %w", err)
				}
			default:
				return fmt.Errorf("unknown requires key %q (want mods/panel/engine/sdk)", key)
			}
		}
		return nil
	}
	r.Mods = make(map[string]string, len(raw))
	for slug, value := range raw {
		var constraint string
		if err := json.Unmarshal(value, &constraint); err != nil {
			return fmt.Errorf("requires.%s must be a version constraint string: %w", slug, err)
		}
		r.Mods[slug] = constraint
	}
	return nil
}

// IsZero reports whether the block declares nothing.
func (r ModRequires) IsZero() bool {
	return len(r.Mods) == 0 && r.Panel == "" && r.Engine == "" && r.SDK == ""
}

// hasV3Fields reports whether the manifest uses a field that requires
// apiVersion 3. engineVersion alone is not enough: a v2 manifest with
// requires/provides/conflicts must be upgraded explicitly.
func hasV3Fields(m ModManifestV2) bool {
	return !m.Requires.IsZero() || len(m.Provides) > 0 || len(m.Conflicts) > 0 ||
		m.Publisher != "" || m.License != "" || m.Homepage != "" || m.Icon != "" ||
		len(m.Screenshots) > 0 || m.Changelog != "" || len(m.Tags) > 0
}

// ValidateManifest is the single schema/security choke point for every install
// path (file, URL, Studio, JSON, sample and future registry installs). It
// validates identity, permissions, slots/hooks, settings, the UI bundle,
// dependencies, compatibility and v3 metadata. It is intentionally strict for
// new fields but leaves v1/v2 manifests byte-compatible.
func ValidateManifest(raw []byte, opts ManifestValidationOptions) (ModManifestV2, error) {
	var zero ModManifestV2
	if len(raw) == 0 {
		return zero, fmt.Errorf("empty manifest")
	}
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		return zero, fmt.Errorf("invalid manifest JSON: %w", err)
	}
	var m ModManifestV2
	if err := json.Unmarshal(raw, &m); err != nil {
		return zero, fmt.Errorf("invalid manifest JSON: %w", err)
	}
	m = ParseV2Manifest(raw)
	if m.APIVersion < ManifestAPIVersionV1 || m.APIVersion > ManifestAPIVersionV3 {
		return zero, fmt.Errorf("unsupported apiVersion %d (want 1, 2 or 3)", m.APIVersion)
	}
	if m.EngineVersion < 1 || m.EngineVersion > 3 {
		return zero, fmt.Errorf("unsupported engineVersion %d (want 1, 2 or 3)", m.EngineVersion)
	}
	if opts.RequireIdentity {
		if strings.TrimSpace(m.Name) == "" || strings.TrimSpace(m.Slug) == "" {
			return zero, fmt.Errorf("manifest must declare name and slug")
		}
		if !ValidModSlug(m.Slug) {
			return zero, fmt.Errorf("invalid slug %q: use lowercase letters, digits and hyphens (max 64 chars)", m.Slug)
		}
	}
	if len(m.Name) > 128 {
		return zero, fmt.Errorf("name too long (max 128 chars)")
	}
	if len(m.Description) > 8192 {
		return zero, fmt.Errorf("description too long (max 8192 chars)")
	}
	if (m.BackendScript != "" || m.BackendScriptSource != "") && m.EngineVersion < 2 {
		return zero, fmt.Errorf("backendScript requires engineVersion 2 or newer")
	}
	if m.APIVersion < ManifestAPIVersionV3 && hasV3Fields(m) {
		return zero, fmt.Errorf("requires/provides/conflicts/metadata require apiVersion 3")
	}
	if err := ValidatePermissionRequests(m.PermissionsRequested); err != nil {
		return zero, err
	}
	if err := ValidateCustomPermissions(m.PermissionsDeclared); err != nil {
		return zero, err
	}
	if err := ValidateUIBundle(m); err != nil {
		return zero, err
	}
	if err := ValidateSettings(m); err != nil {
		return zero, fmt.Errorf("invalid settings: %w", err)
	}
	if err := validateSlotsAndHooks(m); err != nil {
		return zero, err
	}
	if err := validateRequires(m.Requires, m.Slug); err != nil {
		return zero, err
	}
	if err := checkCompatibility(m.Requires, opts); err != nil {
		return zero, err
	}
	if err := validateProvidesConflicts(m); err != nil {
		return zero, err
	}
	if err := validateMetadata(m); err != nil {
		return zero, err
	}
	return m, nil
}

// ValidatePermissionRequests rejects unknown capability codes and duplicate
// requests. Shared by the central validator and the repository so every install
// path applies the same capability whitelist.
func ValidatePermissionRequests(perms []PermissionReqV2) error {
	allowed := map[string]struct{}{}
	for _, c := range AllowedCapabilties() {
		allowed[c] = struct{}{}
	}
	seen := map[string]struct{}{}
	for _, p := range perms {
		if _, ok := allowed[p.Capability]; !ok {
			return fmt.Errorf("unknown capability %q", p.Capability)
		}
		if _, ok := seen[p.Capability]; ok {
			return fmt.Errorf("duplicate permission request for capability %q", p.Capability)
		}
		seen[p.Capability] = struct{}{}
	}
	return nil
}

// modDeclaredPermRE mirrors the repository contract for the key part of a
// custom permission after the "<slug>:" namespace.
var modDeclaredPermRE = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{0,63}$`)

// MaxCustomPermissions bounds the custom-permission checklist.
const MaxCustomPermissions = 16

// ValidateCustomPermissions checks manifest-declared custom permissions before
// they are seeded into the grant table. Keys may already be namespaced
// ("<slug>:<key>") or bare; both are shape-checked.
func ValidateCustomPermissions(declared []CustomPermission) error {
	if len(declared) > MaxCustomPermissions {
		return fmt.Errorf("too many custom permissions declared (%d; max %d)", len(declared), MaxCustomPermissions)
	}
	seen := map[string]struct{}{}
	for _, p := range declared {
		code := strings.TrimSpace(p.Key)
		if code == "" {
			return fmt.Errorf("custom permission key must not be empty")
		}
		key := code
		if i := strings.Index(code, ":"); i >= 0 {
			key = code[i+1:]
		}
		if !modDeclaredPermRE.MatchString(key) {
			return fmt.Errorf("invalid custom permission key %q: use lowercase letters, digits, \"_\", \".\" or \"-\" (max 64 chars)", key)
		}
		if _, ok := seen[code]; ok {
			return fmt.Errorf("duplicate custom permission %q", code)
		}
		seen[code] = struct{}{}
	}
	return nil
}

func validateSlotsAndHooks(m ModManifestV2) error {
	if len(m.Slots) > MaxManifestSlots {
		return fmt.Errorf("too many slots declared (%d; max %d)", len(m.Slots), MaxManifestSlots)
	}
	for i, s := range m.Slots {
		if strings.TrimSpace(s.Name) == "" || strings.TrimSpace(s.Component) == "" {
			return fmt.Errorf("slot #%d: name and component are required", i+1)
		}
		if len(s.Name) > 128 || len(s.Component) > 128 {
			return fmt.Errorf("slot #%d: name/component too long (max 128 chars)", i+1)
		}
		if len(s.Props) > 64<<10 {
			return fmt.Errorf("slot %q: props too large (max 64 KiB)", s.Name)
		}
	}
	if len(m.Hooks) > MaxManifestHooks {
		return fmt.Errorf("too many hooks declared (%d; max %d)", len(m.Hooks), MaxManifestHooks)
	}
	for i, h := range m.Hooks {
		if strings.TrimSpace(h.Event) == "" || strings.TrimSpace(h.Handler) == "" {
			return fmt.Errorf("hook #%d: event and handler are required", i+1)
		}
		if h.Phase != "" && h.Phase != "pre" && h.Phase != "post" {
			return fmt.Errorf("hook #%d: phase must be pre or post", i+1)
		}
		if len(h.Event) > 128 || len(h.Handler) > 128 {
			return fmt.Errorf("hook #%d: event/handler too long (max 128 chars)", i+1)
		}
	}
	return nil
}

func validateRequires(req ModRequires, ownSlug string) error {
	if len(req.Mods) > MaxModDependencies {
		return fmt.Errorf("too many mod dependencies (%d; max %d)", len(req.Mods), MaxModDependencies)
	}
	for slug, constraint := range req.Mods {
		if !ValidModSlug(slug) {
			return fmt.Errorf("requires: invalid dependency slug %q", slug)
		}
		if slug == ownSlug {
			return fmt.Errorf("requires: mod %q cannot depend on itself", slug)
		}
		if _, err := ParseConstraint(constraint); err != nil {
			return fmt.Errorf("requires.%s: %w", slug, err)
		}
	}
	for component, constraint := range map[string]string{
		"panel": req.Panel, "engine": req.Engine, "sdk": req.SDK,
	} {
		if constraint == "" {
			continue
		}
		if _, err := ParseConstraint(constraint); err != nil {
			return fmt.Errorf("requires.%s: %w", component, err)
		}
	}
	return nil
}

func checkCompatibility(req ModRequires, opts ManifestValidationOptions) error {
	checks := []struct {
		component string
		required  string
		current   string
	}{
		{"panel", req.Panel, opts.PanelVersion},
		{"engine", req.Engine, opts.EngineVersion},
		{"sdk", req.SDK, opts.SDKVersion},
	}
	for _, c := range checks {
		if c.required == "" {
			continue
		}
		constraint, err := ParseConstraint(c.required)
		if err != nil {
			return fmt.Errorf("requires.%s: %w", c.component, err)
		}
		if c.current == "" {
			return &IncompatibilityError{Component: c.component, Required: c.required, Current: "unknown"}
		}
		if !constraint.Matches(c.current) {
			return &IncompatibilityError{Component: c.component, Required: c.required, Current: c.current}
		}
	}
	return nil
}

// providesTokenRE is the ownership-token contract. Tokens are lowercase and
// namespaced by kind (slot/component/page); bare mod slugs are also accepted
// for conflicts.
var providesTokenRE = regexp.MustCompile(`^[a-z0-9][a-z0-9._:/-]{0,127}$`)

func validateProvidesConflicts(m ModManifestV2) error {
	if len(m.Provides) > MaxModProvides {
		return fmt.Errorf("too many provides tokens (%d; max %d)", len(m.Provides), MaxModProvides)
	}
	if len(m.Conflicts) > MaxModConflicts {
		return fmt.Errorf("too many conflict tokens (%d; max %d)", len(m.Conflicts), MaxModConflicts)
	}
	provided := map[string]bool{}
	for _, token := range m.Provides {
		if !providesTokenRE.MatchString(token) {
			return fmt.Errorf("invalid provides token %q (lowercase letters, digits and . _ : / - only)", token)
		}
		if provided[token] {
			return fmt.Errorf("duplicate provides token %q", token)
		}
		provided[token] = true
	}
	conflicted := map[string]bool{}
	for _, token := range m.Conflicts {
		if !providesTokenRE.MatchString(token) {
			return fmt.Errorf("invalid conflict token %q (lowercase letters, digits and . _ : / - only)", token)
		}
		if conflicted[token] {
			return fmt.Errorf("duplicate conflict token %q", token)
		}
		if token == m.Slug || provided[token] {
			return fmt.Errorf("conflict token %q conflicts with this mod", token)
		}
		conflicted[token] = true
	}
	return nil
}

var tagRE = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)

func validateMetadata(m ModManifestV2) error {
	if len(m.Publisher) > 128 {
		return fmt.Errorf("publisher too long (max 128 chars)")
	}
	if len(m.License) > 64 {
		return fmt.Errorf("license too long (max 64 chars)")
	}
	if len(m.Homepage) > 512 || len(m.Icon) > 512 {
		return fmt.Errorf("homepage/icon too long (max 512 chars)")
	}
	if len(m.Changelog) > 8192 {
		return fmt.Errorf("changelog too long (max 8192 chars)")
	}
	if len(m.Screenshots) > MaxScreenshots {
		return fmt.Errorf("too many screenshots (%d; max %d)", len(m.Screenshots), MaxScreenshots)
	}
	for _, s := range m.Screenshots {
		if strings.TrimSpace(s) == "" || len(s) > 512 {
			return fmt.Errorf("screenshot URLs must be 1..512 chars")
		}
	}
	if len(m.Tags) > MaxModTags {
		return fmt.Errorf("too many tags (%d; max %d)", len(m.Tags), MaxModTags)
	}
	for _, tag := range m.Tags {
		if !tagRE.MatchString(tag) {
			return fmt.Errorf("invalid tag %q: lowercase letters, digits and hyphens (max 32 chars)", tag)
		}
	}
	return nil
}
