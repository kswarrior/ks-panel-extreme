package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// InstancePageRepository manages the `instance_pages` table. These are reusable
// page definitions that template authors can reference to provide custom
// documentation, dashboards, or configuration UIs in the instance panel sidebar.
type InstancePageRepository struct {
	db *sql.DB
}

func NewInstancePageRepository(db *sql.DB) *InstancePageRepository {
	return &InstancePageRepository{db: db}
}

// List returns all instance pages ordered by name for deterministic UI rendering.
func (r *InstancePageRepository) List() ([]models.InstancePage, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_pages`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.InstancePage, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, icon_svg, actions, sub_pages, created_at, updated_at
		FROM instance_pages ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p models.InstancePage
		var created, updated string
		var actions, subPages sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.Kind, &p.Category, &p.PageType, &p.Description, &p.ContentType, &p.ContentHTML, &p.ContentMarkdown, &p.ContentBlocks, &p.IconSVG, &actions, &subPages, &created, &updated); err != nil {
			return nil, err
		}
		p.Actions = actions.String
		p.SubPages = subPages.String
		p.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		p.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated)
		out = append(out, p)
	}
	return out, rows.Err()
}

// Get fetches a single instance page by id.
func (r *InstancePageRepository) Get(id int64) (*models.InstancePage, error) {
	var p models.InstancePage
	var pid sql.NullInt64
	var name, slug, kind, category, pageType, desc, contentType, contentHTML, contentMarkdown, contentBlocks, iconSVG, actions, subPages, created, updated sql.NullString
	err := r.db.QueryRow(`SELECT id, name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, icon_svg, actions, sub_pages, created_at, updated_at
		FROM instance_pages WHERE id = ?`, id).Scan(
		&pid, &name, &slug, &kind, &category, &pageType, &desc, &contentType, &contentHTML, &contentMarkdown, &contentBlocks, &iconSVG, &actions, &subPages, &created, &updated)
	if err != nil || !pid.Valid {
		return nil, fmt.Errorf("instance page not found")
	}
	p.ID = pid.Int64
	p.Name = name.String
	p.Slug = slug.String
	p.Kind = kind.String
	p.Category = category.String
	p.PageType = pageType.String
	p.Description = desc.String
	p.ContentType = contentType.String
	p.ContentHTML = contentHTML.String
	p.ContentMarkdown = contentMarkdown.String
	p.ContentBlocks = contentBlocks.String
	p.IconSVG = iconSVG.String
	p.Actions = actions.String
	p.SubPages = subPages.String
	p.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
	p.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated.String)
	return &p, nil
}

// CreateInput is the editable surface the admin handler passes.
type InstancePageInput struct {
	Name            string
	Slug            string
	Kind            string
	Category        string
	// PageType is the API "type" field (column page_type): free-form page
	// flavor tag (dashboard, status, docs, …). "" == unset.
	PageType        string
	Description     string
	ContentType     string
	ContentHTML     string
	ContentMarkdown string
	ContentBlocks   string
	IconSVG         string
	// Actions is a JSON array of executable page actions ("" == none). The
	// caller (handler) is responsible for validating it parses as an array.
	Actions string
	// SubPages is a JSON array of extra page definitions ("" == none). The
	// caller (handler) validates shape; see validateInstancePage.
	SubPages string
}

// Create inserts a new instance page.
func (r *InstancePageRepository) Create(in InstancePageInput) (int64, error) {
	res, err := r.db.Exec(`INSERT INTO instance_pages (name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, icon_svg, actions, sub_pages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.Name, in.Slug, in.Kind, in.Category, in.PageType, in.Description, in.ContentType, in.ContentHTML, in.ContentMarkdown, in.ContentBlocks, in.IconSVG, in.Actions, in.SubPages)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update patches an editable instance page.
func (r *InstancePageRepository) Update(id int64, in InstancePageInput) error {
	res, err := r.db.Exec(`UPDATE instance_pages SET name = ?, slug = ?, kind = ?, category = ?, description = ?, content_type = ?, content_html = ?, content_markdown = ?, content_blocks = ?, icon_svg = ?, actions = ?, sub_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		in.Name, in.Slug, in.Kind, in.Category, in.Description, in.ContentType, in.ContentHTML, in.ContentMarkdown, in.ContentBlocks, in.IconSVG, in.Actions, in.SubPages, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance page not found")
	}
	return nil
}

// Delete removes an instance page.
func (r *InstancePageRepository) Delete(id int64) error {
	res, err := r.db.Exec(`DELETE FROM instance_pages WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance page not found")
	}
	return nil
}
