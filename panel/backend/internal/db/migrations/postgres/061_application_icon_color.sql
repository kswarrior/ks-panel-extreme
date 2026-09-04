-- 061_application_icon_color.sql: per-application accent colour.
--
-- One cosmetic column the Application Studio manages so an operator can
-- recognise an app at a glance on the Applications catalog cards:
--
--   color TEXT NOT NULL DEFAULT ''  -- accent hex colour ("#6366f1") used
--                                   -- to tint the tile on cards. Empty =
--                                   -- theme default. Constrained to
--                                   -- #rrggbb by the API handler.
--
-- icon itself already exists (029). Mirrors the 059_template_icon_color
-- pattern: one ALTER per column so a partially-applied migration converges
-- (the Go runner in db.go guards each ALTER individually — SQLite/MySQL
-- have no ADD COLUMN IF NOT EXISTS).

ALTER TABLE applications ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
