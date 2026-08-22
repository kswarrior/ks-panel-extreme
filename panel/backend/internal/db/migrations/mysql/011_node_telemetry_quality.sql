-- 011_node_telemetry_quality.sql: per-metric "did the edge report this?" flags
-- plus the last active-probe outcome.
--
-- The original node card conflated four distinct failure modes:
--   * never connected        (last_seen_at IS NULL)
--   * connected then stale   (last_seen_at older than the sweep threshold)
--   * reachable but partial  (telemetry swallows errors and ships zeros)
--   * fully up
-- into the single "down" status. This migration adds the signals the UI needs
-- to tell them apart:
--   * the four `hw_*` flags record whether ksedge actually collected each
--     metric in its last heartbeat, so a 0 in `ram_total` is no longer
--     ambiguous between "idle box" and "gave up reading /proc/meminfo".
--   * `probe_reachable`, `probe_seen_name` and `probe_checked_at` stash the
--     result of the panel's active /health probe against the edge, so a
--     misconfigured port (e.g. two ksedge daemons sharing one port) shows up
--     as "reachable but not our edge" instead of "looks fine".
--
-- guards each column via PRAGMA table_info (see db.go's hasColumn) and skips
-- the ALTER when the column already exists, so this is safe to re-run after a
-- partial failure.

ALTER TABLE nodes ADD COLUMN hw_ram_ok     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN hw_cpu_ok     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN hw_disk_ok    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN hw_uptime_ok  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN hw_drivers_ok INTEGER NOT NULL DEFAULT 0;
-- Last active probe (panel -> edge GET /health). 1 = reachable + identifies
-- itself as a ksedge, 0 = reachable but not our edge (port collision), NULL =
-- never probed / unreachable.
ALTER TABLE nodes ADD COLUMN probe_reachable INTEGER;
-- The `name` field the edge reports back on /health, so the panel can confirm
-- it's the same row (cheaper than re-running the token dance every probe).
ALTER TABLE nodes ADD COLUMN probe_seen_name TEXT;
-- UTC timestamp of the last probe attempt (success or failure).
ALTER TABLE nodes ADD COLUMN probe_checked_at DATETIME;
