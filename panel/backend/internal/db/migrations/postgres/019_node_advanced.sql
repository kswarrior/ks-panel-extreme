-- 019_node_advanced.sql: per-edge health-check & safety configuration.
--
-- The original node row carried only (name, address, use_tls). Real-world
-- deployments want more: Cloudflare-tunnel edges expose a bare hostname
-- (no port), self-signed edges need a per-node TLS skip, and operators
-- want the panel to actively probe edges on a configurable cadence
-- instead of relying solely on the push heartbeat. This migration adds
-- the columns the NodeForm surfaces (and the sweep loop reads):
--
--   health_enabled   INTEGER NOT NULL DEFAULT 1   -- panel actively probes?
--   health_interval  INTEGER NOT NULL DEFAULT 60  -- seconds between probes
--   health_timeout   INTEGER NOT NULL DEFAULT 4   -- seconds to wait per probe
--   health_retries   INTEGER NOT NULL DEFAULT 3   -- failed attempts -> down
--   skip_tls_verify  INTEGER NOT NULL DEFAULT 0   -- per-node self-signed edge
--   notes            TEXT    NOT NULL DEFAULT ''  -- operator free-text
--   install_dir      TEXT    NOT NULL DEFAULT ''  -- local edge install path
--   allowed_kinds    TEXT    NOT NULL DEFAULT ''  -- comma-locked deploy kinds
--
-- Kept as one ALTER-per-column so a partially-applied migration converges
-- without "duplicate column name" errors (mirrors 010/014/018).

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS health_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS health_interval INTEGER NOT NULL DEFAULT 60;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS health_timeout INTEGER NOT NULL DEFAULT 4;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS health_retries INTEGER NOT NULL DEFAULT 3;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS skip_tls_verify INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS install_dir TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS allowed_kinds TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS probe_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS next_probe_at TIMESTAMP;
