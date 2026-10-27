# Nodes (Edge Machines)

Backend: `node_handler.go`, `node_files_handler.go`, `node_rolling_update.go`, `node_update_handler.go`.
Repo: `node_repo.go`, `node_config_token_test.go`. Models: `node.go`. Migrations: 004,010,019,026,
044,050,079,080.

## Concepts
- Node registration, heartbeat ingest, drivers (docker/lxd/kvm/multipass/host), telemetry quality,
  advanced settings, icon/color, category/location, connection mode (direct/WSS tunnel),
  config token (plain/rotated), driver host.
- Node files, rolling update, self-update.
- Permission: MANAGE_NODES umbrella + CRUD + scope.

## Frontend
`features/nodes/` pages: Nodes, NodeForm, NodeDetail, NodeStats, NodeSchedules. Edge config handler.

## Edge client
Panel calls node for inspect/telemetry; node pushes heartbeat.
