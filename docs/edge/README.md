# KS Edge (ksedge) — Documentation

> Scope: the **edge agent** (`edge/backend/`), the per-host Go daemon installed on nodes.
> Panel docs are separate (`docs/panel/`). Paths relative to repo root.

## Read order
1. `overview/` — what ksedge is, architecture, scope.
2. `backend/` — agent structure, CLI, config, drivers, RPCs.
3. `guides/` — dev, build, test, deploy node.
4. `security/` — token gating, body limits.
5. `future/` — gaps.
6. `reference/` — config keys, HTTP endpoints, drivers.

## Key entrypoints
- `edge/backend/cmd/ksedge/main.go` (shim → `internal/cli/`).
- CLI: `internal/cli/cli.go` (launch, health server, route registration, body limits).
- Config: `internal/config/` (config.toml).
- Drivers: `internal/drivers/` (docker, lxd, kvm, multipass, host).

## Version
Shared with panel: `VERSION` (1.0.299). Built by `rebuild.sh` → `release/ksedge`.
