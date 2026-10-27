# Background Jobs

Packages: `internal/cron/`, `internal/scheduler/`, `internal/heartbeat/`, `internal/probe/`,
`internal/sysinfo/`, `internal/telemetry/`, `internal/health/`, `internal/version/`.

## Areas
- Cron: scheduled tasks (instance automation, backups, update windows).
- Scheduler: job scheduling engine.
- Heartbeat: node heartbeat ingest + tracking (`internal/heartbeat/`).
- Probe: health probes.
- Sysinfo: system info collection.
- Telemetry: metrics push.
- Health: health endpoints.
- Version: version stamp (`internal/version/`).
- Backup: backup scheduling (`internal/backup/`, `backup_schedule_handler.go`).
- Update windows: scheduled update runs (`update_window_handler.go`, `scheduled_update_runs.go`).
- Automation: instance automation jobs/steps (`automation_exec.go`, `automation_transfer.go`,
  `automation_repo.go`, migrations 073/074).

## Automation
Instance automation: cron schedules and runs, job types, steps. See aiskills/automation.md.
Migration 073 (job types), 074 (steps).

## Update windows
Scheduled panel/instance updates with online guard (migration 084).
