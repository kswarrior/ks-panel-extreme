-- 026_node_category_location.sql: operator-set categorization + per-node
-- location labelling.
--
-- Two pieces of free-form metadata the admin UI needs to show alongside an
-- edge so an operator with many panels (homelab + production + staging + a
-- dozen regional VPS providers) can recognise the row at a glance:
--
--   category          TEXT    NOT NULL DEFAULT ''  -- free-text bucket label
--                                                    -- ("production",
--                                                    -- "staging", "dev",
--                                                    -- "tenant-acme", …)
--   location_country  TEXT    NOT NULL DEFAULT ''  -- ISO-3166 alpha-2 code
--                                                    -- ("IN", "US", "DE", …)
--   location_node     TEXT    NOT NULL DEFAULT ''  -- operator's per-site
--                                                    -- label ("node-1",
--                                                    -- "rack-a3", …)
--
-- Country is stored as the ISO code rather than the emoji/name so the schema
-- stays locale-stable (no UTF-8 twemoji migration risk) and the UI can
-- resolve emoji + display name from a client-side lookup table. The two
-- location_* columns are intentionally NOT a composite; site-name lives
-- separately from country so a future "rename" or "move" doesn't have to
-- touch both. The card renders `${flag} ${countryName} - ${locationNode}`,
-- falling back to the raw `location_node` when the country code is empty.
--
-- Mirrors the 010/014/018/019/025 migration pattern of one guarded ALTER
-- per column. SQLite has no ADD COLUMN IF NOT EXISTS, so the Go migration
-- runner (db.go) applies each ALTER individually and skips columns that
-- are already present.

ALTER TABLE nodes ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN location_country TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN location_node TEXT NOT NULL DEFAULT '';
