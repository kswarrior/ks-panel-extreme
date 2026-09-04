-- 060_instance_page_icon_color.sql: per-page accent colour.
--
-- One cosmetic column the Instance Page Studio manages so an operator can
-- recognise a page at a glance on the Instance Pages library cards:
--
--   icon_color TEXT NOT NULL DEFAULT ''  -- accent hex colour ("#38bdf8")
--                                        -- tinting the icon_svg tile.
--                                        -- Empty = theme default.
--                                        -- Constrained to #rrggbb by the
--                                        -- API handler.
--
-- icon_svg itself already exists (032). Mirrors the 059_template_icon_color
-- pattern: one ALTER per column so a partially-applied migration converges
-- (the Go runner in db.go guards each ALTER individually — SQLite/MySQL
-- have no ADD COLUMN IF NOT EXISTS).

ALTER TABLE instance_pages ADD COLUMN IF NOT EXISTS icon_color TEXT NOT NULL DEFAULT '';
