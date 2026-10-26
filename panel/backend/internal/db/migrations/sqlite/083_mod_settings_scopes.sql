-- 083_mod_settings_scopes.sql: per-instance/user/node setting values (D1).
--
-- Migration 081's mod_settings table keeps GLOBAL values under its original
-- primary key (mod_slug, key). Scoped values live here so an upgrade never has
-- to rebuild a table that already holds admin data; the repository routes
-- global reads/writes to 081 and non-global buckets here.
--
--   scope_type  VARCHAR(20)  — instance|user|node (global stays in 081)
--   scope_id    VARCHAR(64)  — instance id, user id or node id
--   key         VARCHAR(100) — declared setting key, code-enforced
--   value       TEXT         — cleartext, or base64(secretbox.Seal) when
--                              is_secret = 1 (same contract as 081)
--
-- CREATE TABLE IF NOT EXISTS keeps the replay-on-boot migration runner
-- idempotent; VARCHAR (not TEXT) key members keep MySQL 1170 happy.

CREATE TABLE IF NOT EXISTS mod_settings_scoped (
    mod_slug   VARCHAR(100) NOT NULL,
    scope_type VARCHAR(20) NOT NULL,
    scope_id   VARCHAR(64) NOT NULL,
    key        VARCHAR(100) NOT NULL,
    value      TEXT NOT NULL,
    is_secret  INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (mod_slug, scope_type, scope_id, key),
    FOREIGN KEY (mod_slug) REFERENCES mods(slug) ON DELETE CASCADE
);
