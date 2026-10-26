package modengine

// settings.go — the ks.settings backing binding for Mod Engine v2 (plan item
// M8).
//
// kspanel's mod system needs a first-class home for operator configuration:
// an API token a mod talks to a third service with, a retry count, a region
// dropdown. mod_storage is the wrong tool for that — it is opaque JSON the
// panel never validates, and it has no secret handling, so a token stored
// there would sit in the clear and be invisible to the admin UI.
//
// This binding gives the sandbox typed access to the mod_settings table
// (migration 081) under the schema the manifest declares:
//
//   - The binding is constructed once per activation from the manifest's
//     `settings: [...]` block, so a key the manifest does not declare is
//     unreachable — reads return null, writes fail with a logged error.
//   - Writes validate against the declared type (models.ValidateSettingValue)
//     before the repo seals/persists them; password-type values are sealed
//     with internal/secretbox and never readable from the HTTP surface.
//   - Reads fall back to the declared default when no row is stored, so a mod
//     can ship sensible behavior with zero admin configuration.
//   - A key scoped to the calling mod's slug only, exactly like ks.storage.
//
// The binding is intentionally goja-free (a plain struct over the repository
// package) so it stays compiled into the DEFAULT build and can be unit-tested
// without the modengine_goja tag; sandbox.go owns the thin typed wrappers that
// adapt JS values to the string methods here.

import (
	"errors"
	"fmt"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// errSettingUndeclared is returned by set on a key the manifest did not
// declare. get treats the same condition as "not found" (JS null).
var errSettingUndeclared = errors.New("setting is not declared in the manifest")

// settingsBinding is the per-activation ks.settings backend. Not safe to
// mutate after construction; the runtime builds one per Start.
type settingsBinding struct {
	slug string
	defs map[string]models.ModSettingDefinition
	repo *repository.ModSettingsRepository
}

// newSettingsBinding builds the binding from the manifest-declared schema.
// Duplicate keys cannot occur (ValidateSettings rejects them at upload); if a
// malformed legacy manifest carries one, last-write-wins silently.
func newSettingsBinding(slug string, defs []models.ModSettingDefinition) *settingsBinding {
	m := make(map[string]models.ModSettingDefinition, len(defs))
	for _, d := range defs {
		m[d.Key] = d
	}
	return &settingsBinding{slug: slug, defs: m, repo: repository.NewModSettingsRepository()}
}

// settingsFromHostEnv extracts the declared schema from the activation env.
// A nil env (or nil implementation) yields no schema — every key is
// undeclared, which fails closed without touching the DB.
func settingsFromHostEnv(env HostEnv) []models.ModSettingDefinition {
	if env == nil {
		return nil
	}
	return env.Settings()
}

// get returns the effective value for a declared key: the stored row if one
// exists (decrypted for secrets — this is the engine-side reveal path), else
// the declared default. undeclared → found=false.
func (b *settingsBinding) get(key string, requested models.ModSettingScope) (value string, found bool, err error) {
	def, ok := b.defs[key]
	if !ok {
		return "", false, nil
	}
	scope, err := settingScopeFor(def, requested)
	if err != nil {
		return "", false, err
	}
	stored, _, found, err := b.repo.Reveal(b.slug, key, scope)
	if err != nil {
		return "", false, err
	}
	if found {
		return stored, true, nil
	}
	// No row yet: surface the declared default so a mod works before the
	// admin configures anything. Passwords never carry a default (enforced
	// by ValidateSettings), and an empty default reads as "unset".
	if def.Default != "" {
		return def.Default, true, nil
	}
	return "", false, nil
}

// set validates and upserts one value. An empty value clears the setting
// (deletes the row) for every type — matching the API's PUT semantics — so a
// mod cannot accidentally persist "" as a meaningful secret.
func (b *settingsBinding) set(key, value string, requested models.ModSettingScope) error {
	def, ok := b.defs[key]
	if !ok {
		return fmt.Errorf("setting %q: %w", key, errSettingUndeclared)
	}
	scope, err := settingScopeFor(def, requested)
	if err != nil {
		return fmt.Errorf("setting %q: %w", key, err)
	}
	if value == "" {
		return b.repo.Delete(b.slug, key, scope)
	}
	if err := models.ValidateSettingValue(def, value); err != nil {
		return fmt.Errorf("setting %q: %w", key, err)
	}
	return b.repo.Set(b.slug, key, value, def.Type == "password", scope)
}

// settingScopeFor validates a caller-supplied scope against the declared one.
// Omitting the scope means global for global settings; a non-global setting
// requires an explicit id (there is no ambient request context in the VM).
func settingScopeFor(def models.ModSettingDefinition, requested models.ModSettingScope) (models.ModSettingScope, error) {
	declared := def.DeclaredScope()
	if requested.Type == "" {
		requested = models.ModSettingScope{Type: declared}
	}
	normalized, err := requested.Normalize()
	if err != nil {
		return models.ModSettingScope{}, err
	}
	if normalized.Type != declared {
		return models.ModSettingScope{}, fmt.Errorf("declared scope is %s", declared)
	}
	if declared != models.ModSettingScopeGlobal && normalized.ID == "" {
		return models.ModSettingScope{}, fmt.Errorf("%s scope requires an id", declared)
	}
	return normalized, nil
}
