-- 002_settings.sql: key/value store for runtime-editable panel settings.
-- We keep it simple (single-row updates), so the panel name and any future
-- settings live in a small KV table.

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default panel name. The Settings page edits this row.
-- Use 'KS Panel' as the initial brand per the requirement to differentiate from
-- the older "kspanel" branding; admins can change it any time from the
-- Settings page (or via API).
INSERT IGNORE INTO settings (key, value) VALUES ('panel_name', 'KS Panel');
