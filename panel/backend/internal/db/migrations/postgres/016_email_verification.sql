-- 016_email_verification.sql: per-user "email verified" flag plus the
-- short-lived verification codes that the SMTP flow uses to confirm a
-- freshly-registered account. The runtime guard in db.go skips the ALTER
-- when email_verified is already present (e.g. a partially-migrated DB),
-- mirroring the 013 owner_id pattern.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_verification_codes (
    id           SERIAL PRIMARY KEY,
    email        TEXT    NOT NULL,
    code         TEXT    NOT NULL,
    code_hash    TEXT    NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP NOT NULL,
    consumed_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS evc_email_idx ON email_verification_codes(email);
