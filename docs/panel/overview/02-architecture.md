# Architecture

## High-level
```
Browser (React SPA) ──HTTP/WS──▶ Panel (Go, chi) ──HTTP──▶ Edge agent (Go) ──▶ drivers/exec/files
                                    │
                                    ▼
                              DB (MySQL/Postgres/SQLite)
```

## Panel backend (`panel/backend/`)
- Single Go module `github.com/example/kspanel`, Go 1.25.
- HTTP router: chi v5, CSRF, rate limiter, security headers, validation middleware.
- Embedded frontend: `internal/ui/` (built dist copied by rebuild.sh).
- Embedded libraries: `internal/pagelib/library/`, `internal/themelib/library/`.
- DB access via repository layer; migrations per dialect.
- Edge client: `internal/edge/` calls nodes over HTTP (exec, files, inspect, page-action, tunnel).

## Panel frontend (`panel/frontend/`)
- React 18 + TypeScript + Vite + Tailwind + theme tokens (`var(--ks-*)`).
- React Router v6, lazy-loaded pages, zustand stores.
- Entry: `src/main.tsx` → `src/app/App.tsx` → `src/app/router.tsx`.
- Shared UI kit: `src/shared/components/ui/`.

## Edge backend (`edge/backend/`)
- Small Go agent on each node. No DB/UI. Drivers, exec, files, SFTP, lifecycle, telemetry,
  heartbeat, tunnel, attach, page-action, snapshot, install. Documented later.

## Instance pages system
Author YAML in `instance_pages/pages/` → library table → link to template → snapshot into instance
config → render via `CustomPageView` + `KSPageSDK` → actions run on edge via allow-list.

## Data flow (instance deploy)
Template spec → install engine (`internal/install/`) → edge drivers create workload → instance row
stored with spec snapshot in `instance.config` → frontend instance detail reads config.

## Storage
- SQLite default (`./kspanel.db`); Postgres/MySQL via env. See config.
- Persistent files (logos, backups, kspanel.env) anchor to SQLite path / cwd.
