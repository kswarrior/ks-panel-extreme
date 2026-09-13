# KS Panel — Concept Map (AI-Optimized)

> Purpose: give an AI agent a complete mental model of WHERE things live.
> No per-file lists. Only main-part directory paths + role + when to touch.
> Rule from `loop.md`: always start navigation from the user-given path, stay inside the affected part.

## 0. Repo top level

```
repo/
├── panel/backend/        # Panel API server (Go) — Part 1
├── panel/frontend/       # Panel web UI (React+TS+Vite) — Part 2
├── edge/backend/         # Edge agent (Go, runs on nodes) — Part 3
├── instance_pages/       # Instance-page library, authored as YAML — Part 4
├── themes_market/        # Theme marketplace library (JSON)
├── docs/                 # Deep docs (threat model, build security, futures)
├── tools/                # Build helpers (e.g. version manifest stamper)
├── deploy/               # Deploy artifacts
├── release/              # Build output (kspanel, ksedge, version.json) — never edit by hand
├── rebuild.sh            # Final verification gate: frontend build + pagelib/themelib sync + Go builds
├── update.sh             # Sync binaries before tests
├── retest.sh             # Launch panel on :8080 only when panel is DOWN
├── loop.md               # Agent rules (THE LOOP) — read before any edit
└── VERSION               # Shared panel+edge semver, auto-bumped by rebuild.sh
```

Scope discipline: Backend = `panel/backend/`, Frontend = `panel/frontend/`, Edge = `edge/backend/`. Never grep `/` or the whole repo — stay in the affected part.

---

## 1. Panel Backend — `panel/backend/`

Role: single Go API server + serves embedded frontend + talks to edge nodes. DB: MySQL / Postgres / SQLite via migrations.

* `panel/backend/cmd/` — CLI entrypoints (panel binary, setup, seed, create-user, import-template). Start here to trace startup.
* `panel/backend/internal/api/` — HTTP layer: router, server setup, global middleware (auth, CSRF, rate-limit, security headers, validation). All route wiring lives here.
* `panel/backend/internal/api/handlers/` — One folder per domain (auth, instances, templates, nodes, mods, applications, instance-pages, security, system, files, terminal, etc.). If adding an endpoint, it goes here + route in parent folder.
* `panel/backend/internal/auth/` — Session tokens, cookies, MFA, password policy/history, lockout, session manager.
* `panel/backend/internal/models/` — DB structs shared by handlers + repository.
* `panel/backend/internal/repository/` — DB access only (one repo per domain). Handlers never write SQL directly.
* `panel/backend/internal/db/migrations/` — `mysql/`, `postgres/`, `sqlite/` must stay in sync. Never edit a shipped migration — add a new one.
* `panel/backend/internal/permissions/` — Permission engine + keys. Check here for authz gaps.
* `panel/backend/internal/edge/` — Panel-side client that calls edge nodes (exec, files, inspect, page-action).
* `panel/backend/internal/install/` — Template install engine (deploy flow template.spec → instance.config).
* `panel/backend/internal/modengine/` — Plugin/mod runtime (engine, eventbus, sandbox, storage).
* `panel/backend/internal/pagelib/` — Instance-page library loader + `library/` embed target. Reads `instance_pages/` on disk first, embedded binary fallback second. See §4.
* `panel/backend/internal/themelib/` — Same pattern for `themes_market/`.
* `panel/backend/internal/cli/` — Cobra-style commands (launch, seed, setup-localnode).
* `panel/backend/internal/config/` + `internal/edgeconfig/` + `internal/stackstore/` + `internal/tunnel/` + `internal/oauth/` + `internal/specyaml/` — Infra: config load, node pairing config, external stack registry, tunnel, OAuth, template spec YAML parsing.
* `panel/backend/internal/cron/` + `internal/scheduler/` + `internal/heartbeat/` + `internal/probe/` + `internal/sysinfo/` + `internal/health/` + `internal/version/` + `internal/secretbox/` + `internal/security/` + `internal/backup/` + `internal/datamove/` — Background jobs, telemetry, health, version stamp, secrets, rate-limit state, backup.
* `panel/backend/internal/ui/` — Embed target for built frontend (`frontend/dist` copied here by `rebuild.sh`). Never edit directly.
* `panel/backend/internal/dist/` — Static/dist helpers.

Flow: request → `internal/api/` (route+middleware) → `handlers/` → `repository/` → `models/`/`db/` → response. Cross-node work → `internal/edge/` → Edge §3.

---

## 2. Panel Frontend — `panel/frontend/src/`

Role: React SPA. Entry: `src/main.tsx` → `src/app/App.tsx` → `src/app/router.tsx`. Styling: Tailwind + theme tokens (`var(--ks-*)`).

* `src/app/` — App shell + router only. All routes defined here. Catch-all `/instances/:id/*` renders instance dynamic pages.
* `src/features/` — One folder per domain. Each feature = `pages/` (route screens) + `components/` (feature-local UI) + `api/` (fetch client for that domain) + `types/` (+ optional `hooks/`). Feature list and meaning:
  * `auth/` — login, register, verify-email
  * `account/` — own profile
  * `users/` + `roles/` — admin user/role CRUD
  * `nodes/` — edge node list/detail/form/stats
  * `instances/` — instance list/detail/router/stats + instance tabs header
  * `instance-pages/` — Studio (create/edit pages), templates tab, blocks/actions/components/sub-pages editors, preview. See §4.
  * `templates/` — template list/form/stats + TemplateForm sections (runtime, env, actions, healthcheck, labels, pages)
  * `applications/` — app catalog + configure/edit + run modal + studio tab
  * `mods/` — mod list + studio + presets
  * `stacks/` — external stack dashboards
  * `templates/` + `applications/` + `mods/` all feed the install engine (§1).
  * `security/` — security page + Authentication (lockout/MFA) + Sessions tabs
  * `system/` — system page + PanelTab (update/reinstall) + HostPanel (telemetry) + charts
  * `themes/` — theme list + ThemeStudio tabs (accent, background, button, card, typography, sidebar, etc.)
  * `activity/` — activity feed + cards
  * `api-keys/` — key list/form/detail
  * `authority/` — SMTP/OAuth/OTP settings
  * `database/` — DB inspector
  * `settings/` — panel settings
  * `notifications/` + `tickets/` + `ai-chat/` — supporting surfaces
* `src/shared/` — Cross-feature reuse. Look here BEFORE creating anything new:
  * `src/shared/components/ui/` — Reusable UI kit (Card, Modal, Field, Loading, MetricsChart, CustomPageView, RequireAuth, RequirePermission, RichMenu, etc.). Instance YAML pages must reuse these classes/tokens.
  * `src/shared/components/layout/` — Main Layout, Sidebar, Header, InstanceNavContext, ThemeSync, Background. Page chrome lives here.
  * `src/shared/components/forms/` + `src/shared/components/brand/` — Shared form rows + branding.
  * `src/shared/api/` — Base API client + admin client. Feature `api/` files wrap this.
  * `src/shared/lib/` — `customPageSdk.ts` (KSPageSDK injected into every instance page) + React-page transpiler. SDK contract lives here.
  * `src/shared/hooks/` — Shared React hooks (e.g. instance loader).
  * `src/shared/stores/` — Global stores (auth, prefs, settings).
  * `src/shared/types/` + `src/shared/utils/` — Shared TS types + instance-page resolution (`isPageAllowed`, `getPageContent`, nav builder).
* `src/theme/` — Theme defaults + Studio controls. Active theme is baked into YAML-page iframes as CSS vars.
* `src/index.css` — Global styles only.

Rule: shared UI → `src/shared/components/ui/`; page chrome → `src/shared/components/layout/`; domain screen → `src/features/<domain>/pages/`; domain widget → `src/features/<domain>/components/`; API call → `src/features/<domain>/api/` or `src/shared/api/`.

---

## 3. Edge Backend — `edge/backend/`

Role: small Go agent that runs ON each node/host. Panel calls it; it executes drivers, files, lifecycle, telemetry. No DB, no UI.

* `edge/backend/cmd/` — Edge binary entrypoint (thin shim → CLI builder).
* `edge/backend/internal/cli/` — Edge CLI commands.
* `edge/backend/internal/config/` — JSON config load + defaults + validation.
* `edge/backend/internal/drivers/` — Virtualization drivers (docker, kvm, lxd, multipass) + registry + inspect helpers. Add a new hypervisor here.
* `edge/backend/internal/exec/` + `internal/execrpc/` + `internal/execstage/` + `internal/hostexec/` — One-shot exec inside container vs on host filesystem + shared env/file-staging builder.
* `edge/backend/internal/files/` + `internal/sftp/` — File read/write/list + SFTP.
* `edge/backend/internal/pageaction/` — Executes instance-page allow-listed actions (shell/read_file/write_file/list_files/docker/kvm/lxd). Called by panel `handlers/instance_page_handler` via `internal/edge/`.
* `edge/backend/internal/lifecycle/` + `internal/install/` + `internal/snapshot/` — Create/start/stop/delete, install steps, snapshots.
* `edge/backend/internal/inspect/` + `internal/ports/` + `internal/telemetry/` + `internal/health/` + `internal/heartbeat/` — Live processes/metrics/ports, telemetry push, health + heartbeat endpoints.
* `edge/backend/internal/attach/` + `internal/tunnel/` — Terminal attach + tunnel.
* `edge/backend/internal/update/` + `internal/version/` — Self-update + version stamp.

Flow: panel `internal/edge/` → HTTP to edge `internal/<domain>/` → driver/exec → result back.

---

## 4. Instance Pages (YAML system) — `instance_pages/`

Role: per-instance custom tabs authored once as YAML, embedded in the panel binary, linked into templates, snapshotted into instances, rendered in frontend, executed on edge.

* `instance_pages/pages/` — **Canonical authoring location. One YAML file per page.** Examples in repo: files, terminal, env, ports, automation, minecraft-properties, react-dashboard. New pages belong here as `*.yaml` (literal `|` blocks for HTML/JS/markdown, native lists for actions/sub_pages/components).
* `instance_pages/marketplace.json` — Catalog whose entries point at raw-GitHub URLs of `pages/*.yaml`. Add entry per new page.
* `instance_pages/GUIDE.md` — Exhaustive authoring manual (fields, content types html/markdown/blocks/react, actions allow-list, components `{{component:name}}`, sub-pages, KSPageSDK, theme vars, validation limits). Read before authoring.
* `instance_pages/README.md` — Short format ref.
* Backend embed: `panel/backend/internal/pagelib/` — `rebuild.sh:sync_pagelib()` copies `marketplace.json` + `pages/*.yaml` into `internal/pagelib/library/` → `go:embed` → binary carries pages even with no `instance_pages/` on disk. Read order: disk `pages/*.yaml` → disk legacy → embedded fallback.
* Backend API: `panel/backend/internal/api/handlers/` (instance-page handlers) — CRUD, import (file/URL/marketplace), link-to-template, execute-action (allow-list check), KV store.
* Template link: page copied into `template.spec.pages[]` → instance deploy snapshots into `instance.config`.
* Frontend Studio: `panel/frontend/src/features/instance-pages/` — create/edit/test/preview/import/export. Sub-editors for Main page, Sub-pages, Components, Actions, Preview.
* Frontend render: `panel/frontend/src/shared/components/ui/CustomPageView.tsx` (iframe for html, host React for markdown/blocks/react) + `panel/frontend/src/shared/lib/customPageSdk.ts` (`window.KSPageSDK`: runAction, fetchPanel, shell/readFile/writeFile/listFiles, navigate, toast/confirm/modal, chart, markdown, storage, kv, connectWS) + `panel/frontend/src/shared/utils/instancePages.ts` (allow-check, content resolve, nav).
* Edge execute: `edge/backend/internal/pageaction/` via panel `panel/backend/internal/edge/`.

Lifecycle: Studio/author YAML → library (`instance_pages/` table) → link into `template.spec` → snapshot into `instance.config` → render via CustomPageView+SDK → actions run on edge via allow-list.

Content types: `html` (sandboxed iframe, full control, needs theme `<style>` header), `markdown` (host-rendered docs), `blocks` (visual no-HTML rows), `react` (JSX entry + virtual-module files stored as `components type=module`).

---

## 5. Themes — `themes_market/`

* `themes_market/market/` — Canonical theme JSON library.
* `themes_market/marketplace.json` — Catalog.
* Backend embed: `panel/backend/internal/themelib/library/` via `rebuild.sh:sync_themelib()` (same embed pattern as §4).
* Frontend editor: `panel/frontend/src/features/themes/` + tokens in `panel/frontend/src/theme/`.

---

## 6. Build / verify entrypoints (directories + scripts, not code)

* `rebuild.sh` — MUST pass after any edit. Builds frontend (Vite) → embeds into `panel/backend/internal/ui/` → syncs `instance_pages/` → `pagelib/library/` and `themes_market/` → `themelib/library/` → builds `release/kspanel` + `release/ksedge` → checksums + `release/version.json`.
* `loop.md` — Agent workflow (plan → edit minimal → CHECKLIST V → rebuild). Map-first, scoped navigation, zero assumptions, twice-check.
* `docs/` — `THREAT_MODEL.md`, `BUILD_SECURITY.md`, `futures.md`, `vs/` comparisons.
* `dash/` — Sample external stack app for testing stack pairing.
* `tools/` — Release helpers.

## 7. How to navigate (for AI)

1. User gives a path → start THERE, then widen only inside the same part (§0).
2. Need a screen? → `panel/frontend/src/features/<domain>/pages/`. Need a widget? → same feature `components/` else `src/shared/components/ui/`.
3. Need an endpoint? → `panel/backend/internal/api/handlers/` + route in `panel/backend/internal/api/`.
4. Need node execution? → panel `internal/edge/` → `edge/backend/internal/<exec|files|lifecycle|drivers|pageaction>/`.
5. Need an instance tab? → author `instance_pages/pages/<slug>.yaml` → Studio in `panel/frontend/src/features/instance-pages/` → render via `src/shared/components/ui/` CustomPageView + `src/shared/lib/` SDK → execute via `edge/backend/internal/pageaction/`.
6. Before creating a file prove no existing dir above already does the job. After editing run `rebuild.sh` and re-read the diff.
