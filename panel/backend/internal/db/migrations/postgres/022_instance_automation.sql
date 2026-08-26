-- 022_instance_automation.sql: scheduled + on-demand task runner.
--
-- Automation jobs let an operator run any command inside an instance's
-- container/VM at a chosen schedule (cron style) OR on demand from the
-- Automation page. Execution runs panel-side on a scheduler goroutine
-- that, at each tick, dials the owning edge's exec endpoint with the
-- job's command + the job's decoded secret env. So the panel stays
-- stateless for execution; ksedge owns the actual shell.
--
-- `schedule` is a 5-field cron expression ("* * * * *" → every minute),
-- or empty for on-demand-only jobs. The scheduler is a coarse-per-minute
-- loop; sub-minute precision is intentionally not supported.
-- `command` is a shell script the edge runs through /bin/sh -c.
-- `secret_refs` is a JSON array of secret keys to inject as env at run
-- time (resolved from instance_secrets), so jobs can reference vaulted
-- secrets without hard-coding them.
-- `enabled` toggles the job without deleting it.

CREATE TABLE IF NOT EXISTS instance_automation (
    id           SERIAL PRIMARY KEY,
    instance_id  INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    command      TEXT    NOT NULL,
    schedule     TEXT    NOT NULL DEFAULT '',          -- cron 5-field or '' for on-demand
    enabled      INTEGER NOT NULL DEFAULT 1,
    secret_refs  TEXT    NOT NULL DEFAULT '[]',         -- JSON array of secret keys to inject
    timeout_sec  INTEGER NOT NULL DEFAULT 300,
    last_run_at  TIMESTAMP,
    next_run_at  TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS instance_automation_inst_idx ON instance_automation(instance_id);
CREATE INDEX IF NOT EXISTS instance_automation_due_idx ON instance_automation(enabled, next_run_at);

-- automation_runs is the execution history. Each scheduled fire or manual
-- trigger creates one row; the panel records stdout/stderr (truncated) +
-- exit code + durations. Runs are append-only.
CREATE TABLE IF NOT EXISTS automation_runs (
    id            SERIAL PRIMARY KEY,
    job_id        INTEGER NOT NULL REFERENCES instance_automation(id) ON DELETE CASCADE,
    instance_id   INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    trigger_type  TEXT    NOT NULL,                    -- 'schedule' | 'manual'
    command       TEXT    NOT NULL DEFAULT '',
    stdout        TEXT    NOT NULL DEFAULT '',
    stderr        TEXT    NOT NULL DEFAULT '',
    exit_code     INTEGER NOT NULL DEFAULT 0,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    error         TEXT    NOT NULL DEFAULT '',
    started_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS automation_runs_job_idx ON automation_runs(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_inst_idx ON automation_runs(instance_id, started_at DESC);
