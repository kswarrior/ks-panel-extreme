-- 070_panel_pages.sql: admin-authored custom panel pages (About, Docs, …).
--
-- Each row is one sidebar page created on Settings > Pages:
--
--   slug         URL slug, lowercase alnum + dashes (route /pages/<slug>).
--   name         display label in the sidebar + page title.
--   icon_svg     sanitized inline SVG shown in the sidebar (may be empty —
--                the SPA falls back to a document glyph).
--   content_type 'html' | 'markdown' (validated in Go).
--   content      raw author markup (rendered sandboxed / as markdown).
--   enabled      0 = hidden everywhere (row kept as a draft).
--   roles        JSON array of role IDs allowed to see the page.
--                NULL/'[]'/'' = every role (the editor defaults to all).
--   sort_order   sidebar ordering (lower first, then name).

CREATE TABLE IF NOT EXISTS panel_pages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT     NOT NULL UNIQUE,
    name          TEXT     NOT NULL DEFAULT '',
    icon_svg      TEXT     NOT NULL DEFAULT '',
    content_type  TEXT     NOT NULL DEFAULT 'markdown' CHECK (content_type IN ('html','markdown')),
    content       TEXT     NOT NULL DEFAULT '',
    enabled       INTEGER  NOT NULL DEFAULT 1,
    roles         TEXT     NOT NULL DEFAULT '[]',
    sort_order    INTEGER  NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_panel_pages_enabled ON panel_pages(enabled);
CREATE INDEX IF NOT EXISTS idx_panel_pages_sort ON panel_pages(sort_order);
