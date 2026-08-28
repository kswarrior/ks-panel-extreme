-- 050_api_key_display.sql: cosmetic fields for API keys (display_name, description, accent_color).
-- Mirrors the roles/display_name/color pattern so the admin list can render
-- a friendly label, note, and badge tint without a second round-trip.
-- Defaults are empty strings so existing keys keep working as before.

ALTER TABLE api_keys ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN accent_color TEXT NOT NULL DEFAULT '';
