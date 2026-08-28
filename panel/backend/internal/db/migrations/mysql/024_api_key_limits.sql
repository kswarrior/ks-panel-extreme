-- 024_api_key_limits.sql: optional expiry + per-window request rate limits on
-- API keys. All three columns are nullable / defaultless so existing rows
-- (and keys created before this migration) keep working as "no expiry, no
-- limit" — the panel sees NULL and treats the key as unlimited. Rate limiting
-- is expressed as `rate_limit` requests per `rate_window_seconds` window (e.g.
-- 25 requests / 60 seconds = "25 per minute"). An admin may also bump an
-- existing key by setting a later `expires_at` or a higher `rate_limit`.
--
-- runner (db.go) guards each ALTER individually — this file is reserved for
-- plain sqlite3-cli users who install from a fresh schema or apply by hand.

ALTER TABLE api_keys ADD COLUMN expires_at DATETIME;
ALTER TABLE api_keys ADD COLUMN rate_limit INTEGER;
ALTER TABLE api_keys ADD COLUMN rate_window_seconds INTEGER NOT NULL DEFAULT 60;
