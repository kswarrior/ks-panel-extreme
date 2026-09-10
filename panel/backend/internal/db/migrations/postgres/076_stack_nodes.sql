-- 076_stack_nodes.sql: node-style remote pairing for stacks.
--
-- A stack app (dashboard/tool) may run on another host or the same host,
-- like an edge node does. The panel mints a pairing token once (returned
-- only at create/rotate time, SHA-256 stored — mirrors 004_nodes.sql) so
-- the app connects WITHOUT any manual API key. The app pushes heartbeats
-- (POST /api/stacks/heartbeat, token-in-body) which flip status up/down
-- and refresh last_seen_at; the admin Verify button actively dials the
-- app's /health (probe) like ProbeNodeHandler does for edges.
--
--   remote_address    VARCHAR(255) DEFAULT '' — host:port or bare host of
--                                              the stack app ("" = same-host
--                                              loopback via proxy_port).
--   remote_use_tls    0/1 — https:// when dialing remote_address.
--   remote_skip_verify 0/1 — skip TLS verify for self-signed remotes.
--   token_hash        SHA-256 hex of the pairing token ("" = never minted).
--   token_prefix      first 8 chars shown in the UI for recognition.
--   token_plain       raw token kept for the config-snippet view (mirrors
--                     008_nodes_token_plain.sql outbound view).
--   status            'up' | 'down' from heartbeat freshness.
--   last_seen_at      UTC timestamp of the last heartbeat (NULL = never).
--
-- VARCHAR (not TEXT) with a string DEFAULT keeps the file MySQL-safe up
-- front (mirrors 072_stack_proxy.sql). token_plain is TEXT like nodes 008.
-- Uniqueness of remote_address is NOT enforced: two stacks may share a
-- host (different ports/paths), same as two nodes may share a name.

ALTER TABLE stacks ADD COLUMN IF NOT EXISTS remote_address VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS remote_use_tls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS remote_skip_verify INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS token_hash VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS token_prefix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS token_plain TEXT NOT NULL DEFAULT '';
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'down';
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS last_seen_at TEXT;

CREATE INDEX IF NOT EXISTS idx_stacks_status ON stacks(status);
CREATE INDEX IF NOT EXISTS idx_stacks_token_hash ON stacks(token_hash);
