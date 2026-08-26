-- 025_instance_install.sql
-- Add install workflow tracking columns to instances table.
-- These columns track the async install workflow that runs after deploy:
--   install_state   → 'running' | 'done' | 'failed' | '' (no install)
--   install_id      → "<kind>:<name>" key returned by edge install RPC
--   install_step    → current step index (-1 = not started)
--   install_error   → short failure message from edge
--   install_steps_json → full step transcript JSON for panel rendering

ALTER TABLE instances ADD COLUMN install_state TEXT NOT NULL DEFAULT ('');
ALTER TABLE instances ADD COLUMN install_id TEXT NOT NULL DEFAULT ('');
ALTER TABLE instances ADD COLUMN install_step INTEGER NOT NULL DEFAULT -1;
ALTER TABLE instances ADD COLUMN install_error TEXT NOT NULL DEFAULT ('');
ALTER TABLE instances ADD COLUMN install_steps_json TEXT NOT NULL DEFAULT ('');