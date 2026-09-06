# Backups skill

Backups cover database snapshots on a cron schedule, per-instance snapshots, and file-level tar backups, with optional push to an S3-compatible remote. Schedules live in backup_schedules with a scheduler sweep, retention keep_last_n/max_age_days pruning, gzip/zstd compression and SHA256/size verification. Database dumps use pg_dump/mysqldump with a datamove fallback, and file tars transfer chunked via Content-Range. Docker restores stop the container, load the tar, and reconcile ports and volumes.

Assistant coverage is read-only here: there are no backup tools, so answer from this guide and walk the user through the backup UI (schedules, retention, remote push, restore). Never claim to take or restore a backup.
