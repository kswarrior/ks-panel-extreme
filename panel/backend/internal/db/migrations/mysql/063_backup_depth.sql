-- 063_backup_depth.sql: scheduled backups, S3 remotes, file-level backups.
--
-- backup_schedules is the single cron table for both database VACUUM INTO
-- jobs (kind='db', instance_id NULL) and per-instance snapshot jobs
-- (kind='snapshot', instance_id NOT NULL). kind + cron are validated in Go
-- (cron.Parse 5-field); CHECKs are the durable backstop. next_run_at is
-- armed by the API on create/update and re-armed by the scheduler after
-- each fire, mirroring instance_automation.
--
-- backup_s3_config is a singleton row (id=1) holding the rclone-style
-- remote. secret_enc is the secretbox-sealed access secret (base64 of
-- nonce||ciphertext); the cleartext never touches logs (see handlers).
--
-- instance_file_backups tracks panel-stored per-instance tar artifacts
-- (chunked upload with resume, Content-Range download). Bytes live under
-- <DataDir>/instance_backups/<instance_id>/; this table is only metadata.

CREATE TABLE IF NOT EXISTS backup_schedules (
    id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind          TEXT    NOT NULL DEFAULT 'db' CHECK (kind IN ('db','snapshot')),
    instance_id   INTEGER NULL REFERENCES instances(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL DEFAULT '',
    cron          TEXT    NOT NULL DEFAULT '',
    enabled       INTEGER NOT NULL DEFAULT 1,
    keep_last_n   INTEGER NOT NULL DEFAULT 7,
    max_age_days  INTEGER NOT NULL DEFAULT 30,
    compression   TEXT    NOT NULL DEFAULT 'none' CHECK (compression IN ('none','gzip','zstd')),
    s3_push       INTEGER NOT NULL DEFAULT 0,
    next_run_at   DATETIME NULL,
    last_run_at   DATETIME NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backup_schedules_due ON backup_schedules(enabled, next_run_at);
CREATE INDEX idx_backup_schedules_inst ON backup_schedules(instance_id);

CREATE TABLE IF NOT EXISTS backup_s3_config (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    endpoint   TEXT NOT NULL DEFAULT '',
    bucket     TEXT NOT NULL DEFAULT '',
    region     TEXT NOT NULL DEFAULT '',
    prefix     TEXT NOT NULL DEFAULT '',
    access_key TEXT NOT NULL DEFAULT '',
    secret_enc TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS instance_file_backups (
    id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    filename    TEXT    NOT NULL DEFAULT '',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    sha256      TEXT    NOT NULL DEFAULT '',
    compressed  INTEGER NOT NULL DEFAULT 0,
    compression TEXT    NOT NULL DEFAULT 'none',
    s3_pushed   INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_instance_file_backups_inst ON instance_file_backups(instance_id, created_at DESC);
