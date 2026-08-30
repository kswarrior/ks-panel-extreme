-- 054_notifications_media.sql: rich notification detail with media support (MySQL).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cover_image TEXT NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS media_json TEXT NOT NULL;
