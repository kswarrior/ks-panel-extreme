# Stacks Plan

New complete system like Mods / Applications. One `stack` is one full-stack item (dashboard OR tool). Dashboard is just `category=dashboard`, not the system name.

Split (do not mix):
- `Mods` = modify panel itself. Goja `ks.log/storage/events`, `pre/post` hooks, `<Slot/>`. No ports, no long-run. Touch nothing here.
- `Applications` = outer headless workloads on edge (`nodejs/python/bash`, `host/docker/lxd/kvm/multipass`). No panel UI. Touch nothing here.
- `Stacks` = new full pages. Isolated frontend + backend sidecar + own nav + own storage. This plan only.

## Package `.ksps` (KS Panel Stack)

Zip, mirrors `modengine/pkgstore.go` guards (zip-slip, symlink skip, `IsZipBytes`, safe slug `[a-z0-9-]`):
- `manifest.json` (canonical, root): `name, slug, version, description, icon, category [dashboard|tool|tracker|custom], routes[], nav{}, permissionsRequested[], backend{runtime, entrypoint}, frontend{dist: dist/index.html}`
- `frontend/dist/**` (static build output, `index.html` entry)
- `backend/**` (`entrypoint` e.g. `server.js` / `main.py`)
- `spec.json` (optional opaque UI config, passthrough like mods)

Store: `<datadir>/stack-packages/<slug>.ksps` + extract `<datadir>/stack-work/<slug>/`. Reuse `SavePackage/EnsureWorkDirLocked/ReadAsset` pattern in new `stackstore.go`. Studio/URL/JSON installs synthesize minimal `.ksps` via `BuildPackageZip` so every stack stays downloadable.

Manifest example:
```json
{
  "name": "Server Dashboard", "slug": "server-dashboard", "version": "1.0.0",
  "category": "dashboard", "icon": "📊",
  "routes": [{"path": "/", "title": "Overview"}],
  "nav": {"label": "Dashboard", "icon": "📊"},
  "permissionsRequested": [{"capability": "metrics.read", "access_level": "read_only"}],
  "backend": {"runtime": "nodejs", "entrypoint": "backend/server.js"},
  "frontend": {"dist": "dist/index.html"}
}
```

## Frontend

New `features/stacks/`, mirrors `features/mods/` + `features/applications/`:
- `shared/types/stack.ts`: `Stack, StackPermission, StackRoute, StackNav, StackLog, StackStatus(running|stopped|error), StackCategoryMeta, StackRuntimeMeta(nodejs|python|static)`
- `features/stacks/api/stacks.ts`: `list/get/create/upload/download/update/delete/setGrants/activate/deactivate/getLogs/getStatus/listSamples/installSample`
- `features/stacks/pages/Stacks.tsx` (catalog + source chip + pending badge), `StackDetail.tsx` (grants checklist + logs + files preview), `StackView.tsx` (route `/stacks/:slug/*` -> sandboxed `iframe src=/api/stacks/:slug/ui/*` + `KSStackSDK` postMessage bridge: theme tokens, nav, `stack.fetch(path)`), `StackStudio.tsx` (Phase-2, minimal manifest builder), `StackStats/Schedules.tsx` (follow mods/applications pattern)
- `router.tsx`: `/stacks`, `/stack/:id`, `/stacks/:slug/*` (all `MANAGE_STACKS`). Sidebar group auto-built from `GET /api/stacks/nav` (active stacks only).
- Isolation: `iframe sandbox="allow-scripts allow-same-origin"` + CSP. No `window.KS.registerComponent`, no `<Slot/>`, no global CSS leak. Reuse `CustomPageView` theme vars, not its renderer.

`KSStackSDK` (v1, minimal):
- `KS.stack.theme()`, `KS.stack.fetch(apiPath, opts)` -> proxied `GET /api/stacks/:slug/api/*` with panel cookie + granted-cap check, `KS.stack.storage.get/set` (namespaced KV via proxy, not direct DB).

## Backend

New files only, no edits to `mod_handler.go / application_handler.go / modengine/`:
- `models/stack.go`: `Stack, StackPermission, Cap*` for stacks (`metrics.read`, `instances.read`, `outbound_http` — new namespace, do NOT reuse `CapTerminal/CapFilesystem` raw; map to proxy allow-list)
- `repository/stack_repo.go`: `Create/Get/List/Update/Delete/Activate/Deactivate/SetGrants/AllGranted`, mirror `mod_repo.go` + `application_repo.go` validation (slug regex, capability whitelist, `granted=false` seed)
- `stackstore/stackstore.go`: copy `pkgstore.go` pattern for `.ksps`
- `stacksupervisor/`: port allocator (e.g. `127.0.0.1:18000+`), process supervise (`node backend/server.js` / `python main.py` / `static` = no proc), health check `/health`, log ring (reuse `modengine/status.go` shape), kill per-stack + global switch `stacks_enabled` settings KV
- `handlers/stack_handler.go`: CRUD + grants + activate/deactivate + logs + status + download, same ownership scope pattern as migration `054` (`STACKS_OWN/ALL`, orphans fail closed)
- `handlers/stack_proxy.go`: `GET /api/stacks/:slug/ui/*` (static, `no-cache`, traversal-guarded) + `ANY /api/stacks/:slug/api/*` (reverse proxy to sidecar loopback only, timeout 15s, body cap 8MiB, strip secrets, audit)
- `handlers/stack_samples.go`: 2 built-ins (`server-dashboard` static, `hello-tool` static+KV) through same `ParseManifest->Create` pipeline, `source=sample`
- `server.go`: mount `/api/stacks/*` protected group, `BootStacks(ctx)` after migrations (start active stacks, skip when kill-switch off)
- Migrations `0xx_stacks.sql` x3 (mysql/postgres/sqlite): `stacks, stack_permissions (FK cascade), stack_runs? (Phase-2, optional)` — types/defaults/booleans compatible on all 3, never edit shipped migration
- `permissions/keys.go`: `ManageStacksKey=MANAGE_STACKS`, `StacksOwnKey/STACKS_ALL`, group wiring like Mods/Applications
- `aiskills/stacks.md`: 4KB guide for `get_docs`

Lifecycle (same gate as mods/apps): `install inactive -> approve every cap -> activate -> running`. `409 + checklist` on pending. Deactivate keeps grants. Delete tears down proc + removes package/workdir (best-effort, log not fail).

## Security (fail closed)

- SSRF guard on URL install (reuse `fetchManifestFromURL`: public IP only, DNS-pinned, 15s, 64MiB cap)
- Sidecar binds loopback only, panel proxies; stack never sees panel DB/cookie/secrets; env injected allow-list only
- `iframe` sandbox + `X-Frame-Options: SAMEORIGIN` on ui routes; `safeSlug` + traversal guard on all asset/proxy paths
- Capability proxy allow-list: frontend `stack.fetch` can only hit declared caps; ungranted -> `403`
- Rate-limit proxy + run endpoints; activity log every create/grant/activate/deactivate

## Build order

1. Phase-0: migration + models + repo + keys + `stackstore` + CRUD/grants/activate handlers + `types/stack.ts + api/stacks.ts + Stacks/Detail` list. Verify with `retest.sh`, no runtime yet (`static` stacks render placeholder).
2. Phase-1 (MVP static dashboards): `stack_proxy ui/*` + `StackView iframe` + `KSStackSDK theme/fetch/storage(KV)` + `nav` endpoint + sidebar + 2 samples. Goal: install -> grant -> activate -> open `/stacks/server-dashboard/` dashboard working, no backend proc.
3. Phase-2 (full-stack): supervisor (`nodejs/python/static`), `api/*` proxy, logs/status/kill-switch, Studio lite. Goal: `hello-tool` with `backend/server.js` counter API working.
4. Phase-3: marketplace share (download/upload round-trip), docs skill, stats/schedules pages.

## Verify (loop.md CHECKLIST V)

- `go build ./... && go test ./...`, frontend `build+typecheck+lint`, migration compat x3 DBs
- Live: `bash retest.sh` — install sample -> pending 409 -> grant -> activate -> open iframe -> proxy fetch -> deactivate -> delete, check `activity_logs` + sidebar nav appears/disappears
- Security pass: traversal, IDOR (`STACKS_OWN` sees own only), secret redaction, iframe sandbox

## Open decisions (ask before Phase-2)

- Runtimes v1: `static + nodejs` only, or `+python` day one?
- Per-stack DB: KV only v1, or per-stack sqlite file too?
- Max sidecars + port range + memory cap defaults?
