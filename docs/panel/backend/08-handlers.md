# Handlers

Location: `panel/backend/internal/api/handlers/` — one file per domain. Naming: `<domain>_handler.go`,
plus specialized files (run, advanced, inspect, backup, port, terminal, page, react, kv, yaml, guard).

## Domains covered
auth, auth_register, me, me_auth, profile, users, roles, settings, panel_page, authority, ai_chat (+extra/fallback),
api_key, nodes, templates, mods (+events/hostops/samples/settings), applications (+run), stacks (+files/op/proxy/serve/token/workflow),
instance_pages (+kv/react/yaml/guard/new_actions), instances (+advanced/backup/inspect/port/terminal_test), tickets (+attachment/sla),
notifications, themes, security, system, update (+auto/verify/window), terminal, files, sftp, database (+backup/verify),
activity, authority_branding, edge_config, oauth, automation, backup_schedule, scheduled_update_runs, startup, ddos_script,
substitute_env, node_rolling_update, node_update, node_files, toml_rt_tmp tests.

## Conventions
- Handlers call repositories; return JSON; use permission helpers.
- Errors: meaningful, non-leaking. Validation middleware handles input.
- Edge calls via `internal/edge/` client.
