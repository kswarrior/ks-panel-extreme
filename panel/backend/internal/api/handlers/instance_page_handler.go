package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/pagelib"
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
	Description     string `json:"description"`
	ContentType     string `json:"content_type"`
	ContentHTML     string `json:"content_html"`
	ContentMarkdown string `json:"content_markdown"`
	ContentBlocks   string `json:"content_blocks"`
	IconSVG         string `json:"icon_svg"`
	// Actions is a JSON array of executable page actions ("" == none).
	Actions string `json:"actions"`
	// SubPages is a JSON array of extra page definitions that ship with this
	// page — multi-page support (e.g. Files carrying files/edit). Each entry:
	// {"path","name","content_type","content_html","content_markdown",
	//  "content_blocks"}; the effective slug is "<slug>/<path>". "" == none.
	SubPages string `json:"sub_pages"`
}

// validInstancePageKinds lists the page kinds a stored row may carry. The
// legacy "builtin" kind is gone: every built-in instance sub-page was
// converted to a self-contained custom page in the Instance Pages library
// (instance_pages/pages/*.json) and migration 046 purged the old rows, so
// new builtin rows are rejected to keep them from coming back.
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
	iconUseExternalRefRe   = regexp.MustCompile(`(?i)(xlink:href|href)\s*=\s*("[^"#][^"]*"|'[^#'][^']*')`)
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
	writeJSON(w, pages)
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
	id, err := repository.NewInstancePageRepository(con).Create(repository.InstancePageInput{
		Name:            req.Name,
		Slug:            req.Slug,
		Kind:            req.Kind,
		Category:        req.Category,
		Description:     req.Description,
		ContentType:     req.ContentType,
		ContentHTML:     req.ContentHTML,
		ContentMarkdown: req.ContentMarkdown,
		ContentBlocks:   req.ContentBlocks,
		IconSVG:         req.IconSVG,
		Actions:         req.Actions,
		SubPages:        req.SubPages,
	})
	if err != nil {
		log.Println("CreateInstancePage error:", err)
		// Check for unique constraint violation (slug already exists)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") && strings.Contains(errMsg, "slug") {
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
	if err := repository.NewInstancePageRepository(con).Update(id, repository.InstancePageInput{
		Name:            req.Name,
		Slug:            req.Slug,
		Kind:            req.Kind,
		Category:        req.Category,
		Description:     req.Description,
		ContentType:     req.ContentType,
		ContentHTML:     req.ContentHTML,
		ContentMarkdown: req.ContentMarkdown,
		ContentBlocks:   req.ContentBlocks,
		IconSVG:         req.IconSVG,
		Actions:         req.Actions,
		SubPages:        req.SubPages,
	}); err != nil {
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
	if existing, gerr := repo.Get(id); gerr == nil && existing != nil {
		label = existing.Name
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

	// Use the edge client to call the page-action endpoint
	ec := edge.New(*node, token)

	edgeReq := map[string]any{
		"token":   token,
		"kind":    instance.Kind,
		"name":    instance.Name,
		"type":    req.Type,
		"command": req.Command,
		"path":    req.Path,
		"content": req.Content,
		"args":    req.Args,
		"env":     req.Env,
		"timeout": req.Timeout,
	}

	body, _ := json.Marshal(edgeReq)
	httpReq, _ := http.NewRequestWithContext(r.Context(), "POST", ec.BaseURL()+"/api/edge/page-action", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: time.Duration(req.Timeout+5) * time.Second}
	if req.Timeout == 0 {
		client.Timeout = 35 * time.Second
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("ExecutePageActionHandler: edge page-action request failed: %v", err)
		writeJSON(w, map[string]any{
			"error": "edge page-action unreachable: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

// ExecuteCustomPageActionHandler executes an action from a custom page
// against a specific instance. Unlike ExecutePageActionHandler which requires
// a predefined instance page ID, this handler is called directly by the
// custom page SDK running in the browser. It validates that the instance
// has custom pages enabled in its spec, then proxies to the edge.
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

	if req.InstanceID == 0 || req.Type == "" {
		http.Error(w, "instance_id and type are required", http.StatusBadRequest)
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

	// Page-bound execution: the calling page must be enabled on THIS
	// instance's own deploy-time config snapshot. Fail closed on missing or
	// unknown slugs — the browser SDK always sends it; anything else is a
	// hand-forged request.
	if !instanceCustomPageEnabled(instance.Config, req.PageSlug) {
		http.Error(w, "page not enabled for this instance", http.StatusForbidden)
		return
	}

	// Validate + clamp before touching the edge.
	timeoutSec, verr := sanitizePageAction(req.Type, req.Command, req.Path, req.Content, req.Args, req.Env, req.Timeout)
	if verr != nil {
		http.Error(w, verr.Error(), http.StatusBadRequest)
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

	// Use the edge client to call the page-action endpoint
	ec := edge.New(*node, token)

	edgeReq := map[string]any{
		"token":   token,
		"kind":    instance.Kind,
		"name":    instance.Name,
		"type":    req.Type,
		"command": req.Command,
		"path":    req.Path,
		"content": req.Content,
		"args":    req.Args,
		"env":     req.Env,
		"timeout": timeoutSec,
	}

	body, _ := json.Marshal(edgeReq)
	httpReq, _ := http.NewRequestWithContext(r.Context(), "POST", ec.BaseURL()+"/api/edge/page-action", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: time.Duration(timeoutSec+5) * time.Second}

	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("ExecuteCustomPageActionHandler: edge page-action request failed: %v", err)
		writeJSON(w, map[string]any{
			"error": "edge page-action unreachable: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

// ExecuteModulePageActionHandler executes an action from a module-based page
// against a specific instance. Unlike ExecutePageActionHandler which requires
// a predefined instance page ID, this handler is called directly by the
// module page SDK running in the browser. It validates that the instance
// has the module enabled in its spec, then proxies to the edge.
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

	if req.InstanceID == 0 || req.ModuleID == "" || req.Type == "" {
		http.Error(w, "instance_id, module_id, and type are required", http.StatusBadRequest)
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
		if m == req.ModuleID {
			moduleAllowed = true
			break
		}
	}
	if !moduleAllowed {
		http.Error(w, "module not enabled for this instance", http.StatusForbidden)
		return
	}

	// Use the edge client to call the page-module action endpoint
	ec := edge.New(*node, token)

	edgeReq := map[string]any{
		"token":     token,
		"kind":      instance.Kind,
		"name":      instance.Name,
		"module_id": req.ModuleID,
		"type":      req.Type,
		"command":   req.Command,
		"path":      req.Path,
		"content":   req.Content,
		"args":      req.Args,
		"env":       req.Env,
		"timeout":   req.Timeout,
	}

	body, _ := json.Marshal(edgeReq)
	httpReq, _ := http.NewRequestWithContext(r.Context(), "POST", ec.BaseURL()+"/api/edge/page-module/"+strconv.FormatInt(instance.ID, 10)+"/"+req.ModuleID+"/action", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: time.Duration(req.Timeout+5) * time.Second}
	if req.Timeout == 0 {
		client.Timeout = 35 * time.Second
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("ExecuteModulePageActionHandler: edge page-module action request failed: %v", err)
		writeJSON(w, map[string]any{
			"error": "edge page-module action unreachable: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

// ============================== PAGE ACTION HARDENING ==============================
//
// Page actions execute commands inside an instance container on behalf of
// custom-page JavaScript running in the operator's browser. Because the
// endpoint is reachable outside the page sandbox (devtools / direct HTTP),
// every request is validated server-side here:
//
//   - type must be a known action type (mirrors the frontend ActionType
//     union in web/src/lib/customPageSdk.ts) — unknown verbs fail closed.
//   - timeout is clamped to [min,max] seconds; a negative value previously
//     produced a non-positive http.Client.Timeout (= NO timeout), letting a
//     request hold the edge connection open indefinitely.
//   - command/path/content/args/env sizes are capped so one request cannot
//     balloon the proxied edge payload.
//
// Custom-page execution additionally requires the CALLING PAGE to be enabled
// on the target instance: the browser SDK sends its own page slug and the
// server verifies it against the instance's deploy-time config before doing
// any work (see instanceCustomPageEnabled). A viewer can no longer run
// commands under an arbitrary instance merely because SOME custom page is
// enabled there — the exact page family the call originates from must be
// enabled for that instance, mirroring guardInstancePage semantics.

// validPageActionTypes mirrors the frontend ActionType union.
var validPageActionTypes = map[string]bool{
	"shell":      true,
	"read_file":  true,
	"write_file": true,
	"list_files": true,
	"docker":     true,
	"kvm":        true,
	"lxd":        true,
}

// Payload + duration budgets for one page-action execution.
const (
	maxPageActionCommandBytes   = 8 * 1024
	maxPageActionPathBytes      = 2 * 1024
	maxPageActionContentBytes   = 2 * 1024 * 1024
	maxPageActionArgsCount      = 64
	maxPageActionArgBytes       = 4 * 1024
	maxPageActionEnvEntries     = 64
	maxPageActionEnvValueBytes  = 4 * 1024
	minPageActionTimeoutSec     = 5
	maxPageActionTimeoutSec     = 300
	defaultPageActionTimeoutSec = 30
)

// sanitizePageAction validates the browser-supplied action fields and returns
// the clamped timeout to use for both the edge payload and the proxy client.
func sanitizePageAction(typ, command, path, content string, args []string, env map[string]string, timeout int) (int, error) {
	if !validPageActionTypes[typ] {
		return 0, newErrString("invalid action type")
	}
	if len(command) > maxPageActionCommandBytes {
		return 0, newErrString("command too large")
	}
	if len(path) > maxPageActionPathBytes {
		return 0, newErrString("path too large")
	}
	if len(content) > maxPageActionContentBytes {
		return 0, newErrString("content too large")
	}
	if len(args) > maxPageActionArgsCount {
		return 0, newErrString("too many args")
	}
	for _, a := range args {
		if len(a) > maxPageActionArgBytes {
			return 0, newErrString("arg too large")
		}
	}
	if len(env) > maxPageActionEnvEntries {
		return 0, newErrString("too many env vars")
	}
	for k, v := range env {
		if k == "" || len(k) > 256 || len(v) > maxPageActionEnvValueBytes {
			return 0, newErrString("invalid env var")
		}
	}
	switch {
	case timeout < 0:
		return 0, newErrString("timeout must not be negative")
	case timeout == 0:
		return defaultPageActionTimeoutSec, nil
	case timeout < minPageActionTimeoutSec:
		return minPageActionTimeoutSec, nil
	case timeout > maxPageActionTimeoutSec:
		return maxPageActionTimeoutSec, nil
	default:
		return timeout, nil
	}
}

// instanceCustomPageEnabled reports whether the page family identified by
// pageSlug carries an ENABLED entry with kind "custom" in the instance's
// deploy-time config spec. pageSlug may be a top-level slug ("files"), the
// reserved Home slug ("."), or a sub-page path ("files/edit") — sub-pages
// resolve to their parent family row, matching the SPA route tree. Entries
// whose kind is present and NOT "custom" (e.g. module rows) never grant the
// custom action surface; unparseable configs fail closed.
func instanceCustomPageEnabled(specJSON, pageSlug string) bool {
	specJSON = strings.TrimSpace(specJSON)
	if specJSON == "" || pageSlug == "" {
		return false
	}
	var spec map[string]any
	if err := json.Unmarshal([]byte(specJSON), &spec); err != nil {
		return false // unparseable = nothing allowed (safe default)
	}
	pagesAny, _ := spec["pages"].([]any)
	for _, p := range pagesAny {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if pm["enabled"] == false {
			continue
		}
		if k, ok := pm["kind"].(string); ok && k != "custom" {
			continue // only custom-kind entries carry the action surface
		}
		s, _ := pm["slug"].(string)
		os, _ := pm["original_slug"].(string)
		if pageSlug == s || pageSlug == os ||
			(s != "" && strings.HasPrefix(pageSlug, s+"/")) {
			return true
		}
	}
	return false
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
	Description     string `json:"description"`
	ContentType     string `json:"content_type"`
	ContentHTML     string `json:"content_html"`
	ContentMarkdown string `json:"content_markdown"`
	ContentBlocks   string `json:"content_blocks"`
	IconSVG         string `json:"icon_svg"`
	Actions         string `json:"actions"`
	// SubPages is the persisted JSON-array form (API shape). Library JSON
	// files usually carry the typed `pages` array instead.
	SubPages string `json:"sub_pages"`
	// Pages carries the human-facing multi-page definitions (library JSON
	// files use this shape). Encoded into SubPages on import.
	Pages []instancePageSubPage `json:"pages"`
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
		Description:     req.Description,
		ContentType:     req.ContentType,
		ContentHTML:     req.ContentHTML,
		ContentMarkdown: req.ContentMarkdown,
		ContentBlocks:   req.ContentBlocks,
		IconSVG:         req.IconSVG,
		Actions:         req.Actions,
		SubPages:        req.subPagesJSON(),
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
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
	})
	if err != nil {
		log.Println("ImportInstancePage error:", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") && strings.Contains(errMsg, "slug") {
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

	var modules []instancePageModuleManifest
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

	// Construct the file path
	filePath := filepath.Join("instance_pages/modules", moduleID, version, assetPath)

	// Security check: prevent path traversal
	if strings.Contains(filePath, "..") || strings.Contains(filePath, "//") {
		http.Error(w, "invalid asset path", http.StatusBadRequest)
		return
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}

	// Serve the file
	http.ServeFile(w, r, filePath)
}

// Helper function to unzip a file
func unzip(src io.Reader, dest string) error {
	// Create a temporary file to store the uploaded content
	tempFile, err := os.CreateTemp("", "kspanel-upload-*.kspm")
	if err != nil {
		return err
	}
	defer os.Remove(tempFile.Name())

	// Copy the uploaded file to the temporary file
	if _, err := io.Copy(tempFile, src); err != nil {
		return err
	}

	// Close the file before reopening for reading
	if err := tempFile.Close(); err != nil {
		return err
	}

	// TODO: Implement actual ZIP extraction
	// For now, we'll assume the file is already extracted or handle it differently
	// This is a simplified implementation - in production, you'd use an archive/zip package
	return fmt.Errorf("ZIP extraction not implemented")
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

	// Fetch the JSON from the URL
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(req.URL)
	if err != nil {
		http.Error(w, "failed to fetch URL: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("URL returned status %d", resp.StatusCode), http.StatusBadGateway)
		return
	}

	var pageReq ImportInstancePageRequest
	if err := json.NewDecoder(resp.Body).Decode(&pageReq); err != nil {
		http.Error(w, "invalid JSON from URL: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate
	dto := instancePageDTO{
		Name:            pageReq.Name,
		Slug:            pageReq.Slug,
		Kind:            pageReq.Kind,
		Category:        pageReq.Category,
		Description:     pageReq.Description,
		ContentType:     pageReq.ContentType,
		ContentHTML:     pageReq.ContentHTML,
		ContentMarkdown: pageReq.ContentMarkdown,
		ContentBlocks:   pageReq.ContentBlocks,
		IconSVG:         pageReq.IconSVG,
		Actions:         pageReq.Actions,
		SubPages:        pageReq.subPagesJSON(),
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
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
	})
	if err != nil {
		log.Println("ImportInstancePageFromURL error:", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") && strings.Contains(errMsg, "slug") {
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
	// ("instance_pages/pages/home.json" in the shipped catalog) resolve from
	// the local/embedded library instead of http.Get, which cannot fetch
	// them and would fail with "unsupported protocol scheme".
	var pageBytes []byte
	if !strings.Contains(marketplacePage.DownloadURL, "://") {
		b, ok := pagelib.Read(filepath.Base(marketplacePage.DownloadURL))
		if !ok {
			http.Error(w, "marketplace page not found in the local library: "+marketplacePage.DownloadURL, http.StatusNotFound)
			return
		}
		pageBytes = b
	} else {
		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(marketplacePage.DownloadURL)
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
		Description:     pageReq.Description,
		ContentType:     pageReq.ContentType,
		ContentHTML:     pageReq.ContentHTML,
		ContentMarkdown: pageReq.ContentMarkdown,
		ContentBlocks:   pageReq.ContentBlocks,
		IconSVG:         pageReq.IconSVG,
		Actions:         pageReq.Actions,
		SubPages:        pageReq.subPagesJSON(),
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
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
	})
	if err != nil {
		log.Println("ImportInstancePageFromMarketplace error:", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") && strings.Contains(errMsg, "slug") {
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

// ListLocalInstancePagesHandler returns instance pages from the local
// instance_pages directory (top level + pages/), falling back to the library
// embedded in the binary via internal/pagelib when no on-disk copy exists.
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

	// Resolve the file through pagelib: working-dir instance_pages/ (top
	// level + pages/) first, then the binary-embedded library. Read() only
	// accepts a bare basename, so the path-traversal guard lives in one place.
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
		Description:     pageReq.Description,
		ContentType:     pageReq.ContentType,
		ContentHTML:     pageReq.ContentHTML,
		ContentMarkdown: pageReq.ContentMarkdown,
		ContentBlocks:   pageReq.ContentBlocks,
		IconSVG:         pageReq.IconSVG,
		Actions:         pageReq.Actions,
		SubPages:        pageReq.subPagesJSON(),
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
		Description:     dto.Description,
		ContentType:     dto.ContentType,
		ContentHTML:     dto.ContentHTML,
		ContentMarkdown: dto.ContentMarkdown,
		ContentBlocks:   dto.ContentBlocks,
		IconSVG:         dto.IconSVG,
		Actions:         dto.Actions,
		SubPages:        dto.SubPages,
	})
	if err != nil {
		log.Println("ImportLocalInstancePage error:", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") && strings.Contains(errMsg, "slug") {
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
