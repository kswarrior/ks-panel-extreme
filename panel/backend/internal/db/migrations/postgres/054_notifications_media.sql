-- 054_notifications_media.sql: rich notification detail with media support (Postgres).
-- Adds notes + cover_image + media_json for detail page and dropdown media gallery.

ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS cover_image TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS media_json TEXT NOT NULL DEFAULT '[]';
