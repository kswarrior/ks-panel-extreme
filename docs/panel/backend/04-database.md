# Database

## Engines
MySQL, PostgreSQL, SQLite. All three must stay in sync via migrations in
`panel/backend/internal/db/migrations/{mysql,postgres,sqlite}/`.

## DB open
`internal/db/db.go` — opens connection, runs pending migrations, seeds core. Contains `SeedCore`
(permission keys, roles, defaults) and backfills.

## Models
`internal/models/` — shared structs: `models.go` (User, Role, Permission, Node, Template, Instance,
ApiKey, etc.), plus domain files (activity, api_key, authority, instance, instance_advanced, mod,
moddeps, modmanifest, modver, node, notification, security, stack, theme, ticket).

## Repositories
`internal/repository/` — one repo per domain (user_repo, role_repo, node_repo, instance_repo,
template_repo, mod_repo, application_repo, stack_repo, theme_repo, ticket_repo, etc.). Handlers
never write SQL. Includes `db.go` (connection helpers), `db_time.go`, `pg_compat.go`.

## Migrations
84 migrations (001..084). Never edit shipped; add new in all three engines. See
`reference/migrations-list.md` and `guides/migrations-howto.md`.

## Datamove
`internal/datamove/` — DB engine migration helpers (move data between engines).

## Backup
`internal/backup/` + `database_backup_handler.go` + backup schedule handler.
