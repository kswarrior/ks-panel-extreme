-- 056_instance_page_source.sql: track page provenance for the Instance Pages
-- library badges (market / edited / studio) and the "resync from market
-- links" update flow.
--
--   - source: 'studio' (default, own pages incl. Studio/file/URL creates),
--     'market' (fresh import from marketplace, unmodified),
--     'edited' (market import later modified in the Studio).
--   - market_id: marketplace catalog id the row was imported from ("" == none).
--   - market_version: catalog version string at import time ("" == unknown).
--
-- The ALTERs are applied via the runtime-guarded path in internal/db/db.go
-- (mirrors 049_instance_page_components.sql) so re-launches are idempotent on
-- every dialect.

ALTER TABLE instance_pages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'studio';
ALTER TABLE instance_pages ADD COLUMN IF NOT EXISTS market_id TEXT NOT NULL DEFAULT '';
ALTER TABLE instance_pages ADD COLUMN IF NOT EXISTS market_version TEXT NOT NULL DEFAULT '';
