package handlers

// mod_settings_handler.go — the typed mod settings API (plan item M8).
//
// The manifest of a v2 mod declares a `settings: [...]` schema (see
// models.ModSettingDefinition). This pair of endpoints powers the admin form
// on the mod detail page:
//
//   GET  /api/mods/{id}/settings  — declared schema + current values.
//   PUT  /api/mods/{id}/settings  — write values (validated against the
//                                   schema; secrets encrypted at rest via the
//                                   repository's secretbox path).
//
// Security posture:
//   - Secret (password-type) values are NEVER returned: the view carries only
//     is_set, so a GET cannot leak a token even to a fully-privileged admin
//     (they can overwrite but not read back; the mod itself reads the value
//     through ks.settings.get at runtime).
//   - Every write is validated against the manifest BEFORE it reaches the
//     repository (models.ValidateSettingValue), and undeclared keys are
//     rejected — the table can only ever hold declared keys.
//   - An empty value clears the setting for non-secret types; for a secret it
//     means "leave the stored value untouched" so the form can be submitted
//     without retyping the secret.
//   - Same ownership-scope rule as the other mod subresources (own-scope
//     callers only touch mods they uploaded; orphans require ALL).

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// modSettingView is one declared setting + its current state.
type modSettingView struct {
	Key         string   `json:"key"`
	Label       string   `json:"label,omitempty"`
	Type        string   `json:"type"`
	Options     []string `json:"options,omitempty"`
	Default     string   `json:"default,omitempty"`
	Description string   `json:"description,omitempty"`
	// Value is the stored cleartext for non-secret settings ("" when unset).
	// Always empty for password settings.
	Value string `json:"value,omitempty"`
	// IsSet reports whether a row is stored. For password settings this is
	// the only state the panel exposes.
	IsSet bool `json:"is_set"`
}

type modSettingsResponse struct {
	Slug     string           `json:"slug"`
	Settings []modSettingView `json:"settings"`
}

// updateModSettingsDTO is the PUT body. Values are strings for every type
// (number/toggle are canonical string forms, validated server-side).
type updateModSettingsDTO struct {
	Values map[string]string `json:"values"`
}

// buildModSettingsView merges the declared schema with the stored rows.
// `stored` carries no secret cleartext by construction (repository.List zeroes
// it), so this function cannot leak one.
func buildModSettingsView(slug string, defs []models.ModSettingDefinition, stored []repository.ModSettingRow) modSettingsResponse {
	byKey := make(map[string]repository.ModSettingRow, len(stored))
	for _, row := range stored {
		byKey[row.Key] = row
	}
	resp := modSettingsResponse{Slug: slug, Settings: make([]modSettingView, 0, len(defs))}
	for _, def := range defs {
		v := modSettingView{
			Key: def.Key, Label: def.Label, Type: def.Type,
			Options: def.Options, Default: def.Default, Description: def.Description,
		}
		if row, ok := byKey[def.Key]; ok {
			v.IsSet = true
			if def.Type != "password" {
				v.Value = row.Value
			}
		}
		resp.Settings = append(resp.Settings, v)
	}
	return resp
}

// loadModForSettings resolves {id} → mod, enforcing the own-scope rule shared
// by every mod subresource. On failure it has already written the response and
// returns ok=false.
func loadModForSettings(w http.ResponseWriter, r *http.Request, repo *repository.ModRepository) (*models.Mod, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return nil, false
	}
	mod, err := repo.GetMod(id)
	if err != nil {
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return nil, false
		}
		log.Println("ModSettings GetMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return nil, false
	}
	// Ownership scope (migration 054): own-scope callers may only touch mods
	// they uploaded. Orphans (OwnerID==0) require ALL (fail closed).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if mod != nil && mod.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only edit mods you uploaded", http.StatusForbidden)
					return nil, false
				}
			}
		}
	}
	return mod, true
}

// ModSettingsHandler serves GET /api/mods/{id}/settings — the declared schema
// plus current values (secrets masked to is_set).
func ModSettingsHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	mod, ok := loadModForSettings(w, r, repo)
	if !ok {
		return
	}
	defs := models.ParseV2Manifest(mod.Manifest).Settings
	stored, err := repository.NewModSettingsRepository().List(mod.Slug)
	if err != nil {
		log.Println("ModSettings list error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, buildModSettingsView(mod.Slug, defs, stored))
}

// UpdateModSettingsHandler serves PUT /api/mods/{id}/settings. The body maps
// declared keys to string values; validation is per-type against the manifest
// schema, and any unknown key fails the whole request (no partial writes —
// validation happens fully before the first write).
func UpdateModSettingsHandler(w http.ResponseWriter, r *http.Request) {
	var dto updateModSettingsDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Values == nil {
		http.Error(w, "values object is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	mod, ok := loadModForSettings(w, r, repo)
	if !ok {
		return
	}
	man := models.ParseV2Manifest(mod.Manifest)

	// Validate the entire payload before writing anything.
	type pendingWrite struct {
		def   models.ModSettingDefinition
		value string
	}
	writes := make([]pendingWrite, 0, len(dto.Values))
	for key, value := range dto.Values {
		def := man.SettingByKey(key)
		if def == nil {
			http.Error(w, fmt.Sprintf("setting %q is not declared by this mod", key), http.StatusBadRequest)
			return
		}
		if value == "" {
			if def.Type == "password" {
				// Empty secret = "keep the stored value": the form cannot
				// re-render the secret, so submitting it with an untouched
				// field must not wipe the token.
				continue
			}
			// Empty non-secret = clear the row (mirrors ks.settings.set).
			writes = append(writes, pendingWrite{def: *def, value: ""})
			continue
		}
		if err := models.ValidateSettingValue(*def, value); err != nil {
			http.Error(w, fmt.Sprintf("setting %q: %s", key, err), http.StatusBadRequest)
			return
		}
		writes = append(writes, pendingWrite{def: *def, value: value})
	}

	settingsRepo := repository.NewModSettingsRepository()
	for _, wr := range writes {
		if wr.value == "" {
			if err := settingsRepo.Delete(mod.Slug, wr.def.Key); err != nil {
				log.Println("ModSettings delete error:", err)
				http.Error(w, "server error", http.StatusInternalServerError)
				return
			}
			continue
		}
		if err := settingsRepo.Set(mod.Slug, wr.def.Key, wr.value, wr.def.Type == "password"); err != nil {
			log.Println("ModSettings set error:", err)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "update",
		TargetID:    &mod.ID,
		TargetLabel: mod.Name,
		Message:     fmt.Sprintf("updated settings for mod %q (%d value(s))", mod.Name, len(writes)),
	})

	stored, err := settingsRepo.List(mod.Slug)
	if err != nil {
		log.Println("ModSettings list after write error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, buildModSettingsView(mod.Slug, man.Settings, stored))
}
