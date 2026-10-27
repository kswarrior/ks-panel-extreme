# CLI and Startup

Entrypoint: `cmd/ksedge/main.go` → `internal/cli.New()`.

## Commands
- `launch` — load config, start heartbeat sender, run health/HTTP server (port default 4040), optional tunnel + SFTP.
- `config` — config helpers (`config --panel ... --config-token ...`).
- `update`, `supervise` — self-update/supervise.

## Launch flow
1. Load config.toml (defaults backfill; missing file allowed for localnode flow).
2. Validate format (warnings).
3. Bridge instances_dir to drivers (env `KSPANEL_INSTANCES_DIR`).
4. Surface misconfig warnings.
5. Start heartbeat sender (if token set).
6. Start tunnel (if connection mode needs it).
7. Run health server (blocks) with route registration + body limits + SFTP.

## Flags
`--config`, `--port`, `--panel`, `--token`, `--sftp-port`. Port override via flag.

## Health server routes
See `reference/http-endpoints.md` and `internal/cli/cli.go` lines 264-314.
EOF