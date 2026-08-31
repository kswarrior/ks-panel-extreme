-- 014_role_display_color.sql: human-facing display name + accent colour for
-- roles.
--
-- `name` stays the machine identifier (the CLI resolves roles by it, e.g.
-- admin/moderator/user) while `display_name` is the optional human label
-- shown in the UI — when empty the panel falls back to `name`. `color` is
-- a CSS colour string (hex/hsl/rgb/known tailwind token) used to tint the
-- role's badge/avatar.
--
-- SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS, so we guard on PRAGMA
-- table_info in db.go and skip the alter when the column is already there,
-- making the migration safe to re-run after a partial failure.

PRAGMA foreign_keys=OFF;

ALTER TABLE roles ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN color TEXT NOT NULL DEFAULT '';

PRAGMA foreign_keys=ON;
