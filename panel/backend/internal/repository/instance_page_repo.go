package repository

import (
	"database/sql"
	"fmt"

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
	rows, err := r.db.Query(`SELECT p.id, p.name, p.slug, p.kind, p.category, p.page_type, p.description, p.content_type, p.content_html, p.content_markdown, p.content_blocks, p.icon_svg, COALESCE(p.icon_color, ''), p.actions, p.sub_pages, p.components, p.configure, COALESCE(p.source_tsx, ''), COALESCE(p.bundle_js, ''), COALESCE(p.bundle_css, ''), COALESCE(p.build_status, ''), COALESCE(p.build_log, ''), p.created_at, p.updated_at,
		COALESCE(p.owner_id, 0),
		COALESCE((SELECT username FROM users WHERE id = p.owner_id), ''),
		COALESCE(p.source, 'studio'),
		COALESCE(p.market_id, ''),
		COALESCE(p.market_version, '')
		FROM instance_pages p ORDER BY p.name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p models.InstancePage
		var created, updated string
		var actions, subPages, components, configure sql.NullString
		var sourceTSX, bundleJS, bundleCSS, buildStatus, buildLog sql.NullString
		var ownerID sql.NullInt64
		var ownerName sql.NullString
		var source, marketID, marketVersion sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.Kind, &p.Category, &p.PageType, &p.Description, &p.ContentType, &p.ContentHTML, &p.ContentMarkdown, &p.ContentBlocks, &p.IconSVG, &p.IconColor, &actions, &subPages, &components, &configure, &sourceTSX, &bundleJS, &bundleCSS, &buildStatus, &buildLog, &created, &updated, &ownerID, &ownerName, &source, &marketID, &marketVersion); err != nil {
			return nil, err
		}
		p.Actions = actions.String
		p.SubPages = subPages.String
		p.Components = components.String
		p.Configure = configure.String
		p.SourceTSX = sourceTSX.String
		p.BundleJS = bundleJS.String
		p.BundleCSS = bundleCSS.String
		p.BuildStatus = buildStatus.String
		p.BuildLog = buildLog.String
		p.Source = source.String
		p.MarketID = marketID.String
		p.MarketVersion = marketVersion.String
		if ownerID.Valid {
			p.OwnerID = ownerID.Int64
			p.OwnerName = ownerName.String
		}
		p.CreatedAt, _ = parseDBTime(created)
		p.UpdatedAt, _ = parseDBTime(updated)
		out = append(out, p)
	}
	return out, rows.Err()
}

// Get fetches a single instance page by id.
func (r *InstancePageRepository) Get(id int64) (*models.InstancePage, error) {
	var p models.InstancePage
	var pid, ownerID sql.NullInt64
	var name, slug, kind, category, pageType, desc, contentType, contentHTML, contentMarkdown, contentBlocks, iconSVG, iconColor, actions, subPages, components, configure, sourceTSX, bundleJS, bundleCSS, buildStatus, buildLog, created, updated, ownerName, source, marketID, marketVersion sql.NullString
	err := r.db.QueryRow(`SELECT p.id, p.name, p.slug, p.kind, p.category, p.page_type, p.description, p.content_type, p.content_html, p.content_markdown, p.content_blocks, p.icon_svg, COALESCE(p.icon_color, ''), p.actions, p.sub_pages, p.components, p.configure, COALESCE(p.source_tsx, ''), COALESCE(p.bundle_js, ''), COALESCE(p.bundle_css, ''), COALESCE(p.build_status, ''), COALESCE(p.build_log, ''), p.created_at, p.updated_at,
		COALESCE(p.owner_id, 0),
		COALESCE((SELECT username FROM users WHERE id = p.owner_id), ''),
		COALESCE(p.source, 'studio'),
		COALESCE(p.market_id, ''),
		COALESCE(p.market_version, '')
		FROM instance_pages p WHERE p.id = ?`, id).Scan(
		&pid, &name, &slug, &kind, &category, &pageType, &desc, &contentType, &contentHTML, &contentMarkdown, &contentBlocks, &iconSVG, &iconColor, &actions, &subPages, &components, &configure, &sourceTSX, &bundleJS, &bundleCSS, &buildStatus, &buildLog, &created, &updated, &ownerID, &ownerName, &source, &marketID, &marketVersion)
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
	if ownerID.Valid {
		p.OwnerID = ownerID.Int64
		p.OwnerName = ownerName.String
	}
	p.IconSVG = iconSVG.String
	p.IconColor = iconColor.String
	p.Actions = actions.String
	p.SubPages = subPages.String
	p.Components = components.String
	p.Configure = configure.String
	p.SourceTSX = sourceTSX.String
	p.BundleJS = bundleJS.String
	p.BundleCSS = bundleCSS.String
	p.BuildStatus = buildStatus.String
	p.BuildLog = buildLog.String
	p.Source = source.String
	p.MarketID = marketID.String
	p.MarketVersion = marketVersion.String
	p.CreatedAt, _ = parseDBTime(created.String)
	p.UpdatedAt, _ = parseDBTime(updated.String)
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
	// IconColor is an optional #rrggbb accent tinting the tile (060).
	IconColor string
	// Actions is a JSON array of executable page actions ("" == none). The
	// caller (handler) is responsible for validating it parses as an array.
	Actions string
	// SubPages is a JSON array of extra page definitions ("" == none). The
	// caller (handler) validates shape; see validateInstancePage.
	SubPages string
	// Components is a JSON array of reusable UI blocks ("" == none). The
	// caller (handler) validates shape; see validateInstancePage.
	Components string
	// Configure is a JSON array of page-level env-style var definitions
	// ("" == none). The caller validates shape; see validateInstancePage.
	Configure string
	// SourceTSX is the author React JS source for content_type == "react"
	// ("" == non-React page). Migration 075.
	SourceTSX string
	// BundleJS/BundleCSS are validated build outputs ("" == not built).
	// Migration 075.
	BundleJS  string
	BundleCSS string
	// BuildStatus is "" | "building" | "ok" | "error". Migration 075.
	BuildStatus string
	// BuildLog carries the last build output. Migration 075.
	BuildLog string
	// OwnerID ties the page to the user that authored it. Migration 054
	// wires the INSTANCE_PAGES_OWN / _ALL scope keys; see the
	// handler for the full contract.
	OwnerID int64
	// Source tracks provenance: "studio" (own), "market" (fresh market
	// import), "edited" (market import later modified). "" == "studio".
	Source string
	// MarketID is the marketplace catalog id ("" == not a market page).
	MarketID string
	// MarketVersion is the catalog version at import time.
	MarketVersion string
}

// Create inserts a new instance page. The handler populates OwnerID
// from the caller so the migration-054 scope filter has a value to
// match against (pre-054 rows stay orphan — visible only to admins).
// OwnerID 0 is the orphan / CLI / seed path — omit the column so the
// row lands with NULL (which the FK allows) instead of 0 or bare nil.
func (r *InstancePageRepository) Create(in InstancePageInput) (int64, error) {
	var res sql.Result
	var err error
	if in.OwnerID != 0 {
		res, err = r.db.Exec(`INSERT INTO instance_pages (name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, source_tsx, bundle_js, bundle_css, build_status, build_log, icon_svg, icon_color, actions, sub_pages, components, configure, owner_id, source, market_id, market_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			in.Name, in.Slug, in.Kind, in.Category, in.PageType, in.Description, in.ContentType, in.ContentHTML, in.ContentMarkdown, in.ContentBlocks, in.SourceTSX, in.BundleJS, in.BundleCSS, in.BuildStatus, in.BuildLog, in.IconSVG, in.IconColor, in.Actions, in.SubPages, in.Components, in.Configure, in.OwnerID, in.Source, in.MarketID, in.MarketVersion)
	} else {
		res, err = r.db.Exec(`INSERT INTO instance_pages (name, slug, kind, category, page_type, description, content_type, content_html, content_markdown, content_blocks, source_tsx, bundle_js, bundle_css, build_status, build_log, icon_svg, icon_color, actions, sub_pages, components, configure, source, market_id, market_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			in.Name, in.Slug, in.Kind, in.Category, in.PageType, in.Description, in.ContentType, in.ContentHTML, in.ContentMarkdown, in.ContentBlocks, in.SourceTSX, in.BundleJS, in.BundleCSS, in.BuildStatus, in.BuildLog, in.IconSVG, in.IconColor, in.Actions, in.SubPages, in.Components, in.Configure, in.Source, in.MarketID, in.MarketVersion)
	}
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update patches an editable instance page. React bundle columns are owned
// by the build endpoint, not by Update — Update preserves them so a plain
// Studio save never clobbers a good build. Use UpdateBuild to write them.
func (r *InstancePageRepository) Update(id int64, in InstancePageInput) error {
	res, err := r.db.Exec(`UPDATE instance_pages SET name = ?, slug = ?, kind = ?, category = ?, page_type = ?, description = ?, content_type = ?, content_html = ?, content_markdown = ?, content_blocks = ?, source_tsx = ?, icon_svg = ?, icon_color = ?, actions = ?, sub_pages = ?, components = ?, configure = ?, source = ?, market_id = ?, market_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		in.Name, in.Slug, in.Kind, in.Category, in.PageType, in.Description, in.ContentType, in.ContentHTML, in.ContentMarkdown, in.ContentBlocks, in.SourceTSX, in.IconSVG, in.IconColor, in.Actions, in.SubPages, in.Components, in.Configure, in.Source, in.MarketID, in.MarketVersion, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance page not found")
	}
	return nil
}

// UpdateBuild writes the build-owned columns after POST /:id/build.
// SourceTSX is NOT touched here — it stays the author input that Update owns.
func (r *InstancePageRepository) UpdateBuild(id int64, bundleJS, bundleCSS, buildStatus, buildLog string) error {
	res, err := r.db.Exec(`UPDATE instance_pages SET bundle_js = ?, bundle_css = ?, build_status = ?, build_log = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		bundleJS, bundleCSS, buildStatus, buildLog, id)
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
