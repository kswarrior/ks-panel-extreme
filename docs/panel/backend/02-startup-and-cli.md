# Startup and CLI

Entrypoint: `panel/backend/cmd/kspanel/main.go` (thin shim → CLI builder in `internal/cli/`).

## CLI commands (`internal/cli/`)
- `launch` — start panel server (port default 5050).
- `seed` — seed DB (users/roles/permissions/defaults).
- `setup` / `setup-localnode` — initial setup, local node pairing.
- `create:user` — create account (interactive or flags).
- `import-template` — import template.
- `update` / `stop` / `supervise` — self-update, stop, supervise.
- `print` — print helpers.

## Startup flow
1. Load config (DB engine/DSN from env/flags).
2. Open DB (`internal/db/db.go`), run migrations.
3. Seed core (`SeedCore`): permission keys, roles, defaults.
4. Build router (`internal/api.NewRouter()`), middleware.
5. Serve HTTP + embedded frontend; start cron/scheduler/heartbeat.

## Flags
`--type`/`--dsn` for seed/launch override env. `SetDatabaseType` records override.
Default port: 5050 (`config.DefaultPort()`). Frontend dev uses Vite separately.
