-- 080_node_driver_host.sql: host-driver availability flag reported by ksedge
-- in its heartbeat. The panel renders a five-segment ring (docker / kvm /
-- multipass / lxd / host) on each node card; host needs no CLI binaries
-- (/bin/sh only) so an up-to-date edge always reports it true.
--
-- Postgres supports "ADD COLUMN IF NOT EXISTS" natively; db.go also guards
-- the column at runtime (mirrors 010_node_drivers.sql).

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS driver_host INTEGER NOT NULL DEFAULT 0;
