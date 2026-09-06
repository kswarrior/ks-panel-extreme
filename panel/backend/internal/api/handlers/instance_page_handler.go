package handlers

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/pagelib"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// errString is a helper to create an error from a string.
type errString string

func (e errString) Error() string { return string(e) }

// newErrString returns an error formatted as a string.
func newErrString(s string) error { return errString(s) }

// ============================== INSTANCE PAGES ==============================
//
// Instance Pages are reusable page definitions for instance templates.
// Admins create these to provide custom documentation, dashboards, or
// configuration UIs within the instance panel sidebar.

type instancePageDTO struct {
	Name            string `json:"name"`
	Slug            string `json:"slug"`
	Kind            string `json:"kind"`
	Category        string `json:"category"`
	// Type classifies the page flavor (dashboard, status, docs, …) —
	// persisted as the page_type column. "" == unset.
	Type            string `json:"type"`
	Description     string `json:"description"`
	ContentType     string `json:"content_type"`
	ContentHTML     string `json:"content_html"`
	ContentMarkdown string `json:"content_markdown"`
	ContentBlocks   string `json:"content_blocks"`
	IconSVG         string `json:"icon_svg"`
	// IconColor is an optional #rrggbb accent tinting the tile (060).
	IconColor string `json:"icon_color"`
	// Actions is a JSON array of executable page actions ("" == none).
	Actions string `json:"actions"`
	// SubPages is a JSON array of extra page definitions that ship with this
	// page — multi-page support (e.g. Files carrying files/edit). Each entry:
	// {"path","name","content_type","content_html","content_markdown",
	//  "content_blocks"}; the effective slug is "<slug>/<path>". "" == none.
	SubPages string `json:"sub_pages"`
	// Components is a JSON array of reusable UI blocks authored in the
	// Studio's Components tab: {"name","type","description","content"}.
	// Page content references them with {{component:name}}. "" == none.
	Components string `json:"components"`
	// Configure is a JSON array of page-level env-style var definitions
	// ({name,label,description,default,required,rule,display,options,…})
	// authored in the Studio's Configure tab (like the template editor's
	// Env Variables). "" == none.
	Configure string `json:"configure"`
}

// validInstancePageKinds lists the page kinds a stored row may carry. The
// legacy "builtin" kind is gone: every built-in instance sub-page was
// converted to a self-contained custom page template in the Instance Page
// Studio and migration 046 purged the old rows, so new builtin rows are
// rejected to keep them from coming back.
var validInstancePageKinds = map[string]bool{
	"custom": true,
}

// defaultInstancePageKind is applied when a request omits `kind` entirely
// (older import payloads / API callers).
const defaultInstancePageKind = "custom"

var validContentTypes = map[string]bool{
	"html":     true,
	"markdown": true,
	"blocks":   true,
}

// Page provenance sources for the library badges: "studio" (own pages incl.
// Studio/file/URL creates), "market" (fresh marketplace import, unmodified),
// "edited" (market import later modified in the Studio). "" == "studio".
const (
	pageSourceStudio = "studio"
	pageSourceMarket = "market"
	pageSourceEdited = "edited"
)

// normalizePageSource coerces any stored source value to a known badge.
func normalizePageSource(s string) string {
	switch s {
	case pageSourceMarket:
		return pageSourceMarket
	case pageSourceEdited:
		return pageSourceEdited
	default:
		return pageSourceStudio
	}
}

// maxInstancePageActionsBytes caps the persisted actions JSON so a single
// page definition can't balloon the DB row or the template spec.
const maxInstancePageActionsBytes = 64 * 1024

// Content budget per page definition. Generous for rich pages, but hard-capped
// so a single import can't wedge the DB row or the browser.
const (
	maxInstancePageContentBytes = 1024 * 1024 // 1MB per content field
	maxInstancePageIconBytes    = 16 * 1024   // 16KB for the inline SVG icon
	maxInstancePageNameLen      = 200
	maxInstancePageDescLen      = 500
)

// validSlug reports whether s is a safe top-level page slug: it becomes a URL
// path segment in the SPA (/instances/<id>/<slug>) so it must never contain a
// slash or traversal sequence. The bare "." slug is the reserved Home page.
func validSlug(s string) bool {
	if s == "." {
		return true
	}
	if len(s) == 0 || len(s) > 64 || strings.Contains(s, "/") || strings.Contains(s, "..") {
		return false
	}
	if !slugStartRe.MatchString(s[:1]) || !slugBodyRe.MatchString(s) {
		return false
	}
	return true
}

var (
	slugStartRe = regexp.MustCompile(`^[A-Za-z0-9]$`)
	slugBodyRe  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
)

// icon SVG sanitization: icons are rendered INLINE in the panel host origin
// (sidebar tabs, cards, pickers), so anything script-capable must be stripped
// before storage. Rules mirror the frontend sanitizeSvgIcon utility.
var (
	iconDangerousElementRe = regexp.MustCompile(`(?is)<\s*/?\s*(script|foreignObject|iframe|object|embed|animate|set|handler)\b[^>]*>?`)
	iconEventHandlerRe     = regexp.MustCompile(`(?i)\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	iconJSURLRe            = regexp.MustCompile(`(?i)(href|xlink:href|src|from|to|values|style)\s*=\s*("\s*(javascript|vbscript|data:text/html)[^"]*"|\s*'(javascript|vbscript|data:text/html)[^']*'|(?:javascript|vbscript|data:text/html)[^\s>]*)`)
	iconUseExternalRefRe   = regexp.MustCompile(`(?i)(xlink:href|href)\s*=\s*("[^"#][^"]*"|'[^#'][^']*'|[^"#\s>][^\s>]*)`)
)

// sanitizeIconSVG strips script-execution vectors from an author-supplied SVG
// icon (inner markup or full <svg> document): dangerous elements, event
// handler attributes, javascript:/vbscript:/data:text/html URLs and external
// references. Runs to a fixpoint so nested/malformed payloads can't reassemble
// a stripped construct after one pass.
func sanitizeIconSVG(raw string) string {
	prev := raw
	for i := 0; i < 10; i++ {
		cur := iconDangerousElementRe.ReplaceAllString(prev, "")
		cur = iconEventHandlerRe.ReplaceAllString(cur, "")
		cur = iconJSURLRe.ReplaceAllString(cur, "")
		cur = iconUseExternalRefRe.ReplaceAllString(cur, `$1="#"`)
		if cur == prev {
			break
		}
		prev = cur
	}
	return prev
}

// validateBlocksJSON checks that non-empty content_blocks is a JSON array of
// block objects (the shape renderBlocks expects).
func validateBlocksJSON(raw string) error {
	if raw == "" {
		return nil
	}
	var arr []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return newErrString("content_blocks must be a JSON array of block objects")
	}
	return nil
}

// Sub-page (multi-page) limits: generous content budget per family, hard cap
// on the number of sub-pages so the sidebar/tab bar stays sane.
const (
	maxInstancePageSubPagesBytes = 512 * 1024
	maxInstancePageSubPages      = 20
)

// Component limits: generous content budget per page, hard cap on component
// count so the definition stays manageable and render-time substitution is
// bounded.
const (
	maxInstancePageComponentsBytes = 512 * 1024
	maxInstancePageComponents      = 50
	maxInstancePageComponentNameLen = 64
)

var validComponentTypes = map[string]bool{
	"html":     true,
	"markdown": true,
	"block":    true,
}

// validComponentName reports whether s is a safe component name for
// {{component:name}} substitution: starts with alphanumeric/underscore,
// contains only alphanumeric/underscore/dash, max 64 chars.
func validComponentName(s string) bool {
	if s == "" || len(s) > maxInstancePageComponentNameLen {
		return false
	}
	if !componentStartRe.MatchString(s[:1]) || !componentBodyRe.MatchString(s) {
		return false
	}
	return true
}

var (
	componentStartRe = regexp.MustCompile(`^[A-Za-z0-9_]$`)
	componentBodyRe  = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_-]*$`)
)

// instancePageSubPage mirrors one entry of the persisted sub_pages JSON.
type instancePageSubPage struct {
	Path            string `json:"path"`
	Name            string `json:"name"`
	ContentType     string `json:"content_type"`
	ContentHTML     string `json:"content_html"`
	ContentMarkdown string `json:"content_markdown"`
	ContentBlocks   string `json:"content_blocks"`
}

// validateSubPages checks the persisted sub_pages JSON shape: an array of at
// most maxInstancePageSubPages entries, each carrying a URL-safe single-segment
// path ([a-z0-9_-]+), a display name and a known content_type.
func validateSubPages(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > maxInstancePageSubPagesBytes {
		return newErrString("sub_pages too large (max 512KB of JSON)")
	}
	var arr []instancePageSubPage
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return newErrString("sub_pages must be a JSON array of page definitions")
	}
	if len(arr) > maxInstancePageSubPages {
		return newErrString(fmt.Sprintf("too many sub-pages (max %d)", maxInstancePageSubPages))
	}
	seen := make(map[string]bool, len(arr))
	for _, s := range arr {
		if !validSubPagePath(s.Path) {
			return newErrString("sub-page path must be a single lowercase segment of letters, numbers, dashes or underscores")
		}
		if seen[s.Path] {
			return newErrString("duplicate sub-page path: " + s.Path)
		}
		seen[s.Path] = true
		if s.Name == "" {
			return newErrString("sub-page name is required")
		}
		if s.ContentType != "" && !validContentTypes[s.ContentType] {
			return newErrString("sub-page content_type must be one of: html, markdown, blocks")
		}
	}
	return nil
}

// instancePageComponent mirrors one entry of the persisted components JSON.
type instancePageComponent struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Content     string `json:"content"`
}

// validateComponentsJSON checks that non-empty components is a JSON array of
// component objects with valid names and known types.
func validateComponentsJSON(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > maxInstancePageComponentsBytes {
		return newErrString("components too large (max 512KB of JSON)")
	}
	var arr []instancePageComponent
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return newErrString("components must be a JSON array of component objects")
	}
	if len(arr) > maxInstancePageComponents {
		return newErrString(fmt.Sprintf("too many components (max %d)", maxInstancePageComponents))
	}
	seen := make(map[string]bool, len(arr))
	for _, c := range arr {
		if !validComponentName(c.Name) {
			return newErrString("component name must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes (max 64 chars)")
		}
		if seen[c.Name] {
			return newErrString("duplicate component name: " + c.Name)
		}
		seen[c.Name] = true
		if c.Type != "" && !validComponentTypes[c.Type] {
			return newErrString("component type must be one of: html, markdown, block")
		}
		if len(c.Content) > maxInstancePageContentBytes {
			return newErrString("component content too large (max 1MB)")
		}
	}
	return nil
}

// Configure (page-level env vars) limits: like template env vars, bounded
// so the definition stays manageable and the template editor's per-page
// value form stays sane.
const (
	maxInstancePageConfigureBytes = 512 * 1024
	maxInstancePageConfigure      = 50
)

var validConfigureDisplay = map[string]bool{
	"text":     true,
	"number":   true,
	"select":   true,
	"checkbox": true,
	"toggle":   true,
}

// validConfigureName reports whether s is a safe env-style variable name
// for Configure vars: starts with letter/underscore, contains only
// alphanum/underscore, max 64.
func validConfigureName(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	if !(s[0] == '_' || (s[0] >= 'A' && s[0] <= 'Z') || (s[0] >= 'a' && s[0] <= 'z')) {
		return false
	}
	for _, r := range s {
		if !(r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

// instancePageConfigure mirrors one entry of the persisted configure JSON
// (page-level EnvVariable-style definition).
type instancePageConfigure struct {
	Name         string `json:"name"`
	Label        string `json:"label"`
	Description  string `json:"description"`
	Default      string `json:"default"`
	UserViewable bool   `json:"user_viewable"`
	UserEditable bool   `json:"user_editable"`
	Required     bool   `json:"required"`
	Rule         string `json:"rule"`
	Display      string `json:"display"`
	Options      string `json:"options"`
	Append       bool   `json:"append"`
	Prepend      string `json:"prepend"`
	AppendValue  string `json:"append_value"`
}

// validateConfigureJSON checks that non-empty configure is a JSON array of
// env-style var objects with valid names and known display types.
func validateConfigureJSON(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > maxInstancePageConfigureBytes {
		return newErrString("configure too large (max 512KB of JSON)")
	}
	var arr []instancePageConfigure
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return newErrString("configure must be a JSON array of variable objects")
	}
	if len(arr) > maxInstancePageConfigure {
		return newErrString(fmt.Sprintf("too many configure variables (max %d)", maxInstancePageConfigure))
	}
	seen := make(map[string]bool, len(arr))
	for _, c := range arr {
		if !validConfigureName(c.Name) {
			return newErrString("configure variable name must start with a letter or underscore and contain only letters, numbers or underscores (max 64 chars)")
		}
		if seen[c.Name] {
			return newErrString("duplicate configure variable name: " + c.Name)
		}
		seen[c.Name] = true
		if c.Display != "" && !validConfigureDisplay[c.Display] {
			return newErrString("configure variable display must be one of: text, number, select, checkbox, toggle")
		}
		if len(c.Label) > 200 {
			return newErrString("configure variable label too long (max 200)")
		}
		if len(c.Description) > 500 {
			return newErrString("configure variable description too long (max 500)")
		}
		if len(c.Default) > 2000 {
			return newErrString("configure variable default too long (max 2000)")
		}
	}
	return nil
}

// validSubPagePath reports whether p is a safe single URL path segment for a
// sub-page. Strictly lowercase so slugs stay deterministic across dialects.
func validSubPagePath(p string) bool {
	if p == "" || len(p) > 64 {
		return false
	}
	for _, r := range p {
		if !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '-' && r != '_' {
			return false
		}
	}
	return true
}

// isDuplicateSlugError reports whether errMsg signals a UNIQUE violation on instance_pages.slug
// across SQLite (UNIQUE constraint failed), MySQL (Duplicate entry) and Postgres
// (duplicate key value violates unique constraint).
func isDuplicateSlugError(errMsg string) bool {
	low := strings.ToLower(errMsg)
	return strings.Contains(low, "duplicate") || strings.Contains(low, "unique")
}

func validateInstancePage(req instancePageDTO) (instancePageDTO, error) {
	if req.Name == "" {
		return req, newErrString("name is required")
	}
	if len(req.Name) > maxInstancePageNameLen {
		return req, newErrString(fmt.Sprintf("name too long (max %d characters)", maxInstancePageNameLen))
	}
	if len(req.Description) > maxInstancePageDescLen {
		return req, newErrString(fmt.Sprintf("description too long (max %d characters)", maxInstancePageDescLen))
	}
	if len(req.Category) > maxInstancePageDescLen {
		return req, newErrString(fmt.Sprintf("category too long (max %d characters)", maxInstancePageDescLen))
	}
	if len(req.Type) > maxInstancePageDescLen {
		return req, newErrString(fmt.Sprintf("type too long (max %d characters)", maxInstancePageDescLen))
	}
	if req.Slug == "" {
		return req, newErrString("slug is required")
	}
	if !validSlug(req.Slug) {
		return req, newErrString("slug must start with a letter or number and contain only letters, numbers, dots, dashes or underscores (max 64 chars)")
	}
	if len(req.ContentHTML) > maxInstancePageContentBytes {
		return req, newErrString("content_html too large (max 1MB)")
	}
	if len(req.ContentMarkdown) > maxInstancePageContentBytes {
		return req, newErrString("content_markdown too large (max 1MB)")
	}
	if len(req.ContentBlocks) > maxInstancePageContentBytes {
		return req, newErrString("content_blocks too large (max 1MB)")
	}
	if err := validateBlocksJSON(req.ContentBlocks); err != nil {
		return req, err
	}
	if len(req.IconSVG) > maxInstancePageIconBytes {
		return req, newErrString("icon_svg too large (max 16KB)")
	}
	// Icons render inline in the panel origin — store only sanitized markup.
	req.IconSVG = sanitizeIconSVG(strings.TrimSpace(req.IconSVG))
	if req.IconColor != "" && !validNodeColorHex(strings.TrimSpace(req.IconColor)) {
		return req, newErrString("icon_color must be a #rrggbb hex value")
	}
	req.IconColor = strings.ToUpper(strings.TrimSpace(req.IconColor))
	if req.Kind == "" {
		req.Kind = defaultInstancePageKind
	}
	if !validInstancePageKinds[req.Kind] {
		return req, newErrString("kind must be \"custom\" (built-in pages were converted to custom library pages)")
	}
	if req.ContentType != "" && !validContentTypes[req.ContentType] {
		return req, newErrString("content_type must be one of: html, markdown, blocks")
	}
	if req.Actions != "" {
		if len(req.Actions) > maxInstancePageActionsBytes {
			return req, newErrString("actions too large (max 64KB of JSON)")
		}
		var arr []json.RawMessage
		if err := json.Unmarshal([]byte(req.Actions), &arr); err != nil {
			return req, newErrString("actions must be a JSON array")
		}
	}
	if err := validateSubPages(req.SubPages); err != nil {
		return req, err
	}
	if err := validateComponentsJSON(req.Components); err != nil {
		return req, err
	}
	if err := validateConfigureJSON(req.Configure); err != nil {
		return req, err
	}
	return req, nil
}

// ListInstancePagesHandler returns every instance page for the admin UI.
func ListInstancePagesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	pages, err := repository.NewInstancePageRepository(con).List()
	if err != nil {
		log.Println("ListInstancePages error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): INSTANCE_PAGES_OWN → only pages
	// the caller authored; INSTANCE_PAGES_ALL / MANAGE_INSTANCE_PAGES
	// umbrella → full library.
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
		if !hasAll && hasOwn {
			filtered := make([]models.InstancePage, 0, len(pages))
			for _, p := range pages {
				if p.OwnerID == uid {
					filtered = append(filtered, p)
				}
			}
			writeJSON(w, filtered)
			return
		}
	}
	writeJSON(w, pages)
}

// GetInstancePageHandler returns a single instance page by id.
func GetInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	page, err := repository.NewInstancePageRepository(con).Get(id)
	if err != nil || page == nil {
		http.Error(w, "instance page not found", http.StatusNotFound)
		return
	}
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
		if !hasAll && hasOwn && page.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	writeJSON(w, page)
}

// CreateInstancePageHandler inserts a new instance page after validating.
func CreateInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	var req instancePageDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req, err := validateInstancePage(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ContentType == "" {
		req.ContentType = "markdown"
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	ownerID, _ := UserIDFromContext(r)
	id, err := repository.NewInstancePageRepository(con).Create(repository.InstancePageInput{
		Name:            req.Name,
		Slug:            req.Slug,
		Kind:            req.Kind,
		Category:        req.Category,
		PageType:        req.Type,
		Description:     req.Description,
		ContentType:     req.ContentType,
		ContentHTML:     req.ContentHTML,
		ContentMarkdown: req.ContentMarkdown,
		ContentBlocks:   req.ContentBlocks,
		IconSVG:         req.IconSVG,
		IconColor:       req.IconColor,
		Actions:         req.Actions,
		SubPages:        req.SubPages,
		Components:      req.Components,
		Configure:       req.Configure,
		OwnerID:           ownerID,
		Source:            pageSourceStudio,
	})
	if err != nil {
		log.Println("CreateInstancePage error:", err)
		// Check for unique constraint violation (slug already exists) across dialects
		errMsg := err.Error()
		if isDuplicateSlugError(errMsg) {
			http.Error(w, "slug already exists", http.StatusConflict)
		} else if strings.Contains(errMsg, "NOT NULL constraint failed") {
			http.Error(w, "required field missing: "+errMsg, http.StatusBadRequest)
		} else {
			http.Error(w, "could not create instance page: "+errMsg, http.StatusInternalServerError)
		}
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "create",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("created instance page %q (slug=%s, kind=%s)", req.Name, req.Slug, req.Kind),
	})
	writeJSON(w, map[string]any{"id": id})
}

// UpdateInstancePageHandler patches an editable instance page.
func UpdateInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req instancePageDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req, err = validateInstancePage(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// Ownership scope (migration 054): instance-pages own → may only edit own pages.
	repo := repository.NewInstancePageRepository(con)
	var prevSource, prevMarketID, prevMarketVersion string
	if ex, gerr := repo.Get(id); gerr == nil && ex != nil {
		prevSource = normalizePageSource(ex.Source)
		prevMarketID = ex.MarketID
		prevMarketVersion = ex.MarketVersion
	}
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
		if !hasAll && hasOwn {
			if ex, gerr := repo.Get(id); gerr == nil && ex != nil && ex.OwnerID != uid {
				http.Error(w, "forbidden: own-scope may only edit instance pages you authored", http.StatusForbidden)
				return
			}
		}
	}
	// Provenance flip: editing a fresh market page marks it edited so the
	// library badge flips market → edited. Edited stays edited, studio
	// stays studio.
	nextSource := prevSource
	if prevSource == pageSourceMarket {
		nextSource = pageSourceEdited
	} else if prevSource == "" {
		nextSource = pageSourceStudio
	}
	if err := repo.Update(id, repository.InstancePageInput{
		Name:            req.Name,
		Slug:            req.Slug,
		Kind:            req.Kind,
		Category:        req.Category,
		PageType:        req.Type,
		Description:     req.Description,
		ContentType:     req.ContentType,
		ContentHTML:     req.ContentHTML,
		ContentMarkdown: req.ContentMarkdown,
		ContentBlocks:   req.ContentBlocks,
		IconSVG:         req.IconSVG,
		IconColor:       req.IconColor,
		Actions:         req.Actions,
		SubPages:        req.SubPages,
		Components:      req.Components,
		Configure:       req.Configure,
		Source:          nextSource,
		MarketID:        prevMarketID,
		MarketVersion:   prevMarketVersion,
	}); err != nil {
		if isDuplicateSlugError(err.Error()) {
			http.Error(w, "slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("updated instance page %q (slug=%s)", req.Name, req.Slug),
	})
	w.WriteHeader(http.StatusNoContent)
}

// DeleteInstancePageHandler removes an instance page.
func DeleteInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewInstancePageRepository(con)
	var label string
	var ownerID int64
	if existing, gerr := repo.Get(id); gerr == nil && existing != nil {
		label = existing.Name
		ownerID = existing.OwnerID
	}
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
		if !hasAll && hasOwn && ownerID != uid {
			http.Error(w, "forbidden: own-scope may only delete instance pages you authored", http.StatusForbidden)
			return
		}
	}
	if err := repo.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted instance page %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// BulkCreateInstancePagesHandler creates multiple instance pages in a single
// request/transaction. This is the fast-path for the Instance Pages
// "Add Instance Page → Import → Select all visible → Import" flow.
//
// The old frontend looped `createInstancePage` sequentially — N round-trips,
// N OpenDB calls and N JSON validates (~ N * 30-80ms). For 20+ starters or
// template pages that could exceed 10s and even trigger proxy timeouts.
//
// This handler accepts up to 100 pages at once, validates each with the same
// `validateInstancePage` gate as the single-create path, pre-loads existing
// slugs to skip duplicates without hitting UNIQUE errors, and inserts the
// rest inside one DB transaction on a single connection. The result mirrors
// the per-page loop semantics (imported/skipped/errors) but finishes in a
// single HTTP round-trip (< 500ms for 30 pages).
//
// Payload: { pages: instancePageDTO[] }
// Response: { imported: number, skipped: number, errors: string[], ids: number[] }
func BulkCreateInstancePagesHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Pages []instancePageDTO `json:"pages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Pages) == 0 {
		http.Error(w, "pages is required and must not be empty", http.StatusBadRequest)
		return
	}
	if len(req.Pages) > 100 {
		http.Error(w, "too many pages (max 100 per request)", http.StatusBadRequest)
		return
	}

	// Ownership (migration 054, mirrors CreateInstancePageHandler and
	// repo.Create): attribute bulk rows to the caller. 0 stays NULL/orphan.
	ownerID, _ := UserIDFromContext(r)

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Pre-load existing slugs so we can skip without UNIQUE constraint hits.
	// Rows is closed before Begin to avoid holding a read cursor across the
	// write transaction (SQLite: "database is locked" if cursor stays open).
	existing := make(map[string]bool)
	if rows, qerr := con.Query(`SELECT slug FROM instance_pages`); qerr == nil {
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err == nil {
				existing[s] = true
			}
		}
		rows.Close()
	}

	tx, err := con.Begin()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()

	var stmt *sql.Stmt
	if ownerID != 0 {
		stmt, err = tx.Prepare(`INSERT INTO instance_pages (name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, icon_svg, icon_color, actions, sub_pages, components, configure, owner_id, source, market_id, market_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	} else {
		stmt, err = tx.Prepare(`INSERT INTO instance_pages (name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, icon_svg, icon_color, actions, sub_pages, components, configure, source, market_id, market_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	}
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	imported := 0
	skipped := 0
	var errs []string
	var ids []int64

	for idx, raw := range req.Pages {
		dto, verr := validateInstancePage(raw)
		if verr != nil {
			errs = append(errs, fmt.Sprintf("pages[%d] (%s): %s", idx, raw.Slug, verr.Error()))
			continue
		}
		if dto.ContentType == "" {
			dto.ContentType = "markdown"
		}
		if existing[dto.Slug] {
			skipped++
			continue
		}
		var res sql.Result
		var eerr error
		if ownerID != 0 {
			res, eerr = stmt.Exec(dto.Name, dto.Slug, dto.Kind, dto.Category, dto.Type, dto.Description, dto.ContentType, dto.ContentHTML, dto.ContentMarkdown, dto.ContentBlocks, dto.IconSVG, dto.IconColor, dto.Actions, dto.SubPages, dto.Components, dto.Configure, ownerID, pageSourceStudio, "", "")
		} else {
			res, eerr = stmt.Exec(dto.Name, dto.Slug, dto.Kind, dto.Category, dto.Type, dto.Description, dto.ContentType, dto.ContentHTML, dto.ContentMarkdown, dto.ContentBlocks, dto.IconSVG, dto.IconColor, dto.Actions, dto.SubPages, dto.Components, dto.Configure, pageSourceStudio, "", "")
		}
		if eerr != nil {
			if isDuplicateSlugError(eerr.Error()) {
				skipped++
				existing[dto.Slug] = true
				continue
			}
			errs = append(errs, fmt.Sprintf("pages[%d] (%s): %s", idx, dto.Slug, eerr.Error()))
			continue
		}
		id, _ := res.LastInsertId()
		if id != 0 {
			ids = append(ids, id)
		}
		existing[dto.Slug] = true
		imported++
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "could not commit bulk insert: "+err.Error(), http.StatusInternalServerError)
		return
	}
	tx = nil

	if imported > 0 {
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryTemplate,
			Action:      "bulk_create",
			TargetLabel: fmt.Sprintf("%d pages", imported),
			Message:     fmt.Sprintf("bulk created %d instance page(s) (skipped %d, errors %d)", imported, skipped, len(errs)),
		})
	}

	writeJSON(w, map[string]any{
		"imported": imported,
		"skipped":  skipped,
		"errors":   errs,
		"ids":      ids,
	})
}

// LinkInstancePageHandler attaches an instance page (by id) to one or more
// templates. For every template_id in the request it loads the template spec,
// merges a new (or replaces an existing) custom page entry whose slug equals
// the instance page's slug, copies the instance page's content payload (so the
// page renders without a second round-trip), and persists the spec back. This
// is the "Link to Templates" flow triggered from the InstancePageForm: the
// admin designs a reusable page once, then attaches it to any number of
// templates' spec.pages for the Instance panel to render.
//
// Spec-page entry shape written (kept in sync with the shape produced by
// TemplateForm.parseSpec / serializeSpec for kind='custom' rows):
//
//	{
//	  slug:           <InstancePage.Slug>,
//	  original_slug:  "",
//	  kind:           "custom",
//	  label:          <label | InstancePage.Name>,
//	  icon_svg:       <icon_svg | ""> ,
//	  enabled:        <true unless body says otherwise>,
//	  content_type:   <InstancePage.ContentType>,
//	  content_html:   <InstancePage.ContentHTML>,
//	  content_markdown:<InstancePage.ContentMarkdown>,
//	  content_blocks: <InstancePage.ContentBlocks>,
//	}
type linkInstancePageReq struct {
	TemplateIDs []int64 `json:"template_ids"`
	Label       string  `json:"label"`
	IconSVG     string  `json:"icon_svg"`
	IconColor   string  `json:"icon_color"`
	Enabled     *bool   `json:"enabled"`
}

func LinkInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req linkInstancePageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if len(req.TemplateIDs) == 0 {
		http.Error(w, "template_ids is required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	pageRepo := repository.NewInstancePageRepository(con)
	page, gerr := pageRepo.Get(id)
	if gerr != nil || page == nil {
		http.Error(w, "instance page not found", http.StatusNotFound)
		return
	}

	tmplRepo := repository.NewTemplateRepository(con)
	linked := make([]int64, 0, len(req.TemplateIDs))
	skipped := make([]int64, 0)
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	label := req.Label
	if label == "" {
		label = page.Name
	}

	// Parse the persisted sub_pages JSON (validated at save time). A row with
	// corrupt sub_pages still links its main page — subs are additive.
	var subs []instancePageSubPage
	if page.SubPages != "" {
		_ = json.Unmarshal([]byte(page.SubPages), &subs)
	}

	for _, tid := range req.TemplateIDs {
		t, terr := tmplRepo.Get(tid)
		if terr != nil || t == nil {
			skipped = append(skipped, tid)
			continue
		}
		specStr := t.Spec
		if specStr == "" {
			specStr = "{}"
		}
		var spec map[string]any
		if jerr := json.Unmarshal([]byte(specStr), &spec); jerr != nil || spec == nil {
			spec = map[string]any{}
		}

		// Build / replace the custom-page entry for this slug. Pre-existing
		// entry on the same slug is overwritten — the admin's most recent
		// edit wins. This is the link semantics the form documents: re-linking
		// a page copies the latest lib content into the template, so a stale
		// spec never lingers.
		pageEntry := map[string]any{
			"slug":             page.Slug,
			"original_slug":    "",
			"kind":             "custom",
			"label":            label,
			"enabled":          enabled,
			"content_type":     page.ContentType,
			"content_html":     page.ContentHTML,
			"content_markdown": page.ContentMarkdown,
			"content_blocks":   page.ContentBlocks,
		}
		if page.Actions != "" {
			var actionsAny []any
			if jerr := json.Unmarshal([]byte(page.Actions), &actionsAny); jerr == nil && actionsAny != nil {
				pageEntry["actions"] = actionsAny
			}
		}
		if req.IconSVG != "" || page.IconSVG != "" {
			// Icons render inline in the panel origin — never persist unsanitized
			// author markup into the template spec.
			icon := sanitizeIconSVG(strings.TrimSpace(req.IconSVG))
			if icon == "" {
				icon = sanitizeIconSVG(strings.TrimSpace(page.IconSVG))
			}
			if icon != "" {
				pageEntry["icon_svg"] = icon
			}
		}
		if req.IconColor != "" || page.IconColor != "" {
			c := strings.ToUpper(strings.TrimSpace(req.IconColor))
			if c == "" || !validNodeColorHex(c) {
				c = strings.ToUpper(strings.TrimSpace(page.IconColor))
			}
			if c != "" && validNodeColorHex(c) {
				pageEntry["icon_color"] = c
			}
		}

		// Sub-pages stay INSIDE the family's main row (nested sub_pages,
		// effective route "<slug>/<path>", e.g. files/edit) so the instance
		// tab bar lists only the parent page — matching the SPA import flow.
		if len(subs) > 0 {
			subsAny := make([]any, 0, len(subs))
			for _, s := range subs {
				subsAny = append(subsAny, map[string]any{
					"path":             s.Path,
					"name":             s.Name,
					"content_type":     s.ContentType,
					"content_html":     s.ContentHTML,
					"content_markdown": s.ContentMarkdown,
					"content_blocks":   s.ContentBlocks,
				})
			}
			pageEntry["sub_pages"] = subsAny
		}

		// Components: copy the page's components into the spec entry so the
		// runtime can substitute {{component:name}} references when rendering.
		if page.Components != "" {
			var compsAny []any
			if jerr := json.Unmarshal([]byte(page.Components), &compsAny); jerr == nil && compsAny != nil {
				pageEntry["components"] = compsAny
			}
		}

		// Configure: copy the page's configure definitions into the spec entry so the
		// template editor can show the per-page Configure form (like env vars).
		if page.Configure != "" {
			var cfgAny []any
			if jerr := json.Unmarshal([]byte(page.Configure), &cfgAny); jerr == nil && cfgAny != nil {
				pageEntry["configure"] = cfgAny
			}
		}

		pagesAny, _ := spec["pages"].([]any)
		out := make([]any, 0, len(pagesAny)+1)
		replaced := false
		for _, p := range pagesAny {
			pm, ok := p.(map[string]any)
			if !ok {
				out = append(out, p)
				continue
			}
			s, _ := pm["slug"].(string)
			if s == page.Slug {
				// Main row of this family: replace with the fresh copy.
				out = append(out, pageEntry)
				replaced = true
				continue
			}
			if strings.HasPrefix(s, page.Slug+"/") {
				// Stale flattened sub-row from a previous link of this
				// family: drop it — sub-pages now live nested on the main
				// row and legacy sibling rows are no longer produced.
				continue
			}
			out = append(out, p)
		}
		if !replaced {
			out = append(out, pageEntry)
		}
		spec["pages"] = out

		newSpec, merr := json.Marshal(spec)
		if merr != nil {
			skipped = append(skipped, tid)
			continue
		}
		if uerr := tmplRepo.Update(tid, repository.TemplateInput{
			Name:        t.Name,
			Description: t.Description,
			Kind:        t.Kind,
			Image:       t.Image,
			Spec:        string(newSpec),
		}); uerr != nil {
			skipped = append(skipped, tid)
			continue
		}
		linked = append(linked, tid)
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryTemplate,
			Action:      "update",
			TargetID:    &tid,
			TargetLabel: t.Name,
			Message:     fmt.Sprintf("linked instance page %q (slug=%s) to template %q", page.Name, page.Slug, t.Name),
		})
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "link",
		TargetID:    &id,
		TargetLabel: page.Name,
		Message:     fmt.Sprintf("linked instance page %q to %d template(s) (skipped %d)", page.Name, len(linked), len(skipped)),
	})
	writeJSON(w, map[string]any{"linked": linked, "skipped": skipped})
}

// ExecutePageActionHandler executes an action defined on an instance page
// against a specific instance. The page action is proxied to the edge's
// page-action endpoint which runs the command inside the instance container.
func ExecutePageActionHandler(w http.ResponseWriter, r *http.Request) {
	pageID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var req struct {
		InstanceID int64             `json:"instance_id"`
		Type       string            `json:"type"`
		Command    string            `json:"command"`
		Path       string            `json:"path"`
		Content    string            `json:"content"`
		Args       []string          `json:"args"`
		Env        map[string]string `json:"env"`
		Timeout    int               `json:"timeout"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if req.InstanceID == 0 || req.Type == "" {
		http.Error(w, "instance_id and type are required", http.StatusBadRequest)
		return
	}
	if !validActionTypes[req.Type] {
		http.Error(w, "unknown action type", http.StatusBadRequest)
		return
	}
	reqTimeout := clampActionTimeout(req.Timeout)

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Get the instance to find its node and template
	instanceRepo := repository.NewInstanceRepository(con)
	instance, gerr := instanceRepo.Get(req.InstanceID)
	if gerr != nil || instance == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope: Own without All may only execute on own instances.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && instance.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	if suspended, until, _ := instanceRepo.IsInstanceSuspended(req.InstanceID); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}

	// Get the node to get edge connection info
	nodeRepo := repository.NewNodeRepository(con)
	node, nerr := nodeRepo.GetNode(instance.NodeID)
	if nerr != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}

	// Get the edge token
	token, terr := nodeRepo.PlainToken(instance.NodeID)
	if terr != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}

	// Verify the page is enabled for this instance (using instance's own config)
	// The instance's Config field contains the deploy-time snapshot (template.spec + overrides)
	var spec map[string]any
	if instance.Config != "" {
		_ = json.Unmarshal([]byte(instance.Config), &spec)
	}
	enabledPages := getEnabledPages(spec)
	pageRepo := repository.NewInstancePageRepository(con)
	page, perr := pageRepo.Get(pageID)
	if perr != nil || page == nil {
		http.Error(w, "page not found", http.StatusNotFound)
		return
	}

	pageAllowed := false
	for _, p := range enabledPages {
		if p == page.Slug {
			pageAllowed = true
			break
		}
	}
	if !pageAllowed {
		http.Error(w, "page not enabled for this instance", http.StatusForbidden)
		return
	}

	// Security: the payload must exactly match one of the page's SAVED actions.
	// The browser can only name a stored action — it can never invent new
	// commands, override arguments, or reach a page whose actions don't include
	// the requested command. Mirrors ExecuteCustomPageActionHandler.
	var actionsRaw []map[string]any
	if page.Actions != "" {
		_ = json.Unmarshal([]byte(page.Actions), &actionsRaw)
	}
	var matched map[string]any
	for _, def := range actionsRaw {
		if savedActionMatches(def, req.Type, req.Command, req.Path, req.Content, req.Args, req.Env) {
			matched = def
			break
		}
	}
	if matched == nil {
		http.Error(w, "action is not defined on this page", http.StatusForbidden)
		return
	}
	execType, execCommand, execPath, execContent, execArgs, execEnv, defTimeout, ok := savedActionExecFields(matched)
	if !ok {
		http.Error(w, "saved action definition is invalid", http.StatusForbidden)
		return
	}
	execCommand, execArgs, aerr := resolveExecPayload(matched, execType, execCommand, execArgs, req.Args)
	if aerr != nil {
		http.Error(w, aerr.Error(), http.StatusForbidden)
		return
	}
	timeout := reqTimeout
	if req.Timeout <= 0 {
		timeout = clampActionTimeout(defTimeout)
	}

	// Use the tunnel-aware edge client (honours WSS + SkipTLSVerify).
	ec := edge.NewWithTimeout(*node, token, time.Duration(timeout+5)*time.Second)
	resp, err := ec.PageAction(edge.PageActionRequest{
		Kind:    instance.Kind,
		Name:    instance.Name,
		Type:    execType,
		Command: execCommand,
		Path:    execPath,
		Content: execContent,
		Args:    execArgs,
		Env:     execEnv,
		Timeout: timeout,
	})
	if err != nil {
		log.Printf("ExecutePageActionHandler: edge page-action request failed: %v", err)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge page-action unreachable: " + err.Error(),
		})
		return
	}
	writeJSON(w, resp)
}

// validActionTypes enumerates the executable action kinds a saved page
// action may carry (mirrors the edge page-action input).
var validActionTypes = map[string]bool{
	"shell":      true,
	"read_file":  true,
	"write_file": true,
	"list_files": true,
	"docker":     true,
	"kvm":        true,
	"lxd":        true,
}

// minActionTimeout / maxActionTimeout bound the edge round-trip so neither a
// negative nor an absurd client-supplied timeout can disable the HTTP client
// deadline or wedge a panel worker for minutes.
const (
	minActionTimeout = 1
	maxActionTimeout = 600
)

// clampActionTimeout coerces t into [minActionTimeout, maxActionTimeout],
// defaulting to 30 when unset.
func clampActionTimeout(t int) int {
	if t <= 0 {
		return 30
	}
	if t < minActionTimeout {
		return minActionTimeout
	}
	if t > maxActionTimeout {
		return maxActionTimeout
	}
	return t
}

// actionStringField reads a string field from a raw saved-action definition.
func actionStringField(def map[string]any, key string) string {
	s, _ := def[key].(string)
	return s
}

// actionNumberField reads a finite number field from a raw saved-action
// definition (JSON numbers decode as float64).
func actionNumberField(def map[string]any, key string) int {
	f, _ := def[key].(float64)
	return int(f)
}

// savedActionMatches reports whether the incoming request payload is exactly
// one of the page's saved actions. Comparison covers every EXECUTABLE field
// (type/command/path/content/args/env); cosmetic fields (name, description,
// timeout) are ignored. This is the server-side trust boundary: the browser
// never picks what runs, it only names a stored action.
//
// Argument policy: by default the request's args must equal the stored args
// element-for-element. A saved action may opt in to caller-supplied
// arguments with `"open_args": true` — the request's args must then START
// with the stored prefix and may append up to maxOpenActionArgs extra
// values, which resolveExecPayload validates before anything is executed.
func savedActionMatches(def map[string]any, typ, command, path, content string, args []string, env map[string]string) bool {
	if actionStringField(def, "type") != typ {
		return false
	}
	if actionStringField(def, "command") != command ||
		actionStringField(def, "path") != path ||
		actionStringField(def, "content") != content {
		return false
	}
	// args: JSON decodes to []any — every element must be a string. The
	// stored sequence is a mandatory PREFIX; extras only pass when the def
	// opted in via open_args (count re-checked in resolveExecPayload).
	defArgsAny, _ := def["args"].([]any)
	open, _ := def["open_args"].(bool)
	if len(args) < len(defArgsAny) {
		return false
	}
	if !open && len(args) != len(defArgsAny) {
		return false
	}
	for i, a := range defArgsAny {
		if s, _ := a.(string); s != args[i] {
			return false
		}
	}
	// env: keys AND values must match exactly (nil ≡ empty).
	defEnv, _ := def["env"].(map[string]any)
	if len(defEnv) != len(env) {
		return false
	}
	for k, v := range defEnv {
		vs, ok := v.(string)
		if !ok || env[k] != vs {
			return false
		}
	}
	return true
}

// savedActionExecFields extracts the executable fields from a matched saved
// action. ok=false when the stored definition is malformed (unknown type or
// non-string command/args/env values) — such rows fail closed instead of
// being partially forwarded to the edge.
func savedActionExecFields(def map[string]any) (typ, command, path, content string, args []string, env map[string]string, timeout int, ok bool) {
	typ = actionStringField(def, "type")
	if !validActionTypes[typ] {
		return "", "", "", "", nil, nil, 0, false
	}
	command = actionStringField(def, "command")
	path = actionStringField(def, "path")
	content = actionStringField(def, "content")
	if defArgsAny, present := def["args"].([]any); present && len(defArgsAny) > 0 {
		args = make([]string, 0, len(defArgsAny))
		for _, a := range defArgsAny {
			s, isStr := a.(string)
			if !isStr {
				return "", "", "", "", nil, nil, 0, false
			}
			args = append(args, s)
		}
	}
	if defEnv, present := def["env"].(map[string]any); present && len(defEnv) > 0 {
		env = make(map[string]string, len(defEnv))
		for k, v := range defEnv {
			s, isStr := v.(string)
			if !isStr {
				return "", "", "", "", nil, nil, 0, false
			}
			env[k] = s
		}
	}
	return typ, command, path, content, args, env, actionNumberField(def, "timeout"), true
}

// maxOpenActionArgs caps how many caller-supplied values an open_args action
// may append to its stored argument prefix.
const maxOpenActionArgs = 4

// argsPlaceholder is the literal token inside a stored shell command that
// resolveExecPayload replaces with the caller-supplied arguments (properly
// single-quote-escaped). A stored command without the token rejects any
// caller-supplied extras — fail closed.
const argsPlaceholder = "{{args}}"

// validActionArg reports whether a caller-supplied argument value is safe to
// splice into a stored command. Positive charset only: alphanumerics plus a
// fixed set of harmless punctuation (dots, spaces, slashes, …). Quotes, shell
// metacharacters and control bytes are rejected outright, so even before the
// per-type escaping below nothing can break out of the stored command shape.
func validActionArg(s string) bool {
	if s == "" || len(s) > 200 {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case strings.ContainsRune(" ._/:@+=,-", r):
		default:
			return false
		}
	}
	return true
}

// shellQuoteArg single-quote escapes one value for safe interpolation into a
// POSIX shell string (same escaping the edge uses for paths).
func shellQuoteArg(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// resolveExecPayload applies a matched saved action's argument policy to the
// request payload and returns the FINAL command and argv for the edge.
//
// Without open_args the exact-match in savedActionMatches already pinned
// everything: command/args come back untouched. With open_args:
//
//   - shell: every {{args}} token in the STORED command is replaced with the
//     extra values (each shell-quoted). A stored command without the token
//     rejects any extra — silent dropping would run a different program than
//     the author wrote. Stored static args stay as trailing argv ($0…).
//   - docker/kvm/lxd: quoted extras are appended to the argv; the edge joins
//     them into its `docker <cmd> <args…>` shell line.
//   - file ops never accept extras.
func resolveExecPayload(def map[string]any, typ, command string, defArgs []string, reqArgs []string) (string, []string, error) {
	open, _ := def["open_args"].(bool)
	if !open {
		// Exact-match path: the request's args equal the stored ones.
		return command, defArgs, nil
	}
	prefixLen := len(defArgs)
	if len(reqArgs) < prefixLen {
		// savedActionMatches guarantees this; defensive only.
		return command, defArgs, newErrString("action is missing its required prefix arguments")
	}
	extras := reqArgs[prefixLen:]
	if len(extras) > maxOpenActionArgs {
		return "", nil, newErrString("action accepts at most " + strconv.Itoa(maxOpenActionArgs) + " runtime argument(s)")
	}
	for _, e := range extras {
		if !validActionArg(e) {
			return "", nil, newErrString("action argument contains unsupported characters")
		}
	}

	switch typ {
	case "shell":
		if !strings.Contains(command, argsPlaceholder) {
			if len(extras) > 0 {
				return "", nil, newErrString("action does not accept runtime arguments")
			}
			return command, defArgs, nil
		}
		quoted := make([]string, 0, len(extras))
		for _, e := range extras {
			quoted = append(quoted, shellQuoteArg(e))
		}
		return strings.ReplaceAll(command, argsPlaceholder, strings.Join(quoted, " ")), defArgs, nil
	case "docker", "kvm", "lxd":
		out := make([]string, 0, len(defArgs)+len(extras))
		out = append(out, defArgs...)
		for _, e := range extras {
			// Pre-quoted: the edge interpolates argv with spaces.Join into
			// its own sh -lc line, so quoting here keeps spaced values whole.
			out = append(out, shellQuoteArg(e))
		}
		return command, out, nil
	default: // read_file / write_file / list_files
		if len(extras) > 0 {
			return "", nil, newErrString("action does not accept runtime arguments")
		}
		return command, defArgs, nil
	}
}

// ExecuteCustomPageActionHandler executes an action from a custom page
// against a specific instance. Called directly by the custom page SDK running
// in the browser (HTML iframe bridge or host-origin markdown/blocks pages).
//
// Security model (fail closed, server-side validated):
//   - The SDK stamps every call with the slug of the page it renders
//     (`page_slug`). The slug must resolve against THIS instance's own
//     deploy-time config using the same precedence as the SPA's
//     isPageAllowed: exact slug, legacy original_slug, or a nested
//     "<parent>/<sub>" sub-page of an enabled parent row.
//   - The executed payload must EXACTLY match one of that page family's
//     SAVED actions (the spec row's `actions`, which the parent row carries).
//     The browser can only name a stored action — it can never invent new
//     commands, override arguments on a saved action, or reach an instance
//     whose config does not list the calling page.
func ExecuteCustomPageActionHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID int64             `json:"instance_id"`
		PageSlug   string            `json:"page_slug"`
		Type       string            `json:"type"`
		Command    string            `json:"command"`
		Path       string            `json:"path"`
		Content    string            `json:"content"`
		Args       []string          `json:"args"`
		Env        map[string]string `json:"env"`
		Timeout    int               `json:"timeout"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	pageSlug := strings.TrimSpace(req.PageSlug)
	if req.InstanceID == 0 || pageSlug == "" || req.Type == "" {
		http.Error(w, "instance_id, page_slug and type are required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Get the instance to find its node and template
	instanceRepo := repository.NewInstanceRepository(con)
	instance, gerr := instanceRepo.Get(req.InstanceID)
	if gerr != nil || instance == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope: Own without All may only execute on own instances.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		chk2 := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk2.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && instance.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	if suspended, until, _ := instanceRepo.IsInstanceSuspended(req.InstanceID); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}

	// Get the node to get edge connection info
	nodeRepo := repository.NewNodeRepository(con)
	node, nerr := nodeRepo.GetNode(instance.NodeID)
	if nerr != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}

	// Get the edge token
	token, terr := nodeRepo.PlainToken(instance.NodeID)
	if terr != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}

	// Page-bound gate: the calling page family must be enabled in THIS
	// instance's deploy-time config snapshot (EMPTY-BY-DEFAULT semantics).
	row := findSpecPageRow(parseSpecRows(instance.Config), pageSlug)
	if row == nil {
		http.Error(w, "page not enabled for this instance", http.StatusForbidden)
		return
	}

	// Action allow-list: the payload must be byte-for-byte one of the page's
	// saved actions. Everything actually executed below comes from the STORED
	// definition, never from the request body.
	var matched map[string]any
	for _, def := range row.actions {
		if savedActionMatches(def, req.Type, req.Command, req.Path, req.Content, req.Args, req.Env) {
			matched = def
			break
		}
	}
	if matched == nil {
		http.Error(w, "action is not defined on this page", http.StatusForbidden)
		return
	}
	execType, execCommand, execPath, execContent, execArgs, execEnv, defTimeout, ok := savedActionExecFields(matched)
	if !ok {
		http.Error(w, "saved action definition is invalid", http.StatusForbidden)
		return
	}
	// Argument policy: expand open_args actions from the request (validated,
	// quoted) or pin the payload to the stored definition.
	execCommand, execArgs, aerr := resolveExecPayload(matched, execType, execCommand, execArgs, req.Args)
	if aerr != nil {
		http.Error(w, aerr.Error(), http.StatusForbidden)
		return
	}
	// Requested timeout is operational, not executable — honour it when the
	// caller supplied one, else the stored value; always clamped.
	timeout := clampActionTimeout(req.Timeout)
	if req.Timeout <= 0 {
		timeout = clampActionTimeout(defTimeout)
	}

	// Use the tunnel-aware edge client (honours WSS + SkipTLSVerify).
	ec := edge.NewWithTimeout(*node, token, time.Duration(timeout+5)*time.Second)
	resp, err := ec.PageAction(edge.PageActionRequest{
		Kind:    instance.Kind,
		Name:    instance.Name,
		Type:    execType,
		Command: execCommand,
		Path:    execPath,
		Content: execContent,
		Args:    execArgs,
		Env:     execEnv,
		Timeout: timeout,
	})
	if err != nil {
		log.Printf("ExecuteCustomPageActionHandler: edge page-action request failed: %v", err)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge page-action unreachable: " + err.Error(),
		})
		return
	}
	writeJSON(w, resp)
}

// ExecuteModulePageActionHandler executes an action from a module-based page
// against a specific instance. Unlike ExecutePageActionHandler which requires
// a predefined instance page ID, this handler is called directly by the
// module page SDK running in the browser.
//
// Security model (fail closed, server-side validated — mirrors
// ExecuteCustomPageActionHandler):
//   - The SDK stamps every call with the id of the module it renders
//     (`module_id`). The id must resolve against THIS instance's own
//     deploy-time config (a spec.pages entry with kind == "module").
//   - The executed payload must EXACTLY match one of that module row's SAVED
//     actions. The browser can only name a stored action — it can never invent
//     new commands, override arguments on a saved action, or reach an instance
//     whose config does not enable the calling module.
func ExecuteModulePageActionHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID int64             `json:"instance_id"`
		ModuleID   string            `json:"module_id"`
		Type       string            `json:"type"`
		Command    string            `json:"command"`
		Path       string            `json:"path"`
		Content    string            `json:"content"`
		Args       []string          `json:"args"`
		Env        map[string]string `json:"env"`
		Timeout    int               `json:"timeout"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	moduleID := strings.TrimSpace(req.ModuleID)
	if req.InstanceID == 0 || moduleID == "" || req.Type == "" {
		http.Error(w, "instance_id, module_id, and type are required", http.StatusBadRequest)
		return
	}
	// Defense-in-depth: reject unknown kinds before the allow-list below.
	if !validActionTypes[req.Type] {
		http.Error(w, "unknown action type", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Get the instance to find its node and template
	instanceRepo := repository.NewInstanceRepository(con)
	instance, gerr := instanceRepo.Get(req.InstanceID)
	if gerr != nil || instance == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope: Own without All may only execute on own instances.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		chk3 := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk3.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if !hasAll && hasOwn && instance.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	if suspended, until, _ := instanceRepo.IsInstanceSuspended(req.InstanceID); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		writeJSONStatus(w, http.StatusForbidden, map[string]any{"error": msg})
		return
	}

	// Get the node to get edge connection info
	nodeRepo := repository.NewNodeRepository(con)
	node, nerr := nodeRepo.GetNode(instance.NodeID)
	if nerr != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}

	// Get the edge token
	token, terr := nodeRepo.PlainToken(instance.NodeID)
	if terr != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}

	// Verify the module is enabled for this instance (using instance's own config)
	// The instance's Config field contains the deploy-time snapshot (template.spec + overrides)
	var spec map[string]any
	if instance.Config != "" {
		_ = json.Unmarshal([]byte(instance.Config), &spec)
	}
	enabledModules := getEnabledModules(spec)
	moduleAllowed := false
	for _, m := range enabledModules {
		if m == moduleID {
			moduleAllowed = true
			break
		}
	}
	if !moduleAllowed {
		http.Error(w, "module not enabled for this instance", http.StatusForbidden)
		return
	}

	// Action allow-list: the payload must be byte-for-byte one of the calling
	// module row's saved actions. Everything actually executed below comes
	// from the STORED definition, never from the request body. Mirrors
	// ExecuteCustomPageActionHandler.
	var matched map[string]any
	for _, def := range findSpecModuleActions(instance.Config, moduleID) {
		if savedActionMatches(def, req.Type, req.Command, req.Path, req.Content, req.Args, req.Env) {
			matched = def
			break
		}
	}
	if matched == nil {
		http.Error(w, "action is not defined on this page", http.StatusForbidden)
		return
	}
	execType, execCommand, execPath, execContent, execArgs, execEnv, defTimeout, ok := savedActionExecFields(matched)
	if !ok {
		http.Error(w, "saved action definition is invalid", http.StatusForbidden)
		return
	}
	// Argument policy: expand open_args actions from the request (validated,
	// quoted) or pin the payload to the stored definition.
	execCommand, execArgs, aerr := resolveExecPayload(matched, execType, execCommand, execArgs, req.Args)
	if aerr != nil {
		http.Error(w, aerr.Error(), http.StatusForbidden)
		return
	}
	// Requested timeout is operational, not executable — honour it when the
	// caller supplied one, else the stored value; always clamped.
	timeout := clampActionTimeout(req.Timeout)
	if req.Timeout <= 0 {
		timeout = clampActionTimeout(defTimeout)
	}

	// Use the tunnel-aware edge client (honours WSS + SkipTLSVerify).
	ec := edge.NewWithTimeout(*node, token, time.Duration(timeout+5)*time.Second)
	resp, err := ec.PageAction(edge.PageActionRequest{
		Kind:     instance.Kind,
		Name:     instance.Name,
		ModuleID: req.ModuleID,
		Type:     execType,
		Command:  execCommand,
		Path:     execPath,
		Content:  execContent,
		Args:     execArgs,
		Env:      execEnv,
		Timeout:  timeout,
	})
	if err != nil {
		log.Printf("ExecuteModulePageActionHandler: edge page-module action request failed: %v", err)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge page-module action unreachable: " + err.Error(),
		})
		return
	}
	writeJSON(w, resp)
}

// getEnabledModules returns the list of enabled module IDs from the spec.
func getEnabledModules(spec map[string]any) []string {
	pages, _ := spec["pages"].([]any)
	if len(pages) == 0 {
		return []string{} // EMPTY-BY-DEFAULT: no pages = empty list
	}
	var enabled []string
	for _, p := range pages {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if pm["enabled"] == false {
			continue
		}
		if pm["kind"] == "module" {
			if moduleID, ok := pm["module_id"].(string); ok && moduleID != "" {
				enabled = append(enabled, moduleID)
			}
		}
	}
	return enabled
}

// findSpecModuleActions resolves the SAVED actions of the calling module row
// in the instance's deploy-time config snapshot: the spec.pages entry with
// kind == "module" and a matching module_id that is not explicitly disabled.
// Returns nil when the row is absent, disabled, or carries no decodable
// actions — callers treat nil as "nothing allowed" (fail closed, so a forged
// command is rejected 403). The actions dual-shape decoding (inline array or
// JSON-encoded string) mirrors parseSpecRows so module rows and custom page
// rows agree.
func findSpecModuleActions(specJSON, moduleID string) []map[string]any {
	specJSON = strings.TrimSpace(specJSON)
	moduleID = strings.TrimSpace(moduleID)
	if specJSON == "" || moduleID == "" {
		return nil
	}
	var spec struct {
		Pages []struct {
			Kind     string          `json:"kind"`
			ModuleID string          `json:"module_id"`
			Enabled  *bool           `json:"enabled"`
			Actions  json.RawMessage `json:"actions"`
		} `json:"pages"`
	}
	if err := json.Unmarshal([]byte(specJSON), &spec); err != nil {
		return nil
	}
	for _, p := range spec.Pages {
		if p.Enabled != nil && !*p.Enabled {
			continue
		}
		if p.Kind != "module" || strings.TrimSpace(p.ModuleID) != moduleID {
			continue
		}
		araw := []byte(p.Actions)
		if len(araw) > 0 && araw[0] == '"' {
			var encoded string
			if json.Unmarshal(araw, &encoded) == nil {
				araw = []byte(encoded)
			}
		}
		if len(araw) == 0 {
			return nil
		}
		var defs []map[string]any
		if json.Unmarshal(araw, &defs) != nil {
			return nil
		}
		return defs
	}
	return nil
}

// getEnabledPages returns the list of enabled page slugs from the spec.
// Uses EMPTY-BY-DEFAULT semantics matching the frontend: when the spec has
// no pages array or empty pages array, returns empty list (no pages allowed).
func getEnabledPages(spec map[string]any) []string {
	pages, _ := spec["pages"].([]any)
	if len(pages) == 0 {
		return []string{} // EMPTY-BY-DEFAULT: no pages = empty list
	}
	var enabled []string
	for _, p := range pages {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if pm["enabled"] == false {
			continue
		}
		if slug, ok := pm["slug"].(string); ok && slug != "" {
			enabled = append(enabled, slug)
		}
	}
	return enabled
}

// silence unused import guard for sql (kept for symmetry with other handlers)
var _ = sql.ErrNoRows

// ============================== IMPORT ENDPOINTS ==============================

// ImportInstancePageRequest represents a page definition for import.
type ImportInstancePageRequest struct {
	Name            string `json:"name"`
	Slug            string `json:"slug"`
	Kind            string `json:"kind"`
	Category        string `json:"category"`
	Type            string `json:"type"`
	Description     string `json:"description"`
	ContentType     string `json:"content_type"`
	ContentHTML     string `json:"content_html"`
	ContentMarkdown string `json:"content_markdown"`
	ContentBlocks   string `json:"content_blocks"`
	IconSVG         string `json:"icon_svg"`
	IconColor       string `json:"icon_color"`
	Actions         string `json:"actions"`
	// Components is a JSON array of reusable UI blocks.
	Components string `json:"components"`
	// Configure is a JSON array of page-level env-style var definitions.
	Configure string `json:"configure"`
	// SubPages is the persisted JSON-array form (API shape). Library JSON
	// files usually carry the typed `pages` array instead.
	SubPages string `json:"sub_pages"`
	// Pages carries the human-facing multi-page definitions (library JSON
	// files use this shape). Encoded into SubPages on import.
	Pages []instancePageSubPage `json:"pages"`
}

// configureJSON returns the persisted configure payload for this request.
func (r ImportInstancePageRequest) configureJSON() string {
	if r.Configure != "" {
		return r.Configure
	}
	return ""
}

// UnmarshalJSON handles both string-encoded and native array forms for
// configure/actions/components/sub_pages so studio exports (arrays) and
// shipped library files (stringified JSON) both import correctly.
func (r *ImportInstancePageRequest) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	// Extract fields that may be either string or array.
	var cfgRaw, actRaw, compRaw, subRaw json.RawMessage
	if v, ok := raw["configure"]; ok {
		cfgRaw = v
		delete(raw, "configure")
	}
	if v, ok := raw["actions"]; ok {
		actRaw = v
		// keep in raw for alias? Remove to avoid string type mismatch when it's an array.
		// Check if it's an array: first non-space char is '['
		trim := string(json.RawMessage(v))
		trim = strings.TrimSpace(trim)
		if len(trim) > 0 && trim[0] == '[' {
			delete(raw, "actions")
		}
	}
	if v, ok := raw["components"]; ok {
		compRaw = v
		trim := string(json.RawMessage(v))
		trim = strings.TrimSpace(trim)
		if len(trim) > 0 && trim[0] == '[' {
			delete(raw, "components")
		}
	}
	if v, ok := raw["sub_pages"]; ok {
		subRaw = v
		trim := string(json.RawMessage(v))
		trim = strings.TrimSpace(trim)
		if len(trim) > 0 && trim[0] == '[' {
			delete(raw, "sub_pages")
		}
	}
	remaining, _ := json.Marshal(raw)
	type Alias ImportInstancePageRequest
	var tmp Alias
	if err := json.Unmarshal(remaining, &tmp); err != nil {
		return err
	}
	*r = ImportInstancePageRequest(tmp)
	// configure: string or array
	if len(cfgRaw) > 0 {
		var asString string
		if err := json.Unmarshal(cfgRaw, &asString); err == nil {
			r.Configure = asString
		} else {
			var arr []instancePageConfigure
			if err := json.Unmarshal(cfgRaw, &arr); err == nil {
				if len(arr) > 0 {
					b, _ := json.Marshal(arr)
					r.Configure = string(b)
				}
			} else {
				// fallback: keep raw if it's an array
				trim := strings.TrimSpace(string(cfgRaw))
				if len(trim) > 0 && trim[0] == '[' {
					r.Configure = string(cfgRaw)
				}
			}
		}
	}
	if len(actRaw) > 0 {
		trim := strings.TrimSpace(string(actRaw))
		if len(trim) > 0 && trim[0] == '[' {
			// actions as native array → need to stringify
			var arr []instancePageActionDef
			if err := json.Unmarshal(actRaw, &arr); err == nil && len(arr) > 0 {
				b, _ := json.Marshal(arr)
				r.Actions = string(b)
			} else {
				r.Actions = string(actRaw)
			}
		}
		// else Actions already handled as string via alias
	}
	if len(compRaw) > 0 {
		trim := strings.TrimSpace(string(compRaw))
		if len(trim) > 0 && trim[0] == '[' {
			var arr []instancePageComponent
			if err := json.Unmarshal(compRaw, &arr); err == nil && len(arr) > 0 {
				b, _ := json.Marshal(arr)
				r.Components = string(b)
			} else {
				r.Components = string(compRaw)
			}
		}
	}
	if len(subRaw) > 0 {
		trim := strings.TrimSpace(string(subRaw))
		if len(trim) > 0 && trim[0] == '[' {
			var arr []instancePageSubPage
			if err := json.Unmarshal(subRaw, &arr); err == nil && len(arr) > 0 {
				b, _ := json.Marshal(arr)
				r.SubPages = string(b)
			} else {
				r.SubPages = string(subRaw)
			}
		}
	}
	return nil
}

// instancePageActionDef mirrors PageActionDef for import array handling.
type instancePageActionDef struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Command string `json:"command"`
	Path    string `json:"path"`
	Content string `json:"content"`
	Args    []string `json:"args"`
}

// subPagesJSON returns the persisted sub_pages payload for this request: an
// explicit sub_pages string wins, otherwise the typed pages array is encoded.
func (r ImportInstancePageRequest) subPagesJSON() string {
	if r.SubPages != "" {
		return r.SubPages
	}
	if len(r.Pages) == 0 {
		return ""
	}
	if b, err := json.Marshal(r.Pages); err == nil {
		return string(b)
	}
	return ""
}

// ImportInstancePageHandler imports an instance page from uploaded JSON.
func ImportInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form for file upload
	err := r.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		http.Error(w, "failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	var req ImportInstancePageRequest
	if err := json.NewDecoder(file).Decode(&req); err != nil {
		http.Error(w, "invalid JSON in file: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate
	dto := instancePageDTO{
		Name:            req.Name,
		Slug:            req.Slug,
		Kind:            req.Kind,
		Category:        req.Category,
		Type:            req.Type,
		Description:     req.Description,
		ContentType:     req.ContentType,
		ContentHTML:     req.ContentHTML,
		ContentMarkdown: req.ContentMarkdown,
		ContentBlocks:   req.ContentBlocks,
		IconSVG:         req.IconSVG,
		IconColor:       req.IconColor,
		Actions:         req.Actions,
		SubPages:        req.subPagesJSON(),
		Components:      req.Components,
		Configure:       req.configureJSON(),
	}
	dto, err = validateInstancePage(dto)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if dto.ContentType == "" {
		dto.ContentType = "markdown"
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	id, err := repository.NewInstancePageRepository(con).Create(repository.InstancePageInput{
		Name:            dto.Name,
		Slug:            dto.Slug,
		Kind:            dto.Kind,
		Category:        dto.Category,
		PageType:        dto.Type,
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		IconColor:       dto.IconColor,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
		Components:      dto.Components,
		Configure:       dto.Configure,
		Source:          pageSourceStudio,
	})
	if err != nil {
		log.Println("ImportInstancePage error:", err)
		errMsg := err.Error()
		if isDuplicateSlugError(errMsg) {
			http.Error(w, "slug already exists", http.StatusConflict)
		} else {
			http.Error(w, "could not create instance page: "+errMsg, http.StatusInternalServerError)
		}
		return
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "import",
		TargetID:    &id,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("imported instance page %q (slug=%s) from file", dto.Name, dto.Slug),
	})
	writeJSON(w, map[string]any{"id": id, "message": "Page imported successfully"})
}

// ============================== INSTANCE PAGE MODULES ==============================
//
// Instance Page Modules are .kspm bundles that provide fully functional UI pages
// with access to instance context, APIs, sockets, and permissions.

type instancePageModuleManifest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Author      string `json:"author"`
	License     string `json:"license"`
	Homepage    string `json:"homepage"`
	Repository  string `json:"repository"`

	Slug     string `json:"slug"`
	Kind     string `json:"kind"`
	Category string `json:"category"`

	Entry   string            `json:"entry"`
	Exports map[string]string `json:"exports"`

	Permissions         map[string][]string    `json:"permissions"`
	Capabilities        map[string]interface{} `json:"capabilities"`
	InstanceConstraints map[string]interface{} `json:"instanceConstraints"`
	UI                  map[string]interface{} `json:"ui"`
	Configuration       map[string]interface{} `json:"configuration"`
	Dependencies        map[string]interface{} `json:"dependencies"`
}

type installedInstancePageModule struct {
	Manifest    instancePageModuleManifest `json:"manifest"`
	Path        string                     `json:"path"`
	InstalledAt time.Time                  `json:"installedAt"`
	InstalledBy int64                      `json:"installedBy"`
}

// ListInstancePageModulesHandler returns all available instance page modules
// (from marketplace and local storage).
func ListInstancePageModulesHandler(w http.ResponseWriter, r *http.Request) {
	// For now, return modules from local storage only
	// TODO: Implement marketplace aggregation
	modulesDir := "instance_pages/modules"

	// Check if modules directory exists
	if _, err := os.Stat(modulesDir); os.IsNotExist(err) {
		// Create directory if it doesn't exist
		if err := os.MkdirAll(modulesDir, 0o755); err != nil {
			log.Printf("ListInstancePageModules: failed to create modules directory: %v", err)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
	}

	// Read module directories
	entries, err := os.ReadDir(modulesDir)
	if err != nil {
		log.Printf("ListInstancePageModules: failed to read modules directory: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	var modules = make([]instancePageModuleManifest, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// Check if this is a valid module directory (has manifest.json)
		manifestPath := filepath.Join(modulesDir, entry.Name(), "manifest.json")
		if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
			continue
		}

		// Read and parse manifest
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			log.Printf("ListInstancePageModules: failed to read manifest %s: %v", manifestPath, err)
			continue
		}

		var manifest instancePageModuleManifest
		if err := json.Unmarshal(data, &manifest); err != nil {
			log.Printf("ListInstancePageModules: failed to parse manifest %s: %v", manifestPath, err)
			continue
		}

		modules = append(modules, manifest)
	}

	writeJSON(w, modules)
}

// GetInstancePageModuleManifestHandler returns the manifest for a specific module version.
func GetInstancePageModuleManifestHandler(w http.ResponseWriter, r *http.Request) {
	moduleID := chi.URLParam(r, "id")
	version := chi.URLParam(r, "version")
	if moduleID == "" || version == "" {
		http.Error(w, "module id and version are required", http.StatusBadRequest)
		return
	}

	manifestPath := filepath.Join("instance_pages/modules", moduleID, version, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "module not found", http.StatusNotFound)
			return
		}
		log.Printf("GetInstancePageModuleManifest: failed to read manifest: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	var manifest instancePageModuleManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		log.Printf("GetInstancePageModuleManifest: failed to parse manifest: %v", err)
		http.Error(w, "invalid manifest", http.StatusBadRequest)
		return
	}

	writeJSON(w, manifest)
}

// UploadInstancePageModuleHandler handles uploading a .kspm file.
func UploadInstancePageModuleHandler(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form for file upload
	err := r.ParseMultipartForm(100 << 20) // 100 MB max for .kspm files
	if err != nil {
		http.Error(w, "failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Check file extension
	if !strings.HasSuffix(fileHeader.Filename, ".kspm") {
		http.Error(w, "file must be a .kspm bundle", http.StatusBadRequest)
		return
	}

	// Create a temporary directory to extract and validate the .kspm file
	tempDir, err := os.MkdirTemp("", "kspanel-module-*")
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(tempDir)

	// Extract the ZIP file
	if err := unzip(file, tempDir); err != nil {
		http.Error(w, "failed to extract .kspm file: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate manifest.json
	manifestPath := filepath.Join(tempDir, "manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		http.Error(w, "invalid .kspm bundle: missing manifest.json", http.StatusBadRequest)
		return
	}

	var manifest instancePageModuleManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		http.Error(w, "invalid .kspm bundle: invalid manifest.json", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if manifest.ID == "" || manifest.Name == "" || manifest.Version == "" {
		http.Error(w, "invalid .kspm bundle: missing required manifest fields", http.StatusBadRequest)
		return
	}

	// Create module directory in storage
	moduleDir := filepath.Join("instance_pages/modules", manifest.ID, manifest.Version)
	if err := os.MkdirAll(moduleDir, 0o755); err != nil {
		log.Printf("UploadInstancePageModule: failed to create module directory: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// Copy files from temp directory to module directory
	if err := copyDirectory(tempDir, moduleDir); err != nil {
		log.Printf("UploadInstancePageModule: failed to copy module files: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// Record activity (we don't have a user ID here, so use 0 for system)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "upload_module",
		TargetID:    nil,
		TargetLabel: manifest.Name,
		Message:     fmt.Sprintf("uploaded instance page module %s@%s", manifest.Name, manifest.Version),
	})

	writeJSON(w, map[string]any{
		"id":      manifest.ID,
		"name":    manifest.Name,
		"version": manifest.Version,
		"message": "Module uploaded successfully",
	})
}

// InstallInstancePageModuleHandler installs a module from the marketplace.
func InstallInstancePageModuleHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ModuleID string `json:"module_id"`
		Version  string `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.ModuleID == "" || req.Version == "" {
		http.Error(w, "module_id and version are required", http.StatusBadRequest)
		return
	}

	// TODO: Implement marketplace download and install
	// For now, just check if the module exists locally
	manifestPath := filepath.Join("instance_pages/modules", req.ModuleID, req.Version, "manifest.json")
	if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
		http.Error(w, "module not found in local storage", http.StatusNotFound)
		return
	}

	// Module is already installed if it exists in local storage
	// In a full implementation, we would download from marketplace here

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "install_module",
		TargetID:    nil,
		TargetLabel: req.ModuleID,
		Message:     fmt.Sprintf("installed instance page module %s@%s", req.ModuleID, req.Version),
	})

	writeJSON(w, map[string]any{
		"module_id": req.ModuleID,
		"version":   req.Version,
		"message":   "Module installed successfully",
	})
}

// UninstallInstancePageModuleHandler removes an installed module.
func UninstallInstancePageModuleHandler(w http.ResponseWriter, r *http.Request) {
	moduleID := chi.URLParam(r, "id")
	version := chi.URLParam(r, "version")
	if moduleID == "" || version == "" {
		http.Error(w, "module id and version are required", http.StatusBadRequest)
		return
	}

	moduleDir := filepath.Join("instance_pages/modules", moduleID, version)
	if err := os.RemoveAll(moduleDir); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "module not found", http.StatusNotFound)
			return
		}
		log.Printf("UninstallInstancePageModule: failed to remove module directory: %v", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "uninstall_module",
		TargetID:    nil,
		TargetLabel: moduleID,
		Message:     fmt.Sprintf("uninstalled instance page module %s@%s", moduleID, version),
	})

	w.WriteHeader(http.StatusNoContent)
}

// ServeInstancePageModuleAssetHandler serves static assets for a module.
func ServeInstancePageModuleAssetHandler(w http.ResponseWriter, r *http.Request) {
	moduleID := chi.URLParam(r, "id")
	version := chi.URLParam(r, "version")
	assetPath := chi.URLParam(r, "*")
	if moduleID == "" || version == "" || assetPath == "" {
		http.Error(w, "module id, version, and asset path are required", http.StatusBadRequest)
		return
	}

	// Security check: every segment must be a plain name. filepath.Join
	// CLEANES ".." segments away BEFORE any string check could see them, so
	// validating raw segments here is the only reliable traversal guard —
	// e.g. id="..", version=".." used to clean down to an arbitrary
	// working-directory-relative path.
	if !safeModuleSegment(moduleID) || !safeModuleSegment(version) {
		http.Error(w, "invalid module id or version", http.StatusBadRequest)
		return
	}
	for _, seg := range strings.Split(assetPath, "/") {
		if !safeModuleSegment(seg) {
			http.Error(w, "invalid asset path", http.StatusBadRequest)
			return
		}
	}

	// Construct the file path and prove containment in the modules root:
	// Clean is applied to BOTH sides and compared with a separator-aware
	// prefix so "modules-extra" can never pass for "modules".
	root, err := filepath.Abs("instance_pages/modules")
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	filePath, err := filepath.Abs(filepath.Join(root, moduleID, version, assetPath))
	if err != nil || filePath != root && !strings.HasPrefix(filePath, root+string(filepath.Separator)) {
		http.Error(w, "invalid asset path", http.StatusBadRequest)
		return
	}

	// Check if file exists
	info, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}
	if info.IsDir() {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}

	// Serve the file
	http.ServeFile(w, r, filePath)
}

// safeModuleSegment reports whether s is a single safe path segment for a
// module id / version / asset name: non-empty, no separators, no dot-dot,
// limited to filename-safe characters.
func safeModuleSegment(s string) bool {
	if s == "" || s == "." || len(s) > 128 {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_' || r == '.':
		default:
			return false
		}
	}
	return !strings.Contains(s, "..")
}

// Module bundle extraction limits: hard caps so a crafted .kspm can't
// exhaust disk or inode budgets (zip bombs) and can't escape the target
// directory (zip-slip).
const (
	maxModuleZipEntries    = 2000
	maxModuleZipFileBytes  = 64 << 20  // 64MB per entry (uncompressed)
	maxModuleZipTotalBytes = 256 << 20 // 256MB total uncompressed
)

// unzip extracts a ZIP stream into dest. Hardened for untrusted archives:
//   - zip-slip: entry names are cleaned and must resolve INSIDE dest
//     (absolute paths, ".." segments, UNC/device names rejected);
//   - bomb guard: entry count, per-entry size and total size caps;
//   - mode hardening: regular files/dirs only (symlinks skipped), files
//     written 0o644 / dirs 0o755 regardless of stored modes.
func unzip(src io.Reader, dest string) error {
	tempFile, err := os.CreateTemp("", "kspanel-upload-*.zip")
	if err != nil {
		return err
	}
	defer os.Remove(tempFile.Name())
	if _, err := io.Copy(tempFile, src); err != nil {
		tempFile.Close()
		return err
	}
	size, serr := tempFile.Seek(0, io.SeekEnd)
	if serr != nil {
		tempFile.Close()
		return serr
	}
	if _, serr := tempFile.Seek(0, io.SeekStart); serr != nil {
		tempFile.Close()
		return serr
	}

	zr, err := zip.NewReader(tempFile, size)
	closeErr := tempFile.Close()
	if closeErr != nil {
		return closeErr
	}
	if err != nil {
		return fmt.Errorf("not a valid zip archive")
	}
	if len(zr.File) > maxModuleZipEntries {
		return fmt.Errorf("archive has too many entries (max %d)", maxModuleZipEntries)
	}

	destAbs, err := filepath.Abs(dest)
	if err != nil {
		return err
	}
	var total int64
	for _, f := range zr.File {
		name := filepath.Clean(f.Name)
		if name == "." || strings.HasPrefix(name, ".."+string(filepath.Separator)) || filepath.IsAbs(name) || strings.Contains(name, "..") || strings.HasPrefix(f.Name, "/") || (len(f.Name) >= 2 && f.Name[1] == ':') {
			return fmt.Errorf("archive entry escapes the target directory: %s", f.Name)
		}
		target := filepath.Join(destAbs, name)
		if !strings.HasPrefix(target, destAbs+string(filepath.Separator)) {
			return fmt.Errorf("archive entry escapes the target directory: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		// Skip anything that is not a regular file (symlinks, devices…):
		// extracting those verbatim is an escalation primitive.
		if !f.FileInfo().Mode().IsRegular() {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		// Read once, one byte beyond the per-entry cap so oversize entries
		// are detected instead of silently truncated.
		n, err := io.Copy(out, io.LimitReader(rc, maxModuleZipFileBytes+1))
		closeErr := out.Close()
		rc.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		total += n
		if n > maxModuleZipFileBytes || total > maxModuleZipTotalBytes {
			return fmt.Errorf("archive exceeds the size cap")
		}
	}
	return nil
}

// Helper function to copy a directory
func copyDirectory(src, dest string) error {
	// Read source directory
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	// Create destination directory
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}

	// Copy each entry
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		destPath := filepath.Join(dest, entry.Name())

		if entry.IsDir() {
			if err := copyDirectory(srcPath, destPath); err != nil {
				return err
			}
		} else {
			// Copy file
			data, err := os.ReadFile(srcPath)
			if err != nil {
				return err
			}
			if err := os.WriteFile(destPath, data, 0o644); err != nil {
				return err
			}
		}
	}

	return nil
}

// instancePagePinnedClient dials only the IPs validated up-front so a
// DNS-rebinding answer can't steer the connection between the LookupIPAddr
// check and connect, and refuses redirects so a 302 to a private host can't
// bypass the public-IP check. Mirrors fetchManifestFromURL's pinned dialer
// (mod_handler.go) for the instance-page import paths.
func instancePagePinnedClient(ips []net.IPAddr, port string) *http.Client {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ipa := range ips {
				addr := net.JoinHostPort(ipa.IP.String(), port)
				conn, derr := (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, addr)
				if derr == nil {
					return conn, nil
				}
				lastErr = derr
			}
			if lastErr == nil {
				lastErr = fmt.Errorf("no dial addresses")
			}
			return nil, lastErr
		},
	}
	return &http.Client{
		Transport: transport, Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// ImportInstancePageFromURLHandler imports an instance page from a remote URL.
func ImportInstancePageFromURLHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.URL == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}

	// SSRF-hardened fetch: scheme must be http(s), host must resolve to public IP only, size capped.
	u, err := url.Parse(strings.TrimSpace(req.URL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		http.Error(w, "url must be an http(s) URL with a host", http.StatusBadRequest)
		return
	}
	host := u.Hostname()
	if host == "" {
		http.Error(w, "url is missing a host", http.StatusBadRequest)
		return
	}
	// Resolve and validate every IP is public (prevents SSRF to private metadata/internal services)
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		http.Error(w, "could not resolve host: "+host, http.StatusBadGateway)
		return
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !isPublicIP(ip) {
			which := ""
			if ip != nil {
				which = " (" + ip.String() + ")"
			}
			http.Error(w, fmt.Sprintf("refusing to fetch %s: host resolves to a non-public address%s", host, which), http.StatusBadRequest)
			return
		}
	}
	client := instancePagePinnedClient(ips, portFromHost(u.Host, u.Scheme))
	defer client.CloseIdleConnections()
	fetchReq, rerr := http.NewRequestWithContext(r.Context(), http.MethodGet, strings.TrimSpace(req.URL), nil)
	if rerr != nil {
		http.Error(w, "invalid URL", http.StatusBadRequest)
		return
	}
	resp, err := client.Do(fetchReq)
	if err != nil {
		http.Error(w, "failed to fetch URL: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("URL returned status %d", resp.StatusCode), http.StatusBadGateway)
		return
	}

	// Cap response to 10 MiB (instance page JSON must fit content limits anyway)
	const maxImportURLBytes = 10 << 20
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxImportURLBytes+1))
	if err != nil {
		http.Error(w, "failed to read URL body: "+err.Error(), http.StatusBadGateway)
		return
	}
	if int64(len(body)) > maxImportURLBytes {
		http.Error(w, fmt.Sprintf("remote body exceeded %d bytes", maxImportURLBytes), http.StatusRequestEntityTooLarge)
		return
	}
	var pageReq ImportInstancePageRequest
	if err := json.Unmarshal(body, &pageReq); err != nil {
		http.Error(w, "invalid JSON from URL: "+err.Error(), http.StatusBadRequest)
		return
	}

// Validate
	dto := instancePageDTO{
		Name:            pageReq.Name,
		Slug:            pageReq.Slug,
		Kind:            pageReq.Kind,
		Category:        pageReq.Category,
		Type:            pageReq.Type,
		Description:     pageReq.Description,
		ContentType:     pageReq.ContentType,
		ContentHTML:     pageReq.ContentHTML,
		ContentMarkdown: pageReq.ContentMarkdown,
		ContentBlocks:   pageReq.ContentBlocks,
		IconSVG:         pageReq.IconSVG,
		IconColor:       pageReq.IconColor,
		Actions:         pageReq.Actions,
		SubPages:        pageReq.subPagesJSON(),
		Components:      pageReq.Components,
		Configure:       pageReq.configureJSON(),
	}
	dto, err = validateInstancePage(dto)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if dto.ContentType == "" {
		dto.ContentType = "markdown"
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	id, err := repository.NewInstancePageRepository(con).Create(repository.InstancePageInput{
		Name:            dto.Name,
		Slug:            dto.Slug,
		Kind:            dto.Kind,
		Category:        dto.Category,
		PageType:        dto.Type,
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		IconColor:       dto.IconColor,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
		Components:      dto.Components,
		Configure:       dto.Configure,
		Source:          pageSourceStudio,
	})
	if err != nil {
		log.Println("ImportInstancePageFromURL error:", err)
		errMsg := err.Error()
		if isDuplicateSlugError(errMsg) {
			http.Error(w, "slug already exists", http.StatusConflict)
		} else {
			http.Error(w, "could not create instance page: "+errMsg, http.StatusInternalServerError)
		}
		return
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "import",
		TargetID:    &id,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("imported instance page %q (slug=%s) from URL", dto.Name, dto.Slug),
	})
	writeJSON(w, map[string]any{"id": id, "message": "Page imported successfully from URL"})
}

// MarketplacePage represents a page in the marketplace catalog.
type MarketplacePage struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Category     string   `json:"category"`
	Author       string   `json:"author"`
	Version      string   `json:"version"`
	Tags         []string `json:"tags"`
	DownloadURL  string   `json:"download_url"`
	IconSVG      string   `json:"icon_svg"`
	IconColor    string   `json:"icon_color"`
	PreviewImage string   `json:"preview_image"`
}

// MarketplaceCatalog represents the marketplace catalog response.
type MarketplaceCatalog struct {
	Version string            `json:"version"`
	Updated string            `json:"updated"`
	Pages   []MarketplacePage `json:"pages"`
}

// GetMarketplacePagesHandler returns the marketplace catalog.
func GetMarketplacePagesHandler(w http.ResponseWriter, r *http.Request) {
	// Read the marketplace catalog: working-dir instance_pages/marketplace.json
	// first, then the copy embedded in the binary (internal/pagelib).
	data, ok := pagelib.ReadCatalog()
	if !ok {
		// Return empty catalog if no catalog exists anywhere
		writeJSON(w, MarketplaceCatalog{
			Version: "1.0",
			Updated: time.Now().Format(time.RFC3339),
			Pages:   []MarketplacePage{},
		})
		return
	}

	var catalog MarketplaceCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		log.Println("GetMarketplacePages error:", err)
		http.Error(w, "invalid marketplace catalog", http.StatusInternalServerError)
		return
	}

	writeJSON(w, catalog)
}

// ImportInstancePageFromMarketplaceHandler imports a page from the marketplace.
func ImportInstancePageFromMarketplaceHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PageID string `json:"page_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.PageID == "" {
		http.Error(w, "page_id is required", http.StatusBadRequest)
		return
	}

	// Read the marketplace catalog to find the page — disk first, embedded
	// fallback (same source GetMarketplacePagesHandler serves from, so the
	// list and the import can never disagree).
	data, ok := pagelib.ReadCatalog()
	if !ok {
		http.Error(w, "marketplace catalog not found", http.StatusNotFound)
		return
	}

	var catalog MarketplaceCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		http.Error(w, "invalid marketplace catalog", http.StatusInternalServerError)
		return
	}

	var marketplacePage *MarketplacePage
	for i := range catalog.Pages {
		if catalog.Pages[i].ID == req.PageID {
			marketplacePage = &catalog.Pages[i]
			break
		}
	}
	if marketplacePage == nil {
		http.Error(w, "page not found in marketplace", http.StatusNotFound)
		return
	}

	// Fetch the page definition from the download URL. Relative entries
	// ("instance_pages/pages/home.json" in operator-provided catalogs)
	// resolve from the local/embedded library instead of http.Get, which
	// cannot fetch them and would fail with "unsupported protocol scheme".
	var pageBytes []byte
	if !strings.Contains(marketplacePage.DownloadURL, "://") {
		b, ok := pagelib.Read(filepath.Base(marketplacePage.DownloadURL))
		if !ok {
			http.Error(w, "marketplace page not found in the local library: "+marketplacePage.DownloadURL, http.StatusNotFound)
			return
		}
		pageBytes = b
	} else {
		mu, err := url.Parse(strings.TrimSpace(marketplacePage.DownloadURL))
		if err != nil || (mu.Scheme != "http" && mu.Scheme != "https") || mu.Host == "" {
			http.Error(w, "marketplace DownloadURL must be an http(s) URL", http.StatusBadRequest)
			return
		}
		mhost := mu.Hostname()
		resolver := net.Resolver{PreferGo: true}
		dnsCtx, cancelDNS := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancelDNS()
		ips, err := resolver.LookupIPAddr(dnsCtx, mhost)
		if err != nil || len(ips) == 0 {
			http.Error(w, "could not resolve marketplace host: "+mhost, http.StatusBadGateway)
			return
		}
		for _, ipa := range ips {
			if ip := ipa.IP; ip == nil || !isPublicIP(ip) {
				which := ""
				if ip != nil {
					which = " (" + ip.String() + ")"
				}
				http.Error(w, fmt.Sprintf("refusing to fetch %s: host resolves to a non-public address%s", mhost, which), http.StatusBadRequest)
				return
			}
		}
		client := instancePagePinnedClient(ips, portFromHost(mu.Host, mu.Scheme))
		defer client.CloseIdleConnections()
		mfetchReq, mrerr := http.NewRequestWithContext(r.Context(), http.MethodGet, strings.TrimSpace(marketplacePage.DownloadURL), nil)
		if mrerr != nil {
			http.Error(w, "invalid marketplace DownloadURL", http.StatusBadRequest)
			return
		}
		resp, err := client.Do(mfetchReq)
		if err != nil {
			http.Error(w, "failed to fetch page from marketplace: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			http.Error(w, fmt.Sprintf("marketplace download URL returned status %d", resp.StatusCode), http.StatusBadGateway)
			return
		}
		b, rerr := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
		if rerr != nil {
			http.Error(w, "failed to read marketplace page: "+rerr.Error(), http.StatusBadGateway)
			return
		}
		pageBytes = b
	}

	var pageReq ImportInstancePageRequest
	if err := json.Unmarshal(pageBytes, &pageReq); err != nil {
		http.Error(w, "invalid JSON from marketplace: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate
	dto := instancePageDTO{
		Name:            pageReq.Name,
		Slug:            pageReq.Slug,
		Kind:            pageReq.Kind,
		Category:        pageReq.Category,
		Type:            pageReq.Type,
		Description:     pageReq.Description,
		ContentType:     pageReq.ContentType,
		ContentHTML:     pageReq.ContentHTML,
		ContentMarkdown: pageReq.ContentMarkdown,
		ContentBlocks:   pageReq.ContentBlocks,
		IconSVG:         pageReq.IconSVG,
		IconColor:       pageReq.IconColor,
		Actions:         pageReq.Actions,
		SubPages:        pageReq.subPagesJSON(),
		Components:      pageReq.Components,
		Configure:       pageReq.configureJSON(),
	}
	dto, verr := validateInstancePage(dto)
	if verr != nil {
		http.Error(w, verr.Error(), http.StatusBadRequest)
		return
	}
	if dto.ContentType == "" {
		dto.ContentType = "markdown"
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	ownerID, _ := UserIDFromContext(r)
	id, err := repository.NewInstancePageRepository(con).Create(repository.InstancePageInput{
		Name:            dto.Name,
		Slug:            dto.Slug,
		Kind:            dto.Kind,
		Category:        dto.Category,
		PageType:        dto.Type,
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		IconColor:       dto.IconColor,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
		Components:      dto.Components,
		Configure:       dto.Configure,
		OwnerID:           ownerID,
		Source:            pageSourceMarket,
		MarketID:          req.PageID,
		MarketVersion:     catalog.Version,
	})
	if err != nil {
		log.Println("ImportInstancePageFromMarketplace error:", err)
		errMsg := err.Error()
		if isDuplicateSlugError(errMsg) {
			http.Error(w, "slug already exists", http.StatusConflict)
		} else {
			http.Error(w, "could not create instance page: "+errMsg, http.StatusInternalServerError)
		}
		return
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "import",
		TargetID:    &id,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("imported instance page %q (slug=%s) from marketplace", dto.Name, dto.Slug),
	})
	writeJSON(w, map[string]any{"id": id, "message": "Page imported successfully from marketplace"})
}

// fetchMarketplacePageBytes resolves a catalog entry to its raw page JSON.
// Relative entries ("instance_pages/pages/home.json") come from the
// local/embedded library; absolute http(s) URLs are fetched server-side with
// the same SSRF guard as the single-import path.
func fetchMarketplacePageBytes(ctx context.Context, mp MarketplacePage) ([]byte, error) {
	if !strings.Contains(mp.DownloadURL, "://") {
		b, ok := pagelib.Read(filepath.Base(mp.DownloadURL))
		if !ok {
			return nil, fmt.Errorf("marketplace page not found in the local library: %s", mp.DownloadURL)
		}
		return b, nil
	}
	mu, err := url.Parse(strings.TrimSpace(mp.DownloadURL))
	if err != nil || (mu.Scheme != "http" && mu.Scheme != "https") || mu.Host == "" {
		return nil, fmt.Errorf("marketplace DownloadURL must be an http(s) URL")
	}
	mhost := mu.Hostname()
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(ctx, 10*time.Second)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, mhost)
	if err != nil || len(ips) == 0 {
		return nil, fmt.Errorf("could not resolve marketplace host: %s", mhost)
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !isPublicIP(ip) {
			which := ""
			if ip != nil {
				which = " (" + ip.String() + ")"
			}
			return nil, fmt.Errorf("refusing to fetch %s: host resolves to a non-public address%s", mhost, which)
		}
	}
	client := instancePagePinnedClient(ips, portFromHost(mu.Host, mu.Scheme))
	defer client.CloseIdleConnections()
	mreq, mrerr := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSpace(mp.DownloadURL), nil)
	if mrerr != nil {
		return nil, fmt.Errorf("invalid marketplace DownloadURL")
	}
	resp, err := client.Do(mreq)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch page from marketplace: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("marketplace download URL returned status %d", resp.StatusCode)
	}
	b, rerr := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if rerr != nil {
		return nil, fmt.Errorf("failed to read marketplace page: %w", rerr)
	}
	return b, nil
}

// ResyncMarketplacePagesHandler re-saves every market-tracked library page
// from its marketplace download link. Rows with source market/edited and a
// non-empty market_id are refreshed in place (content + icon + actions +
// sub-pages + components overwritten from the link) and flipped back to
// source market. Studio (own) pages are left untouched.
//
// Response: { updated, skipped, errors }
func ResyncMarketplacePagesHandler(w http.ResponseWriter, r *http.Request) {
	data, ok := pagelib.ReadCatalog()
	if !ok {
		http.Error(w, "marketplace catalog not found", http.StatusNotFound)
		return
	}
	var catalog MarketplaceCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		http.Error(w, "invalid marketplace catalog", http.StatusInternalServerError)
		return
	}
	byID := make(map[string]MarketplacePage, len(catalog.Pages))
	for _, mp := range catalog.Pages {
		byID[mp.ID] = mp
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewInstancePageRepository(con)
	pages, err := repo.List()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	updated := 0
	skipped := 0
	var errs []string
	var ids []int64
	for _, p := range pages {
		src := normalizePageSource(p.Source)
		if (src != pageSourceMarket && src != pageSourceEdited) || p.MarketID == "" {
			continue
		}
		mp, found := byID[p.MarketID]
		if !found {
			skipped++
			continue
		}
		pageBytes, ferr := fetchMarketplacePageBytes(r.Context(), mp)
		if ferr != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", p.Slug, ferr.Error()))
			continue
		}
		var pageReq ImportInstancePageRequest
		if err := json.Unmarshal(pageBytes, &pageReq); err != nil {
			errs = append(errs, fmt.Sprintf("%s: invalid JSON from marketplace: %s", p.Slug, err.Error()))
			continue
		}
		dto := instancePageDTO{
			Name:            pageReq.Name,
			Slug:            pageReq.Slug,
			Kind:            pageReq.Kind,
			Category:        pageReq.Category,
			Type:            pageReq.Type,
			Description:     pageReq.Description,
			ContentType:     pageReq.ContentType,
			ContentHTML:     pageReq.ContentHTML,
			ContentMarkdown: pageReq.ContentMarkdown,
			ContentBlocks:   pageReq.ContentBlocks,
			IconSVG:         pageReq.IconSVG,
		IconColor:       pageReq.IconColor,
			Actions:         pageReq.Actions,
			SubPages:        pageReq.subPagesJSON(),
			Components:      pageReq.Components,
			Configure:       pageReq.configureJSON(),
		}
		dto, verr := validateInstancePage(dto)
		if verr != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", p.Slug, verr.Error()))
			continue
		}
		if dto.ContentType == "" {
			dto.ContentType = "markdown"
		}
		// Keep the row's identity (slug may have been renamed locally, so
		// preserve the stored slug); refresh everything else from the link.
		if err := repo.Update(p.ID, repository.InstancePageInput{
			Name:            dto.Name,
			Slug:            p.Slug,
			Kind:            dto.Kind,
			Category:        dto.Category,
			PageType:        dto.Type,
			Description:     dto.Description,
			ContentType:     dto.ContentType,
			ContentHTML:     dto.ContentHTML,
			ContentMarkdown: dto.ContentMarkdown,
			ContentBlocks:   dto.ContentBlocks,
			IconSVG:         dto.IconSVG,
		IconColor:       dto.IconColor,
			Actions:         dto.Actions,
			SubPages:        dto.SubPages,
			Components:      dto.Components,
			Configure:       dto.Configure,
			Source:          pageSourceMarket,
			MarketID:        p.MarketID,
			MarketVersion:   catalog.Version,
		}); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", p.Slug, err.Error()))
			continue
		}
		updated++
		ids = append(ids, p.ID)
	}

	if updated > 0 {
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryTemplate,
			Action:      "resync",
			TargetLabel: fmt.Sprintf("%d pages", updated),
			Message:     fmt.Sprintf("resynced %d marketplace page(s) from links", updated),
		})
	}
	writeJSON(w, map[string]any{
		"updated": updated,
		"skipped": skipped,
		"errors":  errs,
		"ids":     ids,
	})
}

// ListLocalInstancePagesHandler returns instance pages from the local
// instance_pages directory (pages/ canonical, top level legacy), falling
// back to the library embedded in the binary via internal/pagelib when no
// on-disk copy exists.
// Entries that fail to parse are skipped with a log line so one broken file
// can't blank the whole list.
func ListLocalInstancePagesHandler(w http.ResponseWriter, r *http.Request) {
	pages := []ImportInstancePageRequest{}
	for _, name := range pagelib.ListNames() {
		data, ok := pagelib.Read(name)
		if !ok {
			continue
		}
		var pageReq ImportInstancePageRequest
		if err := json.Unmarshal(data, &pageReq); err != nil {
			log.Printf("ListLocalInstancePages: skipping %s: %v", name, err)
			continue
		}
		pages = append(pages, pageReq)
	}
	writeJSON(w, pages)
}

// ImportLocalInstancePageHandler imports a page from the local instance_pages directory.
func ImportLocalInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Filename == "" {
		http.Error(w, "filename is required", http.StatusBadRequest)
		return
	}

	// Resolve the file through pagelib: working-dir instance_pages/ (pages/
	// canonical, top level legacy) first, then the binary-embedded library.
	// Read() only accepts a bare basename, so the path-traversal guard lives
	// in one place.
	data, ok := pagelib.Read(req.Filename)
	if !ok {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	var pageReq ImportInstancePageRequest
	if err := json.Unmarshal(data, &pageReq); err != nil {
		http.Error(w, "invalid JSON in file: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate
	dto := instancePageDTO{
		Name:            pageReq.Name,
		Slug:            pageReq.Slug,
		Kind:            pageReq.Kind,
		Category:        pageReq.Category,
		Type:            pageReq.Type,
		Description:     pageReq.Description,
		ContentType:     pageReq.ContentType,
		ContentHTML:     pageReq.ContentHTML,
		ContentMarkdown: pageReq.ContentMarkdown,
		ContentBlocks:   pageReq.ContentBlocks,
		IconSVG:         pageReq.IconSVG,
		IconColor:       pageReq.IconColor,
		Actions:         pageReq.Actions,
		SubPages:        pageReq.subPagesJSON(),
		Components:      pageReq.Components,
		Configure:       pageReq.configureJSON(),
	}
	dto, verr := validateInstancePage(dto)
	if verr != nil {
		http.Error(w, verr.Error(), http.StatusBadRequest)
		return
	}
	if dto.ContentType == "" {
		dto.ContentType = "markdown"
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	id, err := repository.NewInstancePageRepository(con).Create(repository.InstancePageInput{
		Name:            dto.Name,
		Slug:            dto.Slug,
		Kind:            dto.Kind,
		Category:        dto.Category,
		PageType:        dto.Type,
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		IconColor:       dto.IconColor,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
		Components:      dto.Components,
		Configure:       dto.Configure,
		Source:          pageSourceStudio,
	})
	if err != nil {
		log.Println("ImportLocalInstancePage error:", err)
		errMsg := err.Error()
		if isDuplicateSlugError(errMsg) {
			http.Error(w, "slug already exists", http.StatusConflict)
		} else {
			http.Error(w, "could not create instance page: "+errMsg, http.StatusInternalServerError)
		}
		return
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "import",
		TargetID:    &id,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("imported instance page %q (slug=%s) from local directory", dto.Name, dto.Slug),
	})
	writeJSON(w, map[string]any{"id": id, "message": "Page imported successfully from local directory"})
}
