-- 051_instance_started_at.sql: track when instance last entered running state
--
-- This migration is handled entirely in Go (db.go:RunMigrations) via guardedAddColumns
-- for idempotent column additions on SQLite/MySQL. The column added is:
--   started_at TIMESTAMP
-- It stores the wall-clock time when the instance last transitioned to "running"
-- (deploy, start, restart). NULL means never started or stopped.
-- Postgres version uses native ADD COLUMN IF NOT EXISTS and is also
-- guarded by the same Go code for consistency.
ALTER TABLE IF EXISTS instances ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
