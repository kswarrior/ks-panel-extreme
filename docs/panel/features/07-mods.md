# Mods

Backend: `mod_handler.go`, `mod_events.go`, `mod_hostops.go`, `mod_samples.go`, `mod_settings_handler.go`.
Repo: `mod_repo.go`, `mod_settings_repo.go`. Models: `mod.go`, `moddeps.go`, `modmanifest`, `modver`.
Migrations: 017, 020, 027, 036, 081, 083. Permission: MANAGE_MODS umbrella + CRUD + scope.

## Concept
Goja-scripted panel plugins running inside panel process via mod engine (eventbus, sandbox, storage).
Upload/edit/activate; activation gated by per-requested-capability grants. Mod samples in
`mod_samples/`. Mod settings scopes (migration 083).

## Frontend
`features/mods/`: Mods, ModStudio, ModScreen, ModStats, ModDetail, ModSchedules.

## Mod engine
`internal/modengine/`: engine, eventbus, sandbox, storage. Mods can request DB read/write, terminal,
container/VM control; admin approves capabilities.
