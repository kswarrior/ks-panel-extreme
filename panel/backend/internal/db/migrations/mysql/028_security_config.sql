-- 028_security_config.sql: edit-on-the-fly security configuration persisted
-- in the existing settings KV so the panel can react without a restart.
--
-- The Security admin page exposes every key here as a single editable form
-- and reads it back through one /api/security/config round-trip. All
-- values are stored as plain strings so we don't need a dedicated table —
-- the settings KV has been the right home for this kind of admin-editable
-- runtime config since the panel shipped, and adding a second table would
-- force the snapshot path through yet another repo.
--
-- Keys (all seeded with safe defaults so the snapshot returns real numbers
-- even before an admin ever opens the Security page):
--   security_requests_per_minute_limit — per-IP max requests allowed per
--                          `security_window_seconds_limit` window. Default
--                          600 (= 10 rps per IP). 0 disables the per-IP
--                          limit and falls back to legacy behaviour (no
--                          per-IP throttling).
--   security_window_seconds_limit — size of the rolling window the per-IP
--                          limit is evaluated over. Default 60.
--   security_global_rpm_limit     — total requests-per-minute across the
--                          whole panel. When exceeded AND the Under-Attack
--                          toggle is on, every additional request gets a
--                          429 + blocked = 1 in the telemetry table. 0
--                          disables the global cap.
--   security_block_unknown_ua     — "1" blocks requests with an empty /
--                          missing User-Agent (the legacy 027 seed had this
--                          key already; we re-seed it here under a new
--                          name so the migration only inserts keys it owns).

INSERT IGNORE INTO settings (`key`, value) VALUES ('security_requests_per_minute_limit', '600');
INSERT IGNORE INTO settings (`key`, value) VALUES ('security_window_seconds_limit', '60');
INSERT IGNORE INTO settings (`key`, value) VALUES ('security_global_rpm_limit', '0');
