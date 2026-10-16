-- 079_node_config_token.sql: one-time config-fetch token per node.
--
-- The NodeForm's post-create modal now prints two "run this on the edge"
-- commands that bootstrap a node WITHOUT copy/pasting the whole config.toml:
--
--   ./ksedge config --panel <url> --config-token <ksc_…>   (edge already installed)
--   curl -L -o ksedge <url> && chmod +x ksedge && ./ksedge config … && ./ksedge launch
--
-- The edge dials the panel's WSS endpoint /api/edge/config with this
-- ONE-TIME token; the panel verifies it (hash comparison), consumes it and
-- answers with the generated config.toml (which carries the real ksedge
-- token). After that single use — or after the expiry — the token is dead.
--
-- Two nullable columns on `nodes`:
--
--   config_token_hash        SHA-256 hex digest of the plaintext ksc_ token.
--                            NULL = no active config token. The plaintext is
--                            returned to the admin exactly once at creation.
--   config_token_expires_at  UTC expiry (~30 min). Consume rejects expired
--                            values and blanks both columns on success.
--
-- Both columns are NULL-able by design so a legacy row needs no backfill and
-- the guards in db.go can add them idempotently on every engine (the Go
-- runner owns the ALTERs — mirrors 050_node_connection_mode.sql). No index:
-- the table holds one row per edge and consume is a single-row lookup.

ALTER TABLE nodes ADD COLUMN config_token_hash TEXT;
ALTER TABLE nodes ADD COLUMN config_token_expires_at DATETIME;
