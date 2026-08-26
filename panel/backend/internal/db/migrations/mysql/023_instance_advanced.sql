-- 023_instance_advanced.sql: snapshots, per-instance audit, and
-- edge-sourced live state caches (metrics summary, process list, ports).
--
-- Snapshots are driver-managed backups the edge creates on demand
-- (docker commit / lxc snapshot / virsh snapshot-create / multipass
-- ...). The panel stores the reference + provenance; the restore RPC
-- tells the edge to roll back. We don't keep the bytes themselves (they
-- live on the node) — only metadata.
--
-- instance_audit is a per-instance timeline that complements the global
-- activity_logs: filtered, fast, and instance-owned so the per-instance
-- "Audit log" page can render without joining users across the whole
-- panel.
--
-- instance_live_state is a single-row (per-instance) cache the panel
-- refreshes on read from the edge, holding the latest metrics/process/
-- port snapshot returned by ksedge. It keeps the UI paint as one round
-- trip even though the data is fetched lazily from the edge.

CREATE TABLE IF NOT EXISTS instance_snapshots (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    instance_id  INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    external_ref TEXT    NOT NULL DEFAULT '',            -- edge-side snapshot id/name
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    note         TEXT    NOT NULL DEFAULT '',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (instance_id, name)
);

CREATE INDEX instance_snapshots_inst_idx ON instance_snapshots(instance_id, created_at DESC);

CREATE TABLE IF NOT EXISTS instance_audit (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    instance_id  INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    actor        TEXT    NOT NULL DEFAULT '',            -- username or 'system'
    action       TEXT    NOT NULL,
    detail       TEXT    NOT NULL DEFAULT '',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX instance_audit_inst_idx ON instance_audit(instance_id, created_at DESC);

CREATE TABLE IF NOT EXISTS instance_live_state (
    instance_id  INTEGER PRIMARY KEY REFERENCES instances(id) ON DELETE CASCADE,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metrics      TEXT    NOT NULL DEFAULT '{}',           -- JSON: cpu/mem/disk/net
    processes    TEXT    NOT NULL DEFAULT '[]',           -- JSON: [{pid,cmd,cpu,mem,...}]
    ports        TEXT    NOT NULL DEFAULT '[]',           -- JSON: [{proto,laddr,raddr,pid,state}]
    info         TEXT    NOT NULL DEFAULT '{}'            -- JSON: driver-supplied inspect blob
);
