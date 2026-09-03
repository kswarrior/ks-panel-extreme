-- 059_template_icon_color.sql: per-template display identity.
--
-- Two cosmetic columns the TemplateForm manages so an operator can
-- recognise a blueprint at a glance on the Templates page and in the
-- deploy-instance template picker:
--
--   icon  TEXT NOT NULL DEFAULT ''  -- raw SVG markup for the template
--                                   -- tile (same convention as instances:
--                                   -- full <svg>…</svg> block, empty =
--                                   -- driver kind glyph).
--   color TEXT NOT NULL DEFAULT ''  -- accent hex colour ("#a78bfa") used
--                                   -- to tint the tile on cards. Empty =
--                                   -- theme default. Constrained to
--                                   -- #rrggbb by the API handler.
--
-- Mirrors the 035_instance_display / 044_node_icon_color pattern: one
-- ALTER per column so a partially-applied migration converges (the Go
-- runner in db.go guards each ALTER individually — SQLite/MySQL have no
-- ADD COLUMN IF NOT EXISTS).

ALTER TABLE templates ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE templates ADD COLUMN color TEXT NOT NULL DEFAULT '';
