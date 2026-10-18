-- 081_mod_settings.sql: typed mod settings + encrypted secrets (plan item M8).
--
-- One row per declared setting value for a mod. The manifest declares the
-- schema (`settings: [{key, type, ...}]`); this table stores the CURRENT value
-- the admin saved (or the mod wrote via ks.settings.set). Scope is global per
-- mod for v1 — per-instance / per-user scopes are a noted stretch.
--
--   mod_slug   VARCHAR(100) — owning mod; FK ON DELETE CASCADE keeps the
--                              table tidy when a mod row is removed
--   key        VARCHAR(100) — declared setting key, code-enforced
--                              ^[a-z0-9_]{1,64}$ by models.ValidateSettings
--   value      TEXT NOT NULL — the value. For is_secret = 1 this is the
--                              base64 of secretbox.Seal(cleartext)
--                              (AES-256-GCM, nonce||ciphertext||tag); the
--                              cleartext never lands in the DB, the API never
--                              returns it, and only the sandbox binding
--                              (ks.settings.get) opens it.
--   is_secret  INTEGER NOT NULL DEFAULT 0 — 1 = password-type value
--   updated_at TEXT NOT NULL — UTC "2006-01-02 15:04:05" write stamp
--
-- MySQL-safe up front: VARCHAR(100) — not TEXT — for the PK members (MySQL
-- 1170 rejects TEXT in any key without a key length); plain TEXT with NO
-- default for value (MySQL 1101 rejects TEXT DEFAULT); single-statement lines
-- only. CREATE TABLE IF NOT EXISTS rides the generic migration path (no db.go
-- guard needed).

CREATE TABLE IF NOT EXISTS mod_settings (
    mod_slug   VARCHAR(100) NOT NULL,
    key        VARCHAR(100) NOT NULL,
    value      TEXT NOT NULL,
    is_secret  INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (mod_slug, key),
    FOREIGN KEY (mod_slug) REFERENCES mods(slug) ON DELETE CASCADE
);
