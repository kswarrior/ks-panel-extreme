package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ── Custom panel pages (Settings > Pages) ───────────────────────────────
// Admin-authored sidebar pages (About, Docs, …). CRUD is gated by the
// settings umbrella at the router level (same as SettingsHandler); the two
// reader endpoints below only need a session — visibility is enforced per
// role from the page's own allow-list.

// panelPageResponse is the admin JSON view (full content for the editor).
type panelPageResponse struct {
	ID          int64   `json:"id"`
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	IconSVG     string  `json:"icon_svg"`
	ContentType string  `json:"content_type"`
	Content     string  `json:"content"`
	Enabled     bool    `json:"enabled"`
	RoleIDs     []int64 `json:"role_ids"`
	SortOrder   int     `json:"sort_order"`
}

func toPanelPageResponse(p *repository.PanelPage) panelPageResponse {
	ids := p.RoleIDs
	if ids == nil {
		ids = []int64{}
	}
	return panelPageResponse{
		ID: p.ID, Slug: p.Slug, Name: p.Name, IconSVG: p.IconSVG,
		ContentType: p.ContentType, Content: p.Content, Enabled: p.Enabled,
		RoleIDs: ids, SortOrder: p.SortOrder,
	}
}

// panelPageRequest is the create/update body. Enabled + SortOrder are
// pointers so "omitted" stays distinct from an explicit false/zero.
type panelPageRequest struct {
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	IconSVG     string  `json:"icon_svg"`
	ContentType string  `json:"content_type"`
	Content     string  `json:"content"`
	Enabled     *bool   `json:"enabled"`
	RoleIDs     []int64 `json:"role_ids"`
	SortOrder   *int    `json:"sort_order"`
}

func panelPageInputFromRequest(req panelPageRequest) repository.PanelPageInput {
	in := repository.PanelPageInput{
		Slug: req.Slug, Name: req.Name,
		IconSVG:     sanitizeIconSVG(strings.TrimSpace(req.IconSVG)),
		ContentType: req.ContentType, Content: req.Content,
		Enabled: true, RoleIDs: req.RoleIDs,
	}
	if req.Enabled != nil {
		in.Enabled = *req.Enabled
	}
	if req.SortOrder != nil {
		in.SortOrder = *req.SortOrder
	}
	return in
}

// ListPanelPagesHandler returns every page (admin view, drafts included).
func ListPanelPagesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	pages, err := repository.NewPanelPageRepository(con).List()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]panelPageResponse, 0, len(pages))
	for _, p := range pages {
		out = append(out, toPanelPageResponse(p))
	}
	writeJSON(w, out)
}

// CreatePanelPageHandler creates one page. Icon SVG is sanitized with the
// same rules as avatars/instance-page icons (sidebar renders it inline).
func CreatePanelPageHandler(w http.ResponseWriter, r *http.Request) {
	var req panelPageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	p, err := repository.NewPanelPageRepository(con).Create(panelPageInputFromRequest(req))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSONStatus(w, http.StatusCreated, toPanelPageResponse(p))
}

// GetPanelPageHandler returns one page by id (admin view).
func GetPanelPageHandler(w http.ResponseWriter, r *http.Request) {
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
	p, err := repository.NewPanelPageRepository(con).Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, toPanelPageResponse(p))
}

// UpdatePanelPageHandler overwrites one page by id.
func UpdatePanelPageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req panelPageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	p, err := repository.NewPanelPageRepository(con).Update(id, panelPageInputFromRequest(req))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, toPanelPageResponse(p))
}

// DeletePanelPageHandler removes one page by id.
func DeletePanelPageHandler(w http.ResponseWriter, r *http.Request) {
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
	if err := repository.NewPanelPageRepository(con).Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// panelPageCallerRoleID resolves the session user's role id. Unknown users
// fall back to 0 (which matches no allow-list entry — only "every role"
// pages show).
func panelPageCallerRoleID(uid int64, repo *repository.UserRepository) int64 {
	u, err := repo.GetByID(uid)
	if err != nil {
		return 0
	}
	return u.RoleID
}

// PanelPagesNavHandler returns the enabled pages visible to the caller for
// the sidebar. Any authenticated user may call it — the allow-list does the
// filtering, so narrowed roles only ever see their own pages.
func PanelPagesNavHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	roleID := panelPageCallerRoleID(uid, repository.NewUserRepository(con))
	nav, err := repository.NewPanelPageRepository(con).ListNav(roleID)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if nav == nil {
		nav = []repository.PanelPageNav{}
	}
	writeJSON(w, nav)
}

// GetPanelPageBySlugHandler returns one ENABLED page visible to the caller.
// Disabled / role-hidden / missing slugs all answer 404 so the endpoint
// never leaks the existence of pages the caller must not see.
func GetPanelPageBySlugHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	slug := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "slug")))
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	roleID := panelPageCallerRoleID(uid, repository.NewUserRepository(con))
	p, err := repository.NewPanelPageRepository(con).GetBySlug(slug)
	if err != nil {
		http.Error(w, "panel page not found", http.StatusNotFound)
		return
	}
	if !p.Enabled || !p.VisibleTo(roleID) {
		http.Error(w, "panel page not found", http.StatusNotFound)
		return
	}
	writeJSON(w, toPanelPageResponse(p))
}
