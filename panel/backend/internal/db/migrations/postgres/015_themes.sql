-- 015_themes.sql: server-side GLOBAL themes shared by every user.
--
-- Themes are the JSON appearance specs the Theme Studio produces. The panel
-- already kept them in the browser's localStorage (personal themes); this
-- table is the shared, admin-managed GLOBAL layer so an administrator can
-- build a theme once and have EVERY user see it on whichever area/page the
-- admin assigns it to.
--
-- Precedence at runtime is the same precedence the frontend resolver uses,
-- with the addition that a user's own PERSONAL (localStorage) assignment
-- always wins over the admin's global one: local > global > built-in default.
--
-- `spec` holds the full Theme object (background / card / sidebar / button /
-- header / typography / accent / shape) serialised as JSON. It is opaque to
-- the backend on purpose — the Go layer never inspect theme tokens, it only
-- stores + returns them — which keeps the API a pass-through and lets the
-- studio add fields without a migration.
--
-- `created_by` records the admin who minted the theme for audit; it is nullable
-- because an admin-deleted user should not orphan their published themes
-- (the theme is a shared asset, not personal data).

CREATE TABLE IF NOT EXISTS themes (
    id          TEXT    PRIMARY KEY,          -- client-generated stable id, e.g. "theme-<ts>"
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    spec        TEXT    NOT NULL,             -- JSON-encoded Theme object
    builtin     INTEGER NOT NULL DEFAULT 0,   -- 0 = user-created (the seed default lives in the frontend only)
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS themes_created_by_idx ON themes(created_by);

-- theme_assignments maps a scope (an area id like "admin" or a page id like
-- "admin.users") to the global theme that should paint it for everyone. The
-- scope string is the SAME shape the frontend uses for localStorage
-- assignments, so the resolver treats both maps uniformly.
--
-- Exactly one row per scope: assigning a different theme to a scope is an
-- UPSERT (the unique constraint enforces this), un-assigning is a DELETE.
CREATE TABLE IF NOT EXISTS theme_assignments (
    scope     TEXT    PRIMARY KEY,           -- "area:<id>" or "page:<id>"
    theme_id  TEXT    NOT NULL REFERENCES themes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS theme_assignments_theme_idx ON theme_assignments(theme_id);
