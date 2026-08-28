-- 025_role_icon.sql: add icon column to roles table for custom SVG/icon selection.

ALTER TABLE roles ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '';