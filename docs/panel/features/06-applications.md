# Applications

Deep dive: `docs/application.md` (authoritative). Summary here.

## Concept
Admin-curated bot/service catalog (`/applications`) with one-shot Run engine. Application = metadata
(name, slug, category, runtime, entrypoint), staged script files, config schema, env defaults,
requested capabilities. Runs staged to panel host or edge node (host/container/VM), executed once,
result stored in `application_runs`.

## Backend
`application_handler.go` (CRUD/grants), `application_run.go` (run engine). Repo `application_repo.go`.
Models in `models.go`. Migrations: 029, 045, 054, 061, 082. Permission: MANAGE_APPLICATIONS umbrella
+ CRUD + scope. Capability grants gate activation.

## Frontend
`features/applications/`: Applications, ApplicationStudio, ApplicationEdit, ApplicationConfigure,
ApplicationStats, ApplicationDetail, ApplicationSchedules.

## Edge
Exec surfaces: `hostexec`, `execrpc`, `execstage`. Panel edge client `ExecRequest`/`ExecFile`/
`HostExecRequest`.

## Status
Catalog + run wired. `application_installations`/`USE_APPLICATIONS` reserved but no routes.
Notifications constant exists but nothing emits. AI read-only topic.
