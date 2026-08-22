-- 018_user_profile.sql: per-user Discord-like profile fields.
--
-- Display name, bio/about, pronouns and an accent color are scalar columns on
-- the users row. The avatar and banner are stored on disk (bytes) next to the
-- SQLite DB under <datadir>/users/<id>/; the row only keeps the MIME + on-disk
-- filename metadata so we don't bloat the database with image data. This
-- mirrors the panel-logo pattern in 009_panel_logo.sql.
--
-- avatar_symbol holds a stable key for a built-in default avatar symbol ("svg"
-- or an emoji/short code) used when the user has not uploaded an avatar image.
-- social_links is a JSON-encoded array of {type,label,url} entries the user
-- authored (YouTube, GitHub, Hugging Face, ...); kept as TEXT so we can evolve
-- the schema without a migration, validated at the API layer.
--
-- framework checks each column at runtime (see db.go's hasColumn) and skips
-- the ALTER when the column is already present, letting a partially-migrated
-- DB converge without "duplicate column name" errors.

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_symbol TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_filename TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_mime TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_filename TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links TEXT NOT NULL DEFAULT '';
