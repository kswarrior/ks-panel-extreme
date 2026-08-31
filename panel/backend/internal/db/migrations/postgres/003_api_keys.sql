-- 003_api_keys.sql: API keys for machine-to-machine authentication.
-- Each key belongs to a user and has a scope (list of permission keys) – the
-- server grants an attached API request whatever permissions are in the scope.
-- For now we only store the SHA-256 hash of the key, never the raw plaintext.

CREATE TABLE IF NOT EXISTS api_keys (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    -- SHA-256 hex digest of the key. Indexed for fast lookup.
    key_hash    TEXT    NOT NULL UNIQUE,
    -- Short prefix shown in the UI (first 8 chars of the generated token) so
    -- users can recognise which key is which without revealing the secret.
    prefix      TEXT    NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    -- Encoded as a comma-separated list of permission keys. Empty => no
    -- permissions granted (the request would be unauthenticated-equivalent).
    permissions TEXT    NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id);
