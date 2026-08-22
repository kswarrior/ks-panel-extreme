-- 025_role_icon.sql: add icon column to roles table for custom SVG/icon selection.

ALTER TABLE roles ADD COLUMN icon TEXT NOT NULL DEFAULT '';