// Package handlers: instance_page_guard.go enforces the instance-page
// whitelist on the per-instance built-in page backend routes (Terminal /
// Files / Secrets(env) / Automation / Processes / Metrics / Ports /
// Snapshots(backups) / Audit), mirroring the isPageAllowed /
// resolveInstanceNav whitelist semantics that the SPA already applies in
// panel/frontend/src/shared/utils/instancePages.ts. Before this guard existed, those routes
// were gated by requirePermission("VIEW_INSTANCES") only, so any operator
// with read access could call them even when the instance's config had
// NOT added the matching page to its spec.pages list — i.e. they could
// reach a page that had not been added to the instance's pages.
//
// The guard keeps panel and SPA in lock-step: the same default-mode vs.
// whitelist-mode rules, including the original_slug branch that lets a
// renamed builtin (terminal→console) keep granting access to its backend
// route. The frontend path/label change, the backend RPC name does not.

package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// guardInstancePage enforces that the built-in page identified by `pageSlug`
// is enabled for the instance's own deploy-time config snapshot before the
// calling handler does any further work. It mirrors the frontend isPageAllowed /
// resolveInstanceNav whitelist semantics defined in
// panel/frontend/src/shared/utils/instancePages.ts so nobody — including a regular operator with
// only VIEW_INSTANCES — can reach a page the instance's config has not
// added to its spec.pages list.
//
// The instance's Config field contains the merged spec from deploy time
// (template.spec + overrides), which is the source of truth for what pages
// this specific instance should expose. Using the instance's own config
// (instead of the live template) ensures:
//
//   - Instance independence: pages added/removed at deploy time are respected
//   - Template changes don't leak into deployed instances
//   - Consistency between frontend (instance.config) and backend checks
//
// Whitelist semantics (kept identical to the frontend so panel + SPA agree):
// EMPTY-BY-DEFAULT: when the instance config has no pages spec or an empty
// pages array, NO pages are allowed (not all builtins). This matches
// resolveInstanceNav and isPageAllowed in
// panel/frontend/src/shared/utils/instancePages.ts.
//
//   - spec.pages absent / not an array / empty (also when the instance has
//     no config): EMPTY-BY-DEFAULT mode — no pages are allowed.
//     This matches frontend behaviour: empty sidebar, no direct access.
//   - spec.pages present (non-empty array): WHITELIST mode — an entry grants
//     access to `pageSlug` when its `enabled` field is not explicitly false
//     AND (`slug` == pageSlug  OR  `original_slug` == pageSlug). The
//     original_slug branch covers renamed builtins (e.g. terminal→console):
//     the sidebar path changes, the panel route
//     (/api/instances/{id}/terminal) does not, so the component route stays
//     callable.
//
// On denial it writes a structured 403 JSON response (the same shape the SPA
// renders for "page not enabled" banners) and returns ok=false; the caller
// MUST `return` immediately. On success it returns ok=true and writes
// nothing, leaving the response untouched for the handler.
func guardInstancePage(w http.ResponseWriter, r *http.Request, pageSlug string) bool {
	return guardInstancePageAny(w, r, pageSlug)
}

// guardInstancePageAny is guardInstancePage for endpoints shared by several
// built-in pages: the request is allowed when ANY of the listed slugs is
// enabled in the instance's config snapshot (same EMPTY-BY-DEFAULT /
// WHITELIST semantics per slug). On denial it writes the identical
// structured 403 JSON, listing every slug that was tried.
func guardInstancePageAny(w http.ResponseWriter, r *http.Request, pageSlugs ...string) bool {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		writeJSONStatus(w, http.StatusBadRequest, map[string]any{"error": "invalid instance id"})
		return false
	}
	con, err := repository.OpenDB()
	if err != nil {
		writeJSONStatus(w, http.StatusInternalServerError, map[string]any{"error": "server error"})
		return false
	}
	defer con.Close()

	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil || inst == nil {
		writeJSONStatus(w, http.StatusNotFound, map[string]any{"error": "instance not found"})
		return false
	}

	// Ownership scope: Own without All may only reach own instances.
	// Legacy callers with neither scope keep the old full-access behaviour.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && inst.OwnerID != uid {
			writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
			return false
		}
	}

	for _, pageSlug := range pageSlugs {
		// Use the instance's own config (deploy-time snapshot) for page
		// allowance. This ensures instance independence and consistency
		// with the frontend.
		if instancePageSpecEnabled(inst.Config, pageSlug) {
			return true
		}
	}
	writeJSONStatus(w, http.StatusForbidden, map[string]any{
		"error": "page not enabled for this instance",
		"page":  strings.Join(pageSlugs, ","),
		"instance": map[string]any{
			"id":   inst.ID,
			"name": inst.Name,
		},
	})
	return false
}

// instancePageSpecEnabled reports whether `pageSlug` is enabled for the
// given instance config JSON, applying the whitelist semantics documented on
// guardInstancePage. This uses EMPTY-BY-DEFAULT semantics matching the
// frontend's resolveInstanceNav: when the instance config has no pages
// spec or an empty pages array, NO pages are allowed (not all builtins).
// This prevents the inconsistency where frontend shows empty tabs but
// backend allows all builtin pages.
func instancePageSpecEnabled(specJSON, pageSlug string) bool {
	specJSON = strings.TrimSpace(specJSON)
	if specJSON == "" {
		return false // EMPTY-BY-DEFAULT: no config = no pages allowed
	}
	var spec map[string]any
	if err := json.Unmarshal([]byte(specJSON), &spec); err != nil {
		return false // unparseable = no pages allowed (safe default)
	}
	pagesAny, ok := spec["pages"].([]any)
	if !ok || len(pagesAny) == 0 {
		return false // EMPTY-BY-DEFAULT: no pages array or empty = no pages allowed
	}
	for _, p := range pagesAny {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if pm["enabled"] == false {
			continue
		}
		if s, _ := pm["slug"].(string); s == pageSlug {
			return true
		}
		if os, _ := pm["original_slug"].(string); os == pageSlug {
			// Renamed builtin (terminal→console) still grants access to
			// the backend route of its component.
			return true
		}
	}
	return false
}

// specPageRow mirrors one entry of the instance config's spec.pages array
// with the loose typing raw JSON decoding produces.
type specPageRow struct {
	slug         string
	originalSlug string
	enabled      bool
	subPages     []string
	actions      []map[string]any
}

// parseSpecRows decodes the ENABLED pages rows of the spec JSON. Returns nil
// when the spec is absent/unparseable/empty (EMPTY-BY-DEFAULT semantics —
// callers treat nil as "nothing allowed"). Rows explicitly disabled
// (`enabled: false`) are dropped here so downstream resolution can never
// grant access through them.
func parseSpecRows(specJSON string) []specPageRow {
	specJSON = strings.TrimSpace(specJSON)
	if specJSON == "" {
		return nil
	}
	var spec struct {
		Pages []struct {
			Slug         string          `json:"slug"`
			OriginalSlug string          `json:"original_slug"`
			Enabled      *bool           `json:"enabled"`
			SubPages     json.RawMessage `json:"sub_pages"`
			Actions      json.RawMessage `json:"actions"`
		} `json:"pages"`
	}
	if err := json.Unmarshal([]byte(specJSON), &spec); err != nil {
		return nil
	}
	rows := make([]specPageRow, 0, len(spec.Pages))
	for _, p := range spec.Pages {
		if p.Enabled != nil && !*p.Enabled {
			continue
		}
		row := specPageRow{slug: strings.TrimSpace(p.Slug), originalSlug: strings.TrimSpace(p.OriginalSlug), enabled: true}
		// sub_pages may be an inline array or a JSON-encoded string (legacy
		// shape) — decode both, degrade to empty on anything else.
		raw := []byte(p.SubPages)
		if len(raw) > 0 && raw[0] == '"' {
			var encoded string
			if json.Unmarshal(raw, &encoded) == nil {
				raw = []byte(encoded)
			}
		}
		var subs []struct {
			Path string `json:"path"`
		}
		if len(raw) > 0 && json.Unmarshal(raw, &subs) == nil {
			for _, s := range subs {
				if s.Path != "" {
					row.subPages = append(row.subPages, s.Path)
				}
			}
		}
		// Same dual shape for actions (inline array or encoded string).
		araw := []byte(p.Actions)
		if len(araw) > 0 && araw[0] == '"' {
			var encoded string
			if json.Unmarshal(araw, &encoded) == nil {
				araw = []byte(encoded)
			}
		}
		if len(araw) > 0 {
			var defs []map[string]any
			if json.Unmarshal(araw, &defs) == nil {
				row.actions = defs
			}
		}
		rows = append(rows, row)
	}
	return rows
}

// findSpecPageRow resolves `pageSlug` against parsed spec rows using the SAME
// precedence as the SPA's isPageAllowed: exact slug, then legacy
// original_slug, then nested sub-page ("<parent>/<path>") through its enabled
// parent row. Returns the owning row (a sub-page inherits its parent's saved
// actions) or nil when the slug is not allowed.
func findSpecPageRow(rows []specPageRow, pageSlug string) *specPageRow {
	for i := range rows {
		if rows[i].slug == pageSlug || (rows[i].originalSlug != "" && rows[i].originalSlug == pageSlug) {
			return &rows[i]
		}
	}
	// Nested sub-page resolution: "<parent>/<path>" at the FIRST slash.
	idx := strings.Index(pageSlug, "/")
	if idx <= 0 || idx == len(pageSlug)-1 {
		return nil
	}
	parent, path := pageSlug[:idx], pageSlug[idx+1:]
	for i := range rows {
		if rows[i].slug != parent {
			continue
		}
		for _, sp := range rows[i].subPages {
			if sp == path {
				return &rows[i]
			}
		}
	}
	return nil
}
