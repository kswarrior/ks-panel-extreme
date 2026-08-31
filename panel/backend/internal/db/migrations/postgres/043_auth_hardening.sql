-- 043_auth_hardening.sql: persistence backing the Security page's
-- Authentication tab.
--
-- password_history — the last N bcrypt hashes of each user's OUTGOING
-- passwords, recorded on every successful password change so
-- auth.ValidatePasswordWithHistory can reject reuse. Without this table
-- the history check in ChangePasswordHandler validated against an empty
-- slice (a no-op).
--
-- recovery_codes — single-use MFA backup/recovery codes, stored as bcrypt
-- hashes (never plaintext). An admin can mint a replacement set for a user
-- from the Authentication tab; a code is consumed exactly once via
-- RecoveryCodeRepository.Consume.

CREATE TABLE IF NOT EXISTS password_history (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    -- Bcrypt hash of the outgoing (replaced) password. Never plaintext.
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);

CREATE TABLE IF NOT EXISTS recovery_codes (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    -- Bcrypt hash of the code; the plaintext is shown once at generation.
    code_hash  VARCHAR(255) NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at    TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);
