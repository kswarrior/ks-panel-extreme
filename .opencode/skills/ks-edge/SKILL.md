---
name: ks-edge
description: Use when working on the ksedge agent in edge/backend (drivers, heartbeat, tunnel, exec, files, SFTP, install, snapshot, page-action, attach) or debugging a node that shows offline / edge RPC failing. Covers config.toml keys, connection modes, the token-gated HTTP surface, body limits, and local run/test commands.
---

# ksedge — Edge Agent (edge/backend)

Small Go agent that runs ON each node. No DB, no UI. The panel (`panel/backend/internal/edge/` client) calls it over HTTP/WSS using a shared token (`kse_…`). Read `map.md` §3 for the module map.

## Layout

- `cmd/ksedge/` — binary entrypoint (thin shim).
- `internal/cli/` — cobra commands: `launch`, `supervise`, `update`, `config`.
- `internal/config/` — `config.toml` load + defaults + validation.
- `internal/drivers/` — docker | kvm | lxd | multipass registry + inspect. New hypervisor goes here.
- `internal/exec|execrpc|execstage|hostexec/` — exec in container vs on host; env/file staging.
- `internal/files|sftp/` — file manager + chrooted SFTP (default port 2222).
- `internal/pageaction/` — runs allow-listed instance-page actions.
- `internal/lifecycle|install|snapshot/` — create/start/stop/delete, install workflows, snapshots.
- `internal/inspect|ports|telemetry|health|heartbeat/` — metrics/procs/ports, telemetry, health, heartbeat.
- `internal/attach|tunnel/` — console attach WS + WSS reverse tunnel.
- `internal/update|version/` — self-update + version stamp.

## Run locally

```bash
cd edge/backend
go build ./... && go test ./...
go run ./cmd/ksedge launch --config config.toml   # defaults: HTTP :4040, SFTP :2222
go run ./cmd/ksedge launch --once                 # single heartbeat smoke test
```

Flags override config: `--port`, `--panel`, `--token`, `--interval`, `--skip-verify`, `--sftp-port`. A missing `config.toml` is fine (localnode flow) — the agent boots with defaults and logs a warning.

## config.toml keys

`uuid`, `name`, `panel_url`, `token` (`kse_…`), `listen_port` (4040), `use_tls_upstream`, `heartbeat_interval` (seconds), `skip_verify`, `instances_dir` (default `/var/lib/kspanel/instances`; `./instances` resolves next to the binary), `connection_mode` = `direct | reverse_tunnel | both | local_port | local_wss | local_both` (empty = direct). The reverse tunnel only starts for the tunnel modes.

## HTTP surface (all token-gated except /health)

- `GET /health` — unauthenticated liveness/identity probe.
- `POST /api/edge/lifecycle`, `GET /api/edge/exec` (WS), `POST /api/edge/exec-rpc`, `POST /api/edge/host-exec`
- `GET|POST|DELETE /api/edge/files`, `GET /api/edge/hostfiles` (jailed to `instances_dir`)
- `POST /api/edge/inspect`
- `POST|GET /api/edge/install`, `/install/stop`, `/install/stdin`, `/install/stream` (WS)
- `GET /api/edge/attach` (WS), `POST /api/edge/page-action`, `POST /api/edge/snapshot`, `POST /api/edge/ports/update`
- `POST /api/edge/sftp/provision`, `/api/edge/sftp/delete`
- `POST /api/edge/update-info|update-check|update-apply`, `/api/edge/reinstall`, `/api/edge/reinstall-background`
- TCP `:2222` — SFTP listener, one chroot per `inst_<id>`.

Body caps: 1 MiB JSON RPCs, 8 MiB `host-exec`/`exec-rpc`, 4 GiB `files`/`hostfiles` (streamed). `ReadHeaderTimeout` 10 s, `IdleTimeout` 120 s; read/write timeouts intentionally unbounded for streaming.

## Debug playbook

1. Build + tests: `cd edge/backend && go build ./... && go test ./...`.
2. Is it up? `curl -s http://<node>:4040/health`.
3. Heartbeat accepted? Check the edge log for the panel response; 401/403 means token mismatch (re-register node / re-copy config.toml).
4. Node shows offline in panel? Verify `panel_url` reachability, `connection_mode`, firewall on the node port, and `skip_verify` for self-signed panels.
5. Panel→edge call 404s? The root mux mounts several edge handlers at multiple literal paths on purpose (Go `ServeMux` trailing-slash redirects turn POST into GET and drop the body). When adding a path under a handler's own mux, mount the SAME handler for every literal path — see `runHealthServer` notes in `internal/cli/cli.go`.
6. Panics are recovered per request and returned as `{ok:false, error:"internal edge error (recovered)"}` — check the log line for the real stack value.
