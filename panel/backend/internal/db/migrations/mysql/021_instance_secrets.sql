-- 021_instance_secrets.sql: per-instance encrypted secret vault.
--
-- Secrets (API keys, DB passwords, ... ties) are stored AES-256-GCM
-- encrypted at the panel layer using a per-install master key (read from
-- the KSPANEL_MASTER_KEY env var, or derived/sealed on first launch).
-- The DB only ever holds the ciphertext + nonce + tag so a leaked DB or
-- backup can't recover the cleartext. The plaintext never leaves the
-- panel over HTTP: the list endpoint returns masked values + a metadata
-- flag, and a dedicated /reveal endpoint re-decrypts on explicit request
-- (audited).
--
-- `value_blob` packs nonce(12) || ciphertext||tag — the crypto/secretbox
-- helper splits it on read. Secrets are scoped per instance so a deploy
-- can inject the resolved env via the merge step in the deploy handler.
-- A secret may be marked "secret" (masked) or plain ("env") so a single
-- vault covers both visible env vars AND hidden secrets for one instance.

CREATE TABLE IF NOT EXISTS instance_secrets (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    instance_id  BIGINT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    `key`          TEXT
    value_blob   BLOB    NOT NULL,              -- nonce||ciphertext||tag
    -- value_mime is empty for secrets. For non-secret env the cleartext is
    -- small enough to keep alongside, so we store it in value_blob too and
    -- mark is_secret = 0.
    is_secret    INTEGER NOT NULL DEFAULT 1,    -- 0 = visible env, 1 = masked secret
    description  TEXT    NOT NULL DEFAULT (''),
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (instance_id, `key`)
);

CREATE INDEX instance_secrets_inst_idx ON instance_secrets(instance_id);
