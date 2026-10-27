# Frontend Routing

All routes in `panel/frontend/src/app/router.tsx`. Authed pages wrapped in `<Layout/>` with
`<RequireAuth/>` + per-page `<RequirePermission>`. Lazy imports for code splitting.

## Route groups (prefix)
- `/auth/*` — login, register, verify-email (static).
- `/instances`, `/instances/:id/*` — instance list/detail/dynamic pages, stats, schedules, form, advanced.
- `/nodes`, `/nodes/:id/*` — nodes, stats, schedules, form.
- `/templates`, `/templates/:id/*` — templates, stats, schedules, form/detail.
- `/applications`, `/applications/:id/*` — applications, studio, configure, stats, schedules, detail.
- `/mods`, `/mods/:id/*` — mods, studio, stats, schedules, detail.
- `/stacks`, `/stacks/:id/*` — stacks, detail, files, view, form, stats, schedules.
- `/themes`, `/themes/:id/*` — themes, studio, stats, schedules, detail.
- `/instance-pages`, `/instance-pages/:id/*` — instance pages, studio, stats, schedules, detail.
- `/tickets`, `/tickets/:id/*` — tickets, detail, form, stats, schedules, chat.
- `/users`, `/roles`, `/api-keys` (with stats/schedules/forms).
- `/security`, `/system`, `/activity`, `/notifications`, `/database`, `/settings`, `/account`.
- Catch-all: unauth → login (with `from`), auth → `/instances`.

## Instance dynamic pages
`/instances/:id/*` renders instance dynamic pages (custom tabs) via `InstanceDynamicPage`.
