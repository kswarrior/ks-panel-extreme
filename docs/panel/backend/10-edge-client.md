# Edge Client (Panel → Node)

Package: `panel/backend/internal/edge/`. Panel-side client that calls edge nodes over HTTP.

## Surfaces
- exec (`ExecRequest`, `ExecFile`)
- host exec (`HostExecRequest`)
- files (read/write/list)
- inspect (processes/metrics/ports)
- page-action (allow-listed actions on edge)
- lifecycle, install, snapshot, sftp, tunnel, attach

## Used by
Handlers for instances (start/stop/restart/kill/reinstall), files/terminal, page actions, mods/stacks
execution, applications runs, backups/snapshots.

## Auth
Node token (plain token stored/rotated). Heartbeat ingest at `/api/nodes/heartbeat`. Node config
token migration 079. Connection modes: direct/WSS tunnel (migration 050).

## Body limits
Edge HTTP surface has token-gated routes with body limits (see ks-edge skill). Panel client must
respect limits; large file transfers use SFTP/chunking.
