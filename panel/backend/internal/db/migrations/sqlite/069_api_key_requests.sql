-- 069_api_key_requests.sql: rate-limit ledger for API keys.
--
-- Each row records one authenticated request for a key hash so
-- CheckAPIKeyRateLimit can count requests inside the key's window
-- (rate_limit + rate_window_seconds on api_keys). Rows are append-only;
-- old rows are trimmed by the rate-limit sweep (or TTL in a later
-- migration). key_hash is the SHA-256 hex digest stored on api_keys.
--
-- Previously this table was only created by the EnsureAPIKeyTables Go
-- helper (repository/api_key_repo.go), which has no callers and ships
-- SQLite-only DDL, so a migrated database had no api_key_requests table
-- and RecordAPIKeyRequest failed with "no such table". Owning the table
-- here makes every engine converge via RunMigrations instead.
--
-- No TEXT DEFAULTs (MySQL rejects defaults on TEXT) and single-statement
-- lines only so regen.sh derives the postgres/mysql variants. The index
-- line is guarded at runtime in db.go via guardedCreateIndex because
-- MySQL lacks CREATE INDEX IF NOT EXISTS and migrations re-run on every
-- launch — mirrors 062_node_wss_channels.sql.

CREATE TABLE IF NOT EXISTS api_key_requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash   TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_key_requests_hash_time ON api_key_requests(key_hash, created_at);
