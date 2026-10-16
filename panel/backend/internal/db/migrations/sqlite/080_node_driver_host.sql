-- 080_node_driver_host.sql: host-driver availability flag reported by ksedge
-- in its heartbeat. The panel renders a five-segment ring (docker / kvm /
-- multipass / lxd / host) on each node card; host needs no CLI binaries
-- (/bin/sh only) so an up-to-date edge always reports it true.
--
-- SQLite has no "ALTER TABLE ADD COLUMN IF NOT EXISTS", so the migration
-- framework checks the column at runtime and skips it when present
-- (see db.go's hasColumn).

ALTER TABLE nodes ADD COLUMN driver_host INTEGER NOT NULL DEFAULT 0;
