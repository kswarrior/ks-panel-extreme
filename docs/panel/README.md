# KS Panel — Documentation Hub (Panel Only)

> Scope: the **panel** (backend Go API + React frontend). Edge agent, instance pages authoring,
> and themes marketplace are documented separately (edge later). Everything here is verified
> against source under `panel/backend/` and `panel/frontend/`. Paths are relative to repo root.

## Read order
1. `overview/` — what KS Panel is, architecture, parts.
2. `backend/` — Go server, DB, auth, permissions, routes, edge client.
3. `frontend/` — React SPA structure, routing, state, UI.
4. `features/` — one deep-dive per product area.
5. `guides/` — dev, build, add endpoint/feature, migrations, tests, deploy.
6. `security/` — threat model, build security, hardening.
7. `future/` — futures roadmap and gaps.
8. `reference/` — permission keys, migrations, routes, env vars, endpoints.

## Key entrypoints
- Backend: `panel/backend/cmd/kspanel/main.go`, `panel/backend/internal/cli/`, `internal/api/server.go`.
- Frontend: `panel/frontend/src/main.tsx` → `src/app/App.tsx` → `src/app/router.tsx`.
- Build gate: `rebuild.sh` (frontend build → embed → sync pagelib/themelib → Go builds).
- DB: `panel/backend/internal/db/migrations/{mysql,postgres,sqlite}/` (84 migrations, must stay in sync).
- Agent rules: `loop.md`, `map.md`.

## Version
Current: see `VERSION` (1.0.299 at doc time). Panel+edge share semver, auto-bumped by rebuild.

## Conventions
- Backend flow: request → `internal/api/` (route+middleware) → `handlers/` → `repository/` → `models/`/`db/` → response.
- Cross-node work → `internal/edge/` → edge HTTP.
- Frontend: feature folders `src/features/<domain>/{pages,components,api,types,hooks}`; shared in `src/shared/`.
- Never edit generated: `release/`, `internal/ui/`, `internal/pagelib/library/`, `internal/themelib/library/`.
