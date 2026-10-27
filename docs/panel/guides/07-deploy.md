# Deploy

## Artifacts
`release/kspanel`, `release/ksedge`, `release/version.json`, checksums produced by `rebuild.sh`.
Deploy artifacts in `deploy/`.

## Runtime
- Panel: `./kspanel launch` (port 5050 default; `--port`?).
- Edge: install `ksedge` on nodes; pair via setup-localnode/token.
- DB: SQLite default; set `KSPANEL_DB_TYPE`/`KSPANEL_DB_DSN` for Postgres/MySQL.
- Persistent files anchor to data dir.

## Updates
Panel self-update via System page (MANAGE_PANEL_UPDATE) or CLI `update`. Edge self-update
via `internal/update/`.

## Backup
Use backup handlers/schedules; DB backups before migrations.
EOF