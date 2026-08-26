-- 032_instance_pages.sql: reusable page definitions for instance templates.
-- Instance pages are admin-defined content pages (HTML/markdown/visual blocks)
-- that can be referenced by templates to provide custom documentation, dashboards,
-- or configuration UIs within the instance panel sidebar.
--
-- Each page has:
--   - name: human-readable label for the sidebar
--   - slug: URL-safe path segment (e.g. "getting-started", "api-reference")
--   - kind: "builtin" (panel-provided) or "custom" (admin-authored content)
--   - category: optional grouping tag (e.g. "docs", "reference", "guides")
--   - content_type: "html" | "markdown" | "blocks" — how the content is stored
--   - content_html / content_markdown / content_blocks: mutually exclusive payloads
--   - icon_svg: optional raw SVG inner markup for a custom sidebar icon

CREATE TABLE IF NOT EXISTS instance_pages (
    id              SERIAL PRIMARY KEY,
    name            TEXT    NOT NULL,
    slug            TEXT    NOT NULL UNIQUE,
    kind            TEXT    NOT NULL DEFAULT 'custom',
    category        TEXT    NOT NULL DEFAULT '',
    description     TEXT    NOT NULL DEFAULT '',
    content_type    TEXT    NOT NULL DEFAULT 'markdown',
    content_html    TEXT    NOT NULL DEFAULT '',
    content_markdown TEXT    NOT NULL DEFAULT '',
    content_blocks  TEXT    NOT NULL DEFAULT '',
    icon_svg        TEXT    NOT NULL DEFAULT '',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instance_pages_kind      ON instance_pages(kind);
CREATE INDEX IF NOT EXISTS idx_instance_pages_category  ON instance_pages(category);

-- Seed the permission keys so the admin's role picks them up on launch.
INSERT OR IGNORE INTO permissions (key, description) VALUES
    ('MANAGE_INSTANCE_PAGES', 'Manage instance page definitions (create, edit, delete)'),
    ('INSTANCE_PAGES_VIEW',   'View instance page definitions'),
    ('INSTANCE_PAGES_CREATE', 'Create new instance page definitions'),
    ('INSTANCE_PAGES_EDIT',   'Edit instance page definitions'),
    ('INSTANCE_PAGES_DELETE', 'Delete instance page definitions');