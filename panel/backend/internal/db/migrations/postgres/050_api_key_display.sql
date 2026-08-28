-- 050_api_key_display.sql: cosmetic fields for API keys (display_name, description, accent_color).

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '';
