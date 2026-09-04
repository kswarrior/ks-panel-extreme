-- 062_node_wss_channels.sql: named WSS channels per node (task routing).
--
-- Each row is one WSS channel binding shown in the NodeForm's WSS box
-- (top-right Add button). Columns:
--
--   name       operator label for the channel (unique per node, enforced in Go).
--   task       which traffic this channel handles:
--                all      = handles every WSS payload (catch-all).
--                files    = file-manager transfers go via this channel.
--                node     = node telemetry (resources, uptime, probe/health).
--                instance = instance lifecycle (deploy/delete/edit/start/stop,
--                           install, exec).
--              Multiple rows may share the same task; the panel divides that
--              task's data across them round-robin (logical division over the
--              node's single tunnel socket).
--   transport  preferred transport, used by both/local_both modes:
--                wss  = force WSS tunnel for this task.
--                port = force direct HTTP (port) for this task.
--                auto = WSS when the tunnel is connected, else HTTP, plus
--                       emergency fallback on overload/disconnect.
--              Pure WSS modes (reverse_tunnel/local_wss) ignore this and
--              always use WSS.
--   fallback   1 = emergency fallback to the other transport on overload or
--              disconnect when transport is forced (wss/port). 0 = strict.
--   position   ordering for the UI list.
--
-- Lifecycle: Create/Update node replaces the whole set transactionally;
-- DELETE FROM nodes cascades here. Validation lives in Go; the CHECKs are
-- the durable backstop.

CREATE TABLE IF NOT EXISTS node_wss_channels (
    id         SERIAL PRIMARY KEY,
    node_id    INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL DEFAULT '',
    task       TEXT    NOT NULL DEFAULT 'all' CHECK (task IN ('all','files','node','instance')),
    transport  TEXT    NOT NULL DEFAULT 'auto' CHECK (transport IN ('wss','port','auto')),
    fallback   INTEGER NOT NULL DEFAULT 1,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_node_wss_channels_node ON node_wss_channels(node_id);
