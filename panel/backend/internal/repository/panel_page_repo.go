package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// PanelPageRepository persists admin-authored custom panel pages
// (Settings > Pages: About, Docs, …) shown in the sidebar.
type PanelPageRepository struct {
	db *sql.DB
}

func NewPanelPageRepository(db *sql.DB) *PanelPageRepository {
	return &PanelPageRepository{db: db}
}

// PanelPage is one custom sidebar page.
type PanelPage struct {
	ID          int64     `json:"id"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	IconSVG     string    `json:"icon_svg"`
	ContentType string    `json:"content_type"` // html|markdown
	Content     string    `json:"content"`
	Enabled     bool      `json:"enabled"`
	RoleIDs     []int64   `json:"role_ids"` // empty = every role
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// PanelPageNav is the sidebar projection: no content bytes, just identity +
// the sanitized icon the sidebar renders inline.
type PanelPageNav struct {
	Slug    string `json:"slug"`
	Name    string `json:"name"`
	IconSVG string `json:"icon_svg"`
	URL     string `json:"url"`
}

var panelPageSlugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// ValidatePanelPageSlug reports whether s is a usable URL slug: lowercase
// alnum + dashes, 1-48 chars, no leading/trailing dash.
func ValidatePanelPageSlug(s string) error {
	s = strings.TrimSpace(s)
	if len(s) < 1 || len(s) > 48 {
		return fmt.Errorf("slug must be 1-48 characters")
	}
	if !panelPageSlugRe.MatchString(s) {
		return fmt.Errorf("slug must be lowercase letters, digits and dashes (e.g. about, user-docs)")
	}
	return nil
}

// ValidatePanelPageContentType ensures the content type is renderable.
func ValidatePanelPageContentType(s string) error {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "html", "markdown":
		return nil
	default:
		return fmt.Errorf("content_type must be html or markdown")
	}
}

// MaxPanelPageContent caps author markup so one page can't bloat the DB.
const MaxPanelPageContent = 200 * 1024

// MaxPanelPageIcon caps the inline SVG so the sidebar stays light.
const MaxPanelPageIcon = 16 * 1024

func scanPanelPage(row interface {
	Scan(dest ...any) error
}) (*PanelPage, error) {
	var p PanelPage
	var icon, ctype, content, roles sql.NullString
	var name sql.NullString
	var enabled int
	var created, updated sql.NullTime
	if err := row.Scan(
		&p.ID, &p.Slug, &name, &icon, &ctype, &content,
		&enabled, &roles, &p.SortOrder, &created, &updated,
	); err != nil {
		return nil, err
	}
	p.Name = name.String
	p.IconSVG = icon.String
	p.ContentType = ctype.String
	if p.ContentType == "" {
		p.ContentType = "markdown"
	}
	p.Content = content.String
	p.Enabled = enabled != 0
	p.RoleIDs = decodePanelPageRoles(roles.String)
	if created.Valid {
		p.CreatedAt = created.Time
	}
	if updated.Valid {
		p.UpdatedAt = updated.Time
	}
	return &p, nil
}

const panelPageColumns = `id, slug, name, icon_svg, content_type, content, enabled, roles, sort_order, created_at, updated_at`

// decodePanelPageRoles parses the stored JSON role-id array. NULL/'[['
// ”/garbage all mean "every role" (nil) so old/corrupt rows stay visible
// instead of vanishing from every sidebar.
func decodePanelPageRoles(raw string) []int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" {
		return nil
	}
	var ids []int64
	if err := json.Unmarshal([]byte(raw), &ids); err != nil {
		return nil
	}
	out := ids[:0]
	seen := map[int64]bool{}
	for _, id := range ids {
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// encodePanelPageRoles canonicalises the role allow-list for storage.
// Empty/nil encodes as '[]' (= every role).
func encodePanelPageRoles(ids []int64) string {
	seen := map[int64]bool{}
	out := []int64{}
	for _, id := range ids {
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	if len(out) == 0 {
		return "[]"
	}
	raw, _ := json.Marshal(out)
	return string(raw)
}

// VisibleTo reports whether a caller holding roleID may see the page.
// Empty allow-list = every role (the editor's default).
func (p *PanelPage) VisibleTo(roleID int64) bool {
	if len(p.RoleIDs) == 0 {
		return true
	}
	for _, id := range p.RoleIDs {
		if id == roleID {
			return true
		}
	}
	return false
}

// List returns every page (admin view), ordered for the sidebar.
func (r *PanelPageRepository) List() ([]*PanelPage, error) {
	rows, err := r.db.Query(
		`SELECT ` + panelPageColumns + ` FROM panel_pages ORDER BY sort_order ASC, name ASC, id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list panel pages: %w", err)
	}
	defer rows.Close()
	out := []*PanelPage{}
	for rows.Next() {
		p, err := scanPanelPage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListNav returns enabled pages visible to roleID, ordered for the sidebar.
func (r *PanelPageRepository) ListNav(roleID int64) ([]PanelPageNav, error) {
	all, err := r.List()
	if err != nil {
		return nil, err
	}
	out := []PanelPageNav{}
	for _, p := range all {
		if !p.Enabled || !p.VisibleTo(roleID) {
			continue
		}
		out = append(out, PanelPageNav{
			Slug:    p.Slug,
			Name:    p.Name,
			IconSVG: p.IconSVG,
			URL:     "/pages/" + p.Slug,
		})
	}
	return out, nil
}

// Get returns one page by id.
func (r *PanelPageRepository) Get(id int64) (*PanelPage, error) {
	p, err := scanPanelPage(r.db.QueryRow(
		`SELECT `+panelPageColumns+` FROM panel_pages WHERE id = ?`, id,
	))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("panel page not found")
	}
	return p, err
}

// GetBySlug returns one page by slug.
func (r *PanelPageRepository) GetBySlug(slug string) (*PanelPage, error) {
	p, err := scanPanelPage(r.db.QueryRow(
		`SELECT `+panelPageColumns+` FROM panel_pages WHERE slug = ?`,
		strings.ToLower(strings.TrimSpace(slug)),
	))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("panel page not found")
	}
	return p, err
}

// PanelPageInput is the validated create/update payload.
type PanelPageInput struct {
	Slug        string
	Name        string
	IconSVG     string
	ContentType string
	Content     string
	Enabled     bool
	RoleIDs     []int64
	SortOrder   int
}

// Create inserts a page and returns it. The caller sanitizes IconSVG first.
func (r *PanelPageRepository) Create(in PanelPageInput) (*PanelPage, error) {
	slug := strings.ToLower(strings.TrimSpace(in.Slug))
	if err := ValidatePanelPageSlug(slug); err != nil {
		return nil, err
	}
	ctype := strings.ToLower(strings.TrimSpace(in.ContentType))
	if ctype == "" {
		ctype = "markdown"
	}
	if err := ValidatePanelPageContentType(ctype); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if len(name) > 128 {
		return nil, fmt.Errorf("name is too long (max 128)")
	}
	if len(in.Content) > MaxPanelPageContent {
		return nil, fmt.Errorf("content is too large (max %d bytes)", MaxPanelPageContent)
	}
	if len(in.IconSVG) > MaxPanelPageIcon {
		return nil, fmt.Errorf("icon is too large (max %d bytes)", MaxPanelPageIcon)
	}
	enabled := 0
	if in.Enabled {
		enabled = 1
	}
	if _, err := r.db.Exec(
		`INSERT INTO panel_pages (slug, name, icon_svg, content_type, content, enabled, roles, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		slug, name, in.IconSVG, ctype, in.Content, enabled,
		encodePanelPageRoles(in.RoleIDs), in.SortOrder,
	); err != nil {
		if isPanelPageConflict(err) {
			return nil, fmt.Errorf("a page with slug %q already exists", slug)
		}
		return nil, fmt.Errorf("create panel page: %w", err)
	}
	// Re-select by slug (portable across sqlite/mysql/postgres — pgx has
	// no LastInsertId, so we never rely on it, mirroring theme_repo).
	return r.GetBySlug(slug)
}

// Update overwrites a page by id and returns it.
func (r *PanelPageRepository) Update(id int64, in PanelPageInput) (*PanelPage, error) {
	if _, err := r.Get(id); err != nil {
		return nil, err
	}
	slug := strings.ToLower(strings.TrimSpace(in.Slug))
	if err := ValidatePanelPageSlug(slug); err != nil {
		return nil, err
	}
	ctype := strings.ToLower(strings.TrimSpace(in.ContentType))
	if ctype == "" {
		ctype = "markdown"
	}
	if err := ValidatePanelPageContentType(ctype); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if len(name) > 128 {
		return nil, fmt.Errorf("name is too long (max 128)")
	}
	if len(in.Content) > MaxPanelPageContent {
		return nil, fmt.Errorf("content is too large (max %d bytes)", MaxPanelPageContent)
	}
	if len(in.IconSVG) > MaxPanelPageIcon {
		return nil, fmt.Errorf("icon is too large (max %d bytes)", MaxPanelPageIcon)
	}
	enabled := 0
	if in.Enabled {
		enabled = 1
	}
	if _, err := r.db.Exec(
		`UPDATE panel_pages SET slug = ?, name = ?, icon_svg = ?, content_type = ?,
		 content = ?, enabled = ?, roles = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		slug, name, in.IconSVG, ctype, in.Content, enabled,
		encodePanelPageRoles(in.RoleIDs), in.SortOrder, id,
	); err != nil {
		if isPanelPageConflict(err) {
			return nil, fmt.Errorf("a page with slug %q already exists", slug)
		}
		return nil, fmt.Errorf("update panel page: %w", err)
	}
	return r.Get(id)
}

// Delete removes a page by id. Missing rows are a no-op success.
func (r *PanelPageRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM panel_pages WHERE id = ?`, id)
	return err
}

// isPanelPageConflict reports duplicate-slug violations across engines by
// message sniffing (sqlite/mysql/postgres all name the constraint or the
// value differently, but every one mentions duplicates/uniqueness).
func isPanelPageConflict(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate") ||
		strings.Contains(msg, "unique") ||
		strings.Contains(msg, "already exists")
}
