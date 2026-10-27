# Instances

Backend: `instance_handler.go`, `instance_advanced_handler.go`, `instance_backup_handler.go`,
`instance_inspect_handler.go`, `instance_port_handler.go`, `instance_terminal_test.go`,
`automation_exec.go`, `automation_transfer.go`. Repos: `instance_repo.go`, `instance_advanced_repo.go`,
`instance_port_repo.go`, `automation_repo.go`, `sftp_repo.go`, `page_kv_repo.go`. Models: `instance.go`,
`instance_advanced.go`. Migrations: 007,013,021,022,023,025,035,037,038,047,048,051,055,058,
063,078.

## Concepts
- Deploy from template; lifecycle start/stop/restart/kill/reinstall/suspend.
- Config/env/secrets/ports/SFTP/terminal/automation/snapshots/backups/inspect.
- Instance pages (custom tabs) attached; page KV store.
- Display fields, owner, suspension, started_at, disk quota.
- Power sub-capabilities under INSTANCES_CONTROL.
- Ownership scope Own/All.

## Frontend
`features/instances/` pages: Instances, InstanceForm, InstanceDetail (InstancePanel), InstanceDynamicPage,
InstanceStats, InstanceSchedules, AdvanceOptionPage, InstanceEditAdvanced, DeployFormShell.

## Install engine
`internal/install/` deploys template.spec → instance.config on edge.

## Automation
Cron schedules and runs; job types/steps (migrations 073/074).
