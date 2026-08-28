-- 010_node_drivers.sql: per-driver availability flags reported by ksedge in
-- its heartbeat. The panel renders a four-segment ring (docker / kvm /
-- multipass / lxd) on each node card; a missing driver stays grey so admins
-- can see at a glance what an edge can actually execute.
--
-- SQLite has no "ALTER TABLE ADD COLUMN IF NOT EXISTS", so the migration
-- framework checks each column at runtime and skips it when present
-- (see db.go's hasColumn).

ALTER TABLE nodes ADD COLUMN driver_docker INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN driver_kvm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN driver_multipass INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN driver_lxd INTEGER NOT NULL DEFAULT 0;
