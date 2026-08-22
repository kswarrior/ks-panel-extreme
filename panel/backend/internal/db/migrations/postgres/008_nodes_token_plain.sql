-- 008_nodes_token_plain.sql: keep the raw edge token on the panel row.
--
-- See 004_nodes.sql for the inbound (edge→panel) hash design; this column
-- is the outbound (panel→edge) view used by lifecycle RPCs started in
-- 007_instances.sql. Kept in a separate migration so the existing edge
-- auth still works on rows created before this lands.
--
-- on PRAGMA table_info and skip the alter when the column is already there.
-- This makes the migration safe to re-run after a partial failure (e.g. an
-- earlier version added the column by another path).



ALTER TABLE nodes ADD COLUMN IF NOT EXISTS token_plain TEXT NOT NULL DEFAULT '';


