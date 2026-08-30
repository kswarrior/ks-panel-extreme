-- 055_api_key_system.sql: add is_system flag to api_keys.
-- When 1, the key is a system-wide key not tied to any single user account.
-- It is managed only from the admin API Keys page (owner = System) and is
-- excluded from per-user listings (/api/me/api-keys). Defaults to 0 so
-- existing keys remain user-scoped.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0;
