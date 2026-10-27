# System

Backend: `system_handler.go`, `startup_handler.go`, `update_handler.go`, `update_auto_handler.go`,
`update_verify.go`, `update_window_handler.go`, `scheduled_update_runs.go`, `sysproc_linux.go`,
`sysproc_other.go`. Migrations: 040 (panel port), 068 (update windows), 084 (online guard).

## Areas
- System page: telemetry charts, host panel (CPU/mem/disk), panel tab (update/reinstall).
- Panel self-update: check release, download, swap, restart (MANAGE_PANEL_UPDATE).
- Update windows: scheduled updates with online guard.
- Startup handler, sysproc helpers.

## Frontend
`features/system/`: System, PanelTab, HostPanel, charts.

## Permissions
ACCESS_ADMIN_PANEL for view; MANAGE_PANEL_UPDATE for update actions.
