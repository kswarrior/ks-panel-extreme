# Stacks Plan — Complete Full-Stack System

New complete system like Mods / Applications. One `stack` = one full isolated app (dashboard OR tool OR tracker OR any internal app). Dashboard is only `category=dashboard`.

Split (do not mix):
- `Mods` = modify panel itself. Goja `ks.log/storage/events`, `pre/post` hooks, `<Slot/>`. No ports, no long-run. Touch nothing.
- `Applications` = outer headless workloads on edge (`nodejs/python/bash`, `host/docker/lxd/kvm/multipass`). No panel UI. Touch nothing.
- `Stacks` = new full pages. Isolated frontend + backend sidecar + own nav + own data + own files + own logs. This plan only.

Defaults (locked to start Phase-0): runtimes `static + nodejs + python`, data `KV + sqlite-file per stack`, limits `20 sidecars, ports 18000-18100, 256MiB/stack, 15s proxy timeout`.

## 1. Package `.ksps` (KS Panel Stack)

Zip, mirrors `modengine/pkgstore.go` guards (zip-slip, symlink skip, `IsZipBytes`, slug `^[a-z0-9][a-z0-9-]{0,63}$`):
- `manifest.json` (root, canonical): `name, slug, version, description, icon, color, category [dashboard|tool|tracker|status|crud|custom], routes[], nav{label,icon,order}, permissionsRequested[], backend{runtime [static|nodejs|python], entrypoint, port[0=auto], env{}, health{/health,interval}, cron[]}, frontend{dist, spa:true}, database{kv:true, sqlite:"data.db"|null}, min_panel`
- `frontend/dist/**` (built static, `index.html` entry, `spa:true` = fallback to index.html)
- `backend/**` (`server.js` / `main.py` / empty for static)
- `spec.json` (opaque UI config passthrough), `README.md` (optional, rendered in Detail)
- `data/` seed (optional, copied on first install only)

Store: `<datadir>/stack-packages/<slug>.ksps` + live `<datadir>/stack-work/<slug>/` + `<datadir>/stack-data/<slug>/` (sqlite + kv stays here so re-install keeps data unless wiped). `stackstore.go` ports `Save/Load/Exists/EnsureWorkDirLocked/ReadAsset/RepackFromWorkdir/RemoveAll`. Studio/URL/JSON synthesize minimal `.ksps` so every stack downloadable. Download = repack live workdir (edits included), never stale bytes.

Manifest example:
```json
{
  "name": "Server Dashboard", "slug": "server-dashboard", "version": "1.0.0",
  "category": "dashboard", "icon": "📊", "color": "#0ea5e9",
  "routes": [{"path": "/", "title": "Overview"}],
  "nav": {"label": "Dashboard", "icon": "📊", "order": 10},
  "permissionsRequested": [
    {"capability": "metrics.read", "access_level": "read_only"},
    {"capability": "outbound_http", "access_level": "standard"}
  ],
  "backend": {"runtime": "nodejs", "entrypoint": "backend/server.js", "health": "/health"},
  "frontend": {"dist": "dist", "spa": true},
  "database": {"kv": true, "sql": "isolated|shared|none", "schema": "schema.sql"}
}
```

## 2. Data (KV + SQL on every panel engine, powerful)

Panel engines: `sqlite | postgres | mysql` (`db/dialect.go:NewDialect`, MSSQL deferred). Stack data works on all 3, no sqlite-only path.

- `stack_kv(stack_slug, key, value, updated_at)` — universal, lives in panel DB (triplicated migration). SDK + backend only, Detail > Data tab search + delete.
- `sql: isolated` (default, zero-config): one sqlite file per stack `stack-data/<slug>/data.db` (WAL), SAME file even when panel runs postgres/mysql. Zero permission issues, zip backup, easy wipe. Backend gets `STACK_DB_ENGINE=sqlite + STACK_DB=file:...`. Best for dashboards/tools that want own DB.
- `sql: shared` (panel-native): namespaced tables inside panel DB via `StackDB` abstraction. Prefix `st_<slug>_` on every table (no postgres schema / mysql db permission issues on shared hosting). Stack ships portable `schema.sql` (panel rewrites: `AUTOINCREMENT`→per-dialect, `DATETIME`→`TIMESTAMP` on pg via `dialect.datetimeType()`, `?`→`$N` on pg via `Dialect.Placeholder`). Registry `stack_tables(stack_slug, table_name)` + allow-list: queries may touch `st_<slug>_*` only, single-statement, 5s timeout, block `ATTACH/PRAGMA/outside-prefix DDL`. Backend gets `STACK_DB_ENGINE=<panel engine> + STACK_DB_DSN(loopback/panel pool) + STACK_TABLE_PREFIX`. Frontend only via allow-listed `stack.fetch('/db/*')` paths declared in caps.
- `sql: none`: KV + files only.
- Backup/wipe cover both: isolated = zip `data.db`; shared = `SELECT *` dump to JSON + restore (drop prefix tables + re-apply `schema.sql` + re-insert). Buttons in Detail > Data tab (confirm + audit).
- Env: `stack_env(stack_slug, key, secret[0|1])` — secretbox-encrypted when secret=1, masked in list, Detail > Env tab edit, injected to sidecar only. Merge: manifest defaults < saved env < restart overrides.

## 3. Backend (supervisor, powerful)

New `stacksupervisor/` only:
- Runtimes: `static` (no proc), `nodejs` (`node backend/server.js --port $PORT`), `python` (`python main.py --port $PORT` / `uvicorn` if detected). Deny `bash/custom` v1. Kill existing tree on restart/delete (pgid).
- Port allocator `18000-18100` persisted (`stack_ports`), loopback `127.0.0.1` only. Env injected: `PORT, STACK_SLUG, STACK_WORK, STACK_DATA, STACK_DB_ENGINE, STACK_DB (file path | shared DSN), STACK_TABLE_PREFIX, STACK_KV_PREFIX`.
- Health: `GET 127.0.0.1:port/health` 3s timeout, 3 retries on start; unhealthy -> `error` + log tail in Detail. Auto-restart max 3, then `error` (no loop).
- Logs: per-stack ring 500 lines (`stdout+stderr` + supervisor events `start/stop/crash/health`), `GET /api/stacks/:id/logs?tail=200`, live poll 3s in UI. Never log secret values (redact `key|token|secret|password`).
- Metrics (light): `cpu_ms, mem_kb` via proc poll 10s, shown in Detail header + `GET /api/stacks/:id/status {state,port,pid,uptime,health,metrics}`. Kill-switch global `stacks_enabled` KV + per-stack `active` flag. `BootStacks(ctx)` starts active only.
- Cron (v1 lite): `manifest.backend.cron[] {id, schedule, path}` -> panel cron calls `stack.fetch(path)` internally, logged to same ring. No separate worker v1.

## 4. Proxy + UI serving (isolation)

`handlers/stack_proxy.go`:
- `GET /api/stacks/:slug/ui/*` — static from workdir `frontend/dist`, traversal-guarded, `no-cache` html / `1h` hashed assets, `X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'`. SPA fallback to `index.html`.
- `ANY /api/stacks/:slug/api/*` — reverse proxy to sidecar loopback only (never user-supplied host), 15s timeout, 8MiB body cap, strips `Cookie/Authorization`, adds `X-Stack-Slug + X-Stack-Caps`, `403` when cap not granted, audit on non-GET. WebSocket upgrade allowed v1 (passthrough, same cap gate).
- `GET /api/stacks/nav` — active stacks `{slug,label,icon,order}` for sidebar. Inactive/error hidden.

## 5. Stack Files (full explorer + editor, powerful)

Scoped to `stack-work/<slug>/`, UX copy of `InstanceFiles.tsx`:
- `handlers/stack_files.go`: `?op=list&path=/` -> `{entries[{name,type,size,mtime,mode}],path}`, `read?path=` (8MiB cap, text detect; binary -> download), `write|mkdir|rename|delete|chmod|unzip`, `upload` multipart (64MiB), `url {path,url}` SSRF-guarded, `zip?path=/` (download folder as zip), `snapshot` (zip workdir to `stack-data/<slug>/snapshots/*.zip`, list/restore). All `MANAGE_STACKS` + `STACKS_OWN/ALL`, `Clean+stay-under-workdir`, hide `.ksextracted`, slug immutable, audit all mutating ops.
- `StackFilesTab.tsx`: breadcrumb + search, drag&drop, new file/folder, rename/delete/chmod, code editor (`js/py/json/html/css/md/yaml/sql`), image preview, zip download, snapshot list/restore, edit-backend prompt `Restart stack?` button. Tabs in Detail: `Overview | Files | Data/Env | Grants | Logs | Settings`.

## 6. Frontend (complete)

- `shared/types/stack.ts`: `Stack{..., category, icon, color, runtime, entrypoint, state, port, source, package_size}, StackPermission, StackEnv{key,masked,secret}, StackKV, StackLog{ts,level,message}, StackStatus, STACK_CATEGORIES, STACK_RUNTIMES, slugify`
- `features/stacks/api/stacks.ts`: full client — `list/get/create/upload/download/update/delete/setGrants/activate/deactivate/status/logs/nav/files(list/read/write/mkdir/rename/delete/chmod/upload/url/zip/snapshots)/env/kv/dbBackup/wipe/restart/samples`
- Pages: `Stacks.tsx` (grid + category filter + source chip + state dot), `StackDetail.tsx` (header state+metrics+actions + 6 tabs), `StackView.tsx` (`/stacks/:slug/*` iframe + `KSStackSDK` + loading/error states + reload), `StackStudio.tsx` (manifest form + file scaffold + preview + install), `StackStats/Schedules.tsx` (mirror mods pattern).
- `router.tsx` + sidebar: `/stacks, /stack/:id, /stacks/:slug/*` gated `MANAGE_STACKS`.
- `KSStackSDK` (`/ui/ks-stack-sdk.js` served by panel, auto-injected): `KS.stack.theme(), KS.stack.fetch(apiPath,opts), KS.stack.kv.get/set/del, KS.stack.toast(msg), KS.stack.nav(path)` via postMessage; fetch goes through panel proxy so no direct sidecar URL/CORS.

## 7. Samples + Studio (build complete stack fast)

- `handlers/stack_samples.go` (same `Parse->Create` pipeline, `source=sample`): `server-dashboard` (static SPA + KV demo), `status-board` (python `/health + /api/status`), `tracker-tool` (nodejs + sqlite CRUD demo). One-click install inactive.
- `StackStudio`: scaffold buttons `Blank / Dashboard / Tool / Tracker` -> generates `manifest.json + frontend/dist/index.html + backend/server.js|main.py` in-memory -> `Install` via JSON path. After install guide points to Files tab to continue editing live.

## 8. Permissions + lifecycle (parity with Mods/Apps)

- `permissions/keys.go`: `MANAGE_STACKS + STACKS_OWN/ALL`, group wiring. Own sees own only, orphans fail closed (mirror migration `054` handlers).
- Caps namespace NEW (do not reuse mod caps raw): `metrics.read, instances.read, kv.read_write, db.read_write, outbound_http, notify` with `read_only/read_write/standard` levels. Whitelist enforced in `ParseManifest`; rows seeded `granted=false`; `Activate` -> `409+checklist` when pending; deactivate keeps grants; delete kills proc + removes package/work (data kept unless `?wipe=1`).
- Migrations `0xx_stacks.sql` x3 (mysql/postgres/sqlite, compatible types): `stacks, stack_permissions(FK cascade), stack_env, stack_kv, stack_ports`. Never edit shipped migration.
- `aiskills/stacks.md` (<4KB) for `get_docs`.

## 9. Security (fail closed)

SSRF (public-IP/DNS-pinned/15s/64MiB), traversal guards everywhere, sidecar loopback-only + no panel DB/cookie, secrets secretbox + masked + redacted logs, iframe `sandbox allow-scripts` + SAMEORIGIN, rate-limit proxy/files, `activity_logs` on every mutation, `V9` pass on all new routes (IDOR/traversal/injection/secrets).

## 10. Build order (complete stack)

0. Phase-0 base: migration + `models/stack.go` + `repository/stack_repo.go` + `keys.go` + `stackstore.go` + `stack_handler.go` CRUD/grants/activate + types/api/list-detail. `retest.sh` green, runtime placeholder.
1. Phase-1 static + Files + Data-KV: proxy `ui/*` + `StackView iframe + SDK theme/fetch/kv` + nav/sidebar + `stack_files.go + StackFilesTab` + `stack_kv` + 1 sample. Goal: install `server-dashboard`, edit `dist/index.html` live, KV works.
2. Phase-2 sidecar + power: supervisor nodejs/python + `api/*` proxy (+WS) + health/restart/metrics + logs ring + env editor + sqlite per-stack + backup/wipe + snapshots/zip + 2 more samples. Goal: `tracker-tool` CRUD works end-to-end from Files tab.
3. Phase-3 complete: Studio scaffold + Stats/Schedules + marketplace round-trip (repack download) + `aiskills/stacks.md` + cron lite. Goal: build-export-import a complete stack without CLI.

## 11. Verify (loop.md CHECKLIST V)

`go build ./... && go test ./...`, frontend build+typecheck+lint, migration x3 compat, `bash retest.sh` live: install sample -> 409 checklist -> grant -> activate -> iframe loads -> `stack.fetch` 403 before grant / 200 after -> edit file -> restart -> logs show start -> snapshot -> delete (+wipe) -> nav disappears. Security: traversal `..`, IDOR own-scope, secret mask, sandbox headers. `rebuild.sh` last.
