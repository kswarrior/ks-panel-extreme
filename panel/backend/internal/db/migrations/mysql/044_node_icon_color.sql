-- 044_node_icon_color.sql: per-node display identity.
--
-- Two cosmetic columns the NodeForm General tab manages so an operator can
-- recognise an edge at a glance on the Nodes page:
--
--   icon  TEXT NOT NULL DEFAULT ('')  -- symbolic icon key ("server", "cloud",
--                                   -- "shield", …). Empty = the default
--                                   -- heartbeat glyph. The panel validates
--                                   -- the key against its fixed icon set;
--                                   -- nothing arbitrary is stored.
--   color TEXT NOT NULL DEFAULT ('')  -- accent hex colour ("#34d399") used to
--                                   -- tint the icon chip on cards. Empty =
--                                   -- theme default grey. Constrained to
--                                   -- #rrggbb by the API handler.
--
-- Mirrors the 010/014/018/019/025/026 migration pattern: one ALTER per
-- column so a partially-applied migration converges (the Go runner in
-- db.go guards each ALTER individually — SQLite/MySQL have no
-- ADD COLUMN IF NOT EXISTS).
--
-- NOTE: uniqueness of the (name, location_node) pair is enforced by the
-- node API handlers at runtime rather than by a UNIQUE index here — a
-- unique index would fail to build on legacy installs that already carry
-- duplicate rows, breaking startup on all three engines.

ALTER TABLE nodes ADD COLUMN icon TEXT NOT NULL DEFAULT ('');
ALTER TABLE nodes ADD COLUMN color TEXT NOT NULL DEFAULT ('');
