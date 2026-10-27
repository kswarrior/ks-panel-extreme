# Config and Environment

Config loader: `panel/backend/internal/config/` (`config.go`, `engine.go`, `instance_pages.go`).

## DB selection (precedence)
1. `--type`/`--dsn` CLI flags.
2. `KSPANEL_DB_TYPE` / `KSPANEL_DB_DSN` env.
3. SQLite default (`KSPANEL_DB` or `./kspanel.db`).

Engines: `sqlite` | `postgres` (aliases postgresql, pg) | `mysql` (alias mariadb).

## Key env vars
- `KSPANEL_DB` — SQLite file path (legacy shortcut).
- `KSPANEL_DB_TYPE` / `KSPANEL_DB_DSN` — engine + connection string.
- `KSPANEL_PORT` (if used) — HTTP port (default 5050).
- OAuth/SMTP settings stored in DB via authority handler, not env (mostly).
- Panel base URL / root URL configured in settings.

## Data dir
`config.DataDir()` anchors persistent files (database, uploaded logos, backups, `kspanel.env`) to
SQLite location; for non-SQLite keeps SQLite anchor (`KSPANEL_DB` or `./kspanel.db`) to avoid
scattering files.

## Instance pages config
`internal/config/instance_pages.go` — paths for library loading.

## Authority / OAuth / stackstore / tunnel
Infra packages: `internal/edgeconfig/`, `internal/stackstore/`, `internal/tunnel/`, `internal/oauth/`,
`internal/specyaml/`. Config mostly DB-backed via settings/authority handlers.
