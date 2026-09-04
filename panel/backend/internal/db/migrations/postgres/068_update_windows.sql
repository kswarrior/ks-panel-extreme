-- 068_update_windows.sql: scheduled panel + fleet update windows.
--
-- Each row is one cron schedule that fires a self-update inside a daily
-- maintenance window:
--
--   target       'panel' = panel self-update (download + verify + swap +
--                relaunch via the shared stager), 'fleet' = fleet rolling
--                update over every registered node (check→apply→poll).
--   cron         5-field cron expression, validated in Go (cron.Parse).
--   enabled      0 = paused (row kept, never fires).
--   window_start / window_end  daily maintenance window as "HH:MM" (24h,
--                UTC — the scheduler ticks in UTC). Empty = always inside.
--                Overnight ranges wrap (e.g. 22:00→06:00). Validated in Go;
--                the scheduler re-checks every fire.
--   next_run_at  armed by the API on create/update and re-armed by the
--                scheduler after each fire/skip, mirroring backup_schedules.
--   last_status  free-text outcome of the last fire ("updated",
--                "skipped: outside maintenance window", error, …).
--
-- The scheduler (internal/scheduler) evaluates due rows once a minute:
-- outside the window the run is SKIPPED + audit-logged (never executed);
-- inside, the update runs detached so a slow fleet never blocks the tick.

CREATE TABLE IF NOT EXISTS update_windows (
    id            SERIAL PRIMARY KEY,
    target        TEXT     NOT NULL DEFAULT 'panel' CHECK (target IN ('panel','fleet')),
    name          TEXT     NOT NULL DEFAULT '',
    cron          TEXT     NOT NULL DEFAULT '',
    enabled       INTEGER  NOT NULL DEFAULT 1,
    window_start  TEXT     NOT NULL DEFAULT '',
    window_end    TEXT     NOT NULL DEFAULT '',
    next_run_at   TIMESTAMP NULL,
    last_run_at   TIMESTAMP NULL,
    last_status   TEXT     NOT NULL DEFAULT '',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_update_windows_target ON update_windows(target);
