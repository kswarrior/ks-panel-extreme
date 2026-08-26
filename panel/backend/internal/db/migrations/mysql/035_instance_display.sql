-- 035_instance_display.sql: Add display identity fields to instances
-- display_name: human-readable label shown in the UI instead of the internal name
-- icon: SVG string for a custom icon displayed on the instance card
-- color: hex colour for the icon/accent on the instance card

ALTER TABLE instances ADD COLUMN display_name TEXT NOT NULL DEFAULT ('');
ALTER TABLE instances ADD COLUMN icon TEXT NOT NULL DEFAULT ('');
ALTER TABLE instances ADD COLUMN color TEXT NOT NULL DEFAULT ('');