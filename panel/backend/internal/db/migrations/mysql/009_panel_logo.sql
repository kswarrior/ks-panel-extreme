-- 009_panel_logo.sql: optional logo columns. The actual bytes live on disk
-- next to the SQLite DB (the panel data directory) so we don't bloat the
-- database with image data. The settings table stores the MIME type and the
-- on-disk filename (just the basename); the public
-- /api/settings/panel-logo endpoint streams the file back with the right
-- Content-Type.
--
-- framework checks both columns at runtime and skips this file when they
-- already exist (see db.go's hasColumn).

ALTER TABLE settings ADD COLUMN logo_mime TEXT;
ALTER TABLE settings ADD COLUMN logo_filename TEXT;
