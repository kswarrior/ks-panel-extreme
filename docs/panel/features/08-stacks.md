# Stacks

Backend: `stack_handler.go`, `stack_op.go`, `stack_proxy.go`, `stack_remote.go`, `stack_serve.go`,
`stack_serve_port.go`, `stack_files.go`, `stack_token_api.go`, `stack_workflow.go`, `scheduled_update_runs?`.
Repo: `stack_repo.go`. Models: `stack.go`. Migrations: 071, 072, 076, 077. Permission: MANAGE_STACKS
umbrella + CRUD + scope.

## Concept
Self-hosted web apps (dashboards/tools/trackers) with sidecar supervisor + reverse proxy. Stack
heartbeat/announce endpoints. Stack files, serve port, proxy, tokens, remote ops, workflow.

## Frontend
`features/stacks/`: Stacks, StackDetail, StackFiles, StackView, StackForm, StackStats, StackSchedules.

## Infra
`internal/stackstore/` (external stack registry), `internal/tunnel/`. Dash sample app in `dash/`.
