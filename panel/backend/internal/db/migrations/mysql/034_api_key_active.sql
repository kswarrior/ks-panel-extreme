-- 034_api_key_active.sql: add active (soft-revoke) column to api_keys.
-- Defaults to 1 (active) so existing keys remain enabled. An admin can toggle
-- this off to immediately revoke the key without deleting it (audit trail).

ALTER TABLE api_keys ADD COLUMN active INTEGER NOT NULL DEFAULT 1;