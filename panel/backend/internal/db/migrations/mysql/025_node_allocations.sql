-- 025_node_allocations.sql: panel-side per-node resource allocation overrides.
--
-- The node row already carries `ram_total` / `disk_total` columns, but those
-- are the LIVE telemetry the edge pushes on every heartbeat (in bytes) — they
-- reflect what the box actually has, not what the operator wants to allow.
-- Real-world deployments want the panel-side picture of "how much of this edge
-- am I willing to spend", expressed here as:
--
--   alloc_mem_mib        INTEGER NOT NULL DEFAULT 0   -- total memory cap (MiB)
--   mem_overcommit_pct   INTEGER NOT NULL DEFAULT 0   -- allowed over-allocation (%)
--   alloc_disk_mib       INTEGER NOT NULL DEFAULT 0   -- total disk cap (MiB)
--   disk_overcommit_pct  INTEGER NOT NULL DEFAULT 0   -- allowed over-allocation (%)
--   instances_dir        TEXT    NOT NULL DEFAULT ('')  -- daemon instance file dir
--
-- 0 means "unset / inherit live telemetry"; the deploy handler will fall
-- back to the heartbeat-reported totals when the operator left the cap
-- empty, so legacy rows stay permissive. instances_dir is a path passed to
-- ksedge so the daemon knows where to keep its instance working files
-- (default ./instances inside the edge's working directory).
--
-- Kept as one ALTER-per-column so a partially-applied migration converges
-- without "duplicate column name" errors (mirrors 010/014/018/019/024). The
-- Go migration runner (db.go) guards each ALTER individually — when this
-- migration runs through `kspanel` it never re-exec's this file, so these
-- bare ALTERs are only used as a reference / for plain sqlite3-cli installs.

ALTER TABLE nodes ADD COLUMN alloc_mem_mib INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN mem_overcommit_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN alloc_disk_mib INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN disk_overcommit_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN instances_dir TEXT NOT NULL DEFAULT ('');
