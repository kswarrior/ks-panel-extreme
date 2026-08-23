-- 042_application_files_runs.sql: Applications become fully runnable.
--
--   applications.files
--     — JSON array of {path, content} script files authored in the
--       Application Studio (or shipped inside an uploaded manifest). This is
--       the raw material a Run stages into a temp dir on the target before
--       executing the entrypoint, so operators configure tokens/keys via the
--       config_schema/env surface and never touch the code.
--
--   application_runs
--     — one row per execution of an application. target is "node" (run on a
--       registered edge) or "panel" (the panel host itself: via its local
--       node when one exists, otherwise by direct shell from the panel
--       process). exec_mode selects where inside the target it lands:
--       "host" (edge/host filesystem) or a driver kind (docker / lxd / kvm /
--       multipass) plus the workload name to exec inside. status is
--       running|succeeded|failed|error; output/error_output carry the
--       captured stdout/stderr. Rows cascade away with their application;
--       triggered_by keeps the audit trail of who pressed Run.
--
-- The applications ALTER is applied through the runtime-guarded path in
-- internal/db/db.go (mirrors 041_instance_page_actions.sql) so re-launches
-- are idempotent on every dialect.

ALTER TABLE applications ADD COLUMN files TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS application_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL,
    triggered_by    INTEGER,
    target          TEXT NOT NULL DEFAULT 'panel',
    node_id         INTEGER NOT NULL DEFAULT 0,
    node_name       TEXT NOT NULL DEFAULT '',
    exec_mode       TEXT NOT NULL DEFAULT 'host',
    workload        TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'running',
    exit_code       INTEGER NOT NULL DEFAULT 0,
    output          TEXT NOT NULL DEFAULT '',
    error_output    TEXT NOT NULL DEFAULT '',
    error           TEXT NOT NULL DEFAULT '',
    timeout_sec     INTEGER NOT NULL DEFAULT 300,
    created_at      TEXT NOT NULL,
    ended_at        TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (triggered_by)   REFERENCES users(id)       ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_application_runs_app ON application_runs(application_id);
