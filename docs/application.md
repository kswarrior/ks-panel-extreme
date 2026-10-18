# KS Panel — Applications System (Deep Documentation)

> Audience: any AI model or engineer that must understand the whole "Application"
> system without reading the codebase. Everything here is verified against the
> source at the paths referenced. Where reality differs from older notes
> (`docs/futures.md` items 58/59), this document wins.
>
> Scope: the **Applications** feature — the admin-curated bot/service catalog
> (`/applications`) and its one-shot Run engine. Not templates, not instances,
> not mods, not stacks.

---

## 1. Mental model

An **Application** is a catalog entry that describes a runnable script/service:
metadata (name, slug, category, runtime, entrypoint), a set of **staged script
files** (`{path, content}`), an optional **config schema** of user-configurable
fields, saved **env defaults**, and a list of **requested capabilities**.

The admin curates applications in the panel and executes them through a
**one-shot Run** engine: the panel stages the script files onto a chosen target
(the panel host or a registered edge node, on the host filesystem or inside a
docker/lxd/kvm/multipass workload), runs the entrypoint once with a merged
environment, captures stdout/stderr/exit-code, and records everything in
`application_runs`.

Analogy anchors (important to avoid confusion):

| System | What it is | How it executes |
|---|---|---|
| **Applications** | Admin-curated bot/service catalog, admin-triggered one-shot runs | Script files staged to node/panel and executed once (`node/python3/sh -c`), result stored in `application_runs` |
| Templates + Instances | Minecraft-server style deploy flow (install engine, lifecycle) | Edge drivers create/manage long-running workloads |
| Mods | Goja-scripted panel plugins running inside the panel process | Mod engine eventbus |
| Stacks | Entire self-hosted web apps (sidecar supervisor, proxy) | Stack supervisor/proxy |

Migration `029` originally envisioned user-facing installs of applications
(`application_installations` table, `USE_APPLICATIONS` permission), but **no API
route, handler or repository for installations exists today** (see §14 gaps).
The current wired behavior is exactly: admin catalog + one-shot run.

### 1.1 Current status at a glance

| Area | Status |
|---|---|
| Catalog CRUD (`/api/applications`) | Wired (backend + SPA) |
| Upload manifest file / install from URL / Studio authoring | Wired |
| Per-capability grants + activation gate | Wired |
| One-shot run engine (panel/node, host/container/VM) | Wired |
| Run history (`application_runs`) + list UI | Wired |
| `application_installations`, `USE_APPLICATIONS` | Reserved in schema + permissions; **no routes/handlers** |
| Notifications on application events | Constant `NotificationCategoryApplication` exists; nothing emits it |
| AI assistant | Read-only knowledge topic `applications` (`panel/backend/internal/aiskills/applications.md`), no AI tools |

---

## 2. Source-of-truth file map

| Concern | Location |
|---|---|
| Backend CRUD/grants handler | `panel/backend/internal/api/handlers/application_handler.go` |
| Backend run engine handler | `panel/backend/internal/api/handlers/application_run.go` |
| Backend repository (all SQL) | `panel/backend/internal/repository/application_repo.go` |
| Models + wire constants | `panel/backend/internal/models/models.go` (`Application`, `ApplicationPermission`, `ApplicationRun`, status/target/mode/source constants) |
| Routes + permission gates | `panel/backend/internal/api/server.go` (`/api/applications` block starts line 618; `appsG` alias line 31) |
| Permission keys | `panel/backend/internal/permissions/keys.go` (`ManageApplicationsKey` L74, `ApplicationsOwnKey`/`ApplicationsAllKey` L287-288, group entry L404) |
| Ownership helper | `panel/backend/internal/permissions/engine.go` `HasScope` (L132) |
| Route gate helper | `panel/backend/internal/api/middleware.go` `requireUmbrellaOrAction` (L261) |
| Migrations (all three dialects) | `internal/db/migrations/{mysql,postgres,sqlite}/029_applications.sql`, `045_application_files_runs.sql`, `054_scope_ownership.sql`, `061_application_icon_color.sql` |
| Seed/backfill of keys and role grants | `panel/backend/internal/db/db.go` (~L2036, L2209, L2221) |
| Frontend feature | `panel/frontend/src/features/applications/` (`pages/`, `components/`, `api/`, `types/`) |
| Frontend routes | `panel/frontend/src/app/router.tsx` (lazy imports L64-70, routes L708-789) |
| Sidebar / header titles | `panel/frontend/src/shared/components/layout/Sidebar.tsx` L291; `Header.tsx` L107-114 |
| Frontend permission mirror | `panel/frontend/src/shared/types/permissions.ts` (L26, L332) |
| Edge exec surfaces | `edge/backend/internal/hostexec/handler.go`, `edge/backend/internal/execrpc/handler.go`, `edge/backend/internal/execstage/stage.go` |
| Edge route registration + body limits | `edge/backend/internal/cli/cli.go` (L267, L271, L442-472) |
| Panel edge client | `panel/backend/internal/edge/client.go` (`ExecRequest` L832, `ExecFile` L849, `HostExecRequest` L940) |
| AI skill doc | `panel/backend/internal/aiskills/applications.md` |

---

## 3. Data model

Dates are stored as UTC strings `YYYY-MM-DD HH:MM:SS` (parsed via
`parseSQLiteTime`). All three dialects (MySQL / PostgreSQL / SQLite) must stay
in sync; never edit a shipped migration.

### 3.1 `applications` (migration 029, +045 files, +054 owner_id, +061 color)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | |
| `name` | TEXT NOT NULL | required by API |
| `slug` | TEXT NOT NULL UNIQUE | validated by `models.ValidModSlug` (lowercase letters/digits/hyphens, max 64). **Immutable after create** |
| `category` | TEXT DEFAULT `'custom'` | free text server-side; SPA offers `discord/whatsapp/telegram/slack/custom` |
| `version` | TEXT DEFAULT `'1.0.0'` | |
| `description` | TEXT DEFAULT `''` | |
| `icon` | TEXT DEFAULT `''` | emoji or inline SVG; API caps at 16 KiB |
| `color` | TEXT DEFAULT `''` | `#rrggbb` accent; API validates `validNodeColorHex`, stores uppercased |
| `runtime` | TEXT DEFAULT `'nodejs'` | `nodejs` \| `python` \| `bash` \| `custom` — only validated at Run time |
| `entrypoint` | TEXT DEFAULT `''` | script path (relative) or full command for `custom` |
| `config_schema` | TEXT DEFAULT `'{}'` (legacy) | JSON **array** of field definitions; repository always writes `'[]'` when empty |
| `files` | TEXT DEFAULT `'[]'` (045) | JSON array `[{path, content}]` staged at Run |
| `env` | TEXT DEFAULT `'{}'` | saved env defaults, JSON object `{KEY: value}` |
| `permissions` | TEXT DEFAULT `'[]'` | JSON preview of requested capabilities (`[{capability, access_level}]`); canonical rows live in `application_permissions` |
| `active` | INTEGER DEFAULT 0 | 0/1; activation gated by grants |
| `uploaded_by` | INTEGER NULL → `users(id) ON DELETE SET NULL` | creator |
| `owner_id` | INTEGER NULL → `users(id) ON DELETE SET NULL` (054) | ownership scope column; backfilled at migration time |
| `source` | TEXT DEFAULT `'file'` | `file` \| `url` \| `studio` \| `json` |
| `source_url` | TEXT DEFAULT `''` | recorded for URL installs |
| `created_at` / `updated_at` | TEXT NOT NULL | |

Indexes/FKs: unique slug; FK on uploaded_by/owner_id; `applications_owner_idx`
(054). `application_permissions` and `application_runs` cascade on delete.

### 3.2 `application_permissions` (029)

| Column | Notes |
|---|---|
| `id` | PK |
| `application_id` | FK → applications ON DELETE CASCADE; index `idx_application_permissions_app` |
| `capability` | capability code; **no server-side whitelist** (activation is fail-closed: every row must be granted) |
| `access_level` | free string echoing the requested level (`listen`, `read_only`, `standard`, …) |
| `granted` | INTEGER 0/1; admin decision |

### 3.3 `application_runs` (045)

| Column | Notes |
|---|---|
| `id` | PK |
| `application_id` | FK → applications ON DELETE CASCADE; index `idx_application_runs_app` |
| `triggered_by` | FK → users ON DELETE SET NULL (NULL = system/no user) |
| `target` | `panel` \| `node` |
| `node_id` / `node_name` | executor actually resolved after insert (panel-target runs may route via a local node) |
| `exec_mode` | `host` \| `docker` \| `lxd` \| `kvm` \| `multipass` |
| `workload` | container/VM name; empty for host |
| `status` | `running` \| `succeeded` \| `failed` \| `error` |
| `exit_code` | INTEGER |
| `output` / `error_output` | captured streams, each truncated to 200 KiB (UTF-8 safe) |
| `error` | transport/staging/start error text (not script stderr) |
| `timeout_sec` | default 300 |
| `created_at` / `ended_at` | |

### 3.4 `application_installations` (029) — dormant

Columns: `id, application_id (CASCADE), owner_id (CASCADE), name, config_values,
status (running|stopped|error), last_error, node_id, created_at, updated_at`.
Model `models.ApplicationInstallation` and frontend type
`ApplicationInstallation` exist, but **no repository, handler, route, or UI
uses them**. Do not assume installs work.

### 3.5 Wire constants (`models/models.go` L233-259)

```
AppRunStatusRunning   = "running"
AppRunStatusSucceeded = "succeeded"   // script ran, exit 0
AppRunStatusFailed    = "failed"      // script ran, non-zero exit
AppRunStatusError     = "error"       // could not start (dial, staging, …)

AppRunTargetNode  = "node";  AppRunTargetPanel = "panel"
AppExecModeHost = "host"; AppExecModeDocker = "docker"; AppExecModeLXD = "lxd";
AppExecModeKVM = "kvm";  AppExecModeMultipass = "multipass"

ApplicationSourceFile="file"; …URL="url"; …Studio="studio"; …JSON="json"
```

---

## 4. Manifest contract (`.ksapp` / JSON)

The upload/URL/Studio pipelines all funnel into the same DTO
(`appUpsertDTO`, `application_handler.go` L195):

```json
{
  "name": "Discord Bot",              // required
  "slug": "discord-bot",              // required, ValidModSlug
  "category": "discord",
  "version": "1.0.0",
  "description": "…",
  "icon": "🤖",                        // ≤ 16 KiB
  "color": "#6366F1",                 // optional #rrggbb (stored uppercase)
  "runtime": "nodejs",                // nodejs|python|bash|custom
  "entrypoint": "src/bot.js",
  "config_schema": [                  // JSON ARRAY (not object)
    { "key": "BOT_TOKEN", "label": "Bot Token", "type": "secret", "required": true }
  ],
  "files": [ { "path": "src/bot.js", "content": "…" } ],
  "permissionsRequested": [ { "capability": "outbound_http", "access_level": "standard" } ]
}
```

Transport rules:

- `POST /api/applications/` with `Content-Type: application/json` reads the
  body as the manifest (cap 8 MiB reader; global middleware caps ~10 MiB).
- `multipart/form-data` expects a `manifest` file part (≤ 8 MiB) and an
  optional `spec` part; when `spec` is non-empty it **overrides
  `config_schema`**. Multipart always records `source = "file"`.
- Optional header `X-KS-Source: file|url|studio|json` tags the row (lowercased,
  whitelisted; anything else is ignored and the default `"json"` applies).
  **The current SPA never sends this header for applications** (unlike mods), so
  Studio/manual JSON creates are recorded as `source = "json"`; multipart
  uploads force `file`; URL installs force `url`.
- `POST /api/applications/url` with `{"url": "https://…"}` fetches the manifest
  server-side (SSRF-hardened, §9) and records `source = "url"` + `source_url`.

`config_schema` field definition (frontend type
`ApplicationConfigField`): `key, label, type ∈ {text,secret,number,select,textarea},
required?, default? (string|number), placeholder?, options? [{value,label}],
description?`. At Run time only `key` + `default` matter: defaults become env
values (strings; JSON numbers are stringified).

---

## 5. Backend API reference

All routes live in `server.go` (inside the authenticated group; **no
`ACCESS_ADMIN_PANEL` requirement** — the per-route application permissions are
the only gate). Every JSON route also passes the global middleware stack
(security headers, sanitize, validation, CSRF, dynamic body size).

| Method + path | Gate | Handler | Behavior |
|---|---|---|---|
| `GET /api/applications/` | VIEW | `ListApplicationsHandler` | Full catalog, `ORDER BY updated_at DESC`, each row enriched with `permission_rows` + `pending`, `owner_name` (join users); own-scope filtering (§6) |
| `POST /api/applications/` | CREATE | `CreateApplicationHandler` | JSON or multipart; validates name+slug, slug format, color hex, icon ≤16 KiB; inserts row `active=0` + permission rows `granted=0` in one TX; activity `create`; 201 + app |
| `POST /api/applications/url` | CREATE | `InstallApplicationFromURLHandler` | SSRF-guarded fetch then same parse/insert path; `source=url`, `source_url` stored; activity `create`. Errors: JSON `{"error": "…"}` with 400/413/415/502 status from `allowedURLError` |
| `GET /api/applications/{id}` | VIEW | `GetApplicationHandler` | 404 unknown; own-scope check → 403 |
| `PUT /api/applications/{id}` | EDIT | `UpdateApplicationHandler` | Updates name/category/version/description/icon/color/runtime/entrypoint/config_schema and optionally `files` (omitted/nil keeps existing files); **slug and permission requests are immutable**; activity `update` |
| `DELETE /api/applications/{id}` | DELETE | `DeleteApplicationHandler` | Own-scope check; cascades permissions + runs; activity `delete`; 204 |
| `PUT /api/applications/{id}/grants` | EDIT | `SetApplicationGrantsHandler` | Body `{"grants":[{"capability":"…","granted":true}]}`; flips matching rows (unknown caps silently ignored); activity `grant`; 204 |
| `POST /api/applications/{id}/activate` | EDIT | `ActivateApplicationHandler` | Refuses while any `granted=0` → **409** with `{error, message, pending, permissions[]}`; success sets `active=1`; activity `activate`; 204 |
| `POST /api/applications/{id}/deactivate` | EDIT | `DeactivateApplicationHandler` | Always allowed; activity `deactivate`; 204 |
| `POST /api/applications/{id}/env` | EDIT | `UpdateApplicationEnvHandler` | Body `{"env":{"KEY":"value"}}`; max 64 keys, each a POSIX identifier (`isAppEnvName`); replaces saved env blob; 204 |
| `POST /api/applications/{id}/run` | EDIT | `RunApplicationHandler` | Synchronous one-shot execution (§8); **requires `active=true`** else 409; returns completed run row |
| `GET /api/applications/{id}/runs?limit=N` | VIEW | `ListApplicationRunsHandler` | Newest first; limit clamped to 1..100 (default 25) |

Response shape for a catalog row (`appResponse`, `application_handler.go` L26):
`id, name, slug, category, version, description, icon, color, runtime,
entrypoint, config_schema, files, env, permissions, active, uploaded_by,
owner_name, source, source_url, permission_rows[{id, application_id,
capability, access_level, granted}], pending, created_at, updated_at`.

Error convention: most failures are plain-text `http.Error` bodies; the
activate conflict and URL-install failures are JSON. Status codes used: 400,
401, 403, 404, 405, 409, 413, 415, 500, 502.

### 5.1 Repository surface (`application_repo.go`)

`CreateApplication` (TX: insert + permission rows; defaults category/version/
runtime; `config_schema` → `[]`, `files` → `[]`), `UpdateApplication`,
`ListApplications` (joins users for `owner_name`), `GetApplication`,
`ListApplicationPermissions`, `SetApplicationGrants`,
`AllApplicationGrantsGranted`, `ActivateApplication` (returns sentinel
`ErrApplicationPermissionsNotGranted`), `DeactivateApplication`,
`DeleteApplication`, `UpdateApplicationEnv`, `CreateApplicationRun`,
`CompleteApplicationRun`, `ListApplicationRuns` (count-first +
`sql.Null*`-scan defence against the modernc sqlite phantom NULL row).

Note: the SELECTs read `uploaded_by` but **not** `owner_id`; `OwnerID` on the
model is only written by INSERT. See §6 and §14.

---

## 6. Permissions & ownership scopes

### 6.1 Keys (single source of truth `permissions/keys.go`; mirrored in
`panel/frontend/src/shared/types/permissions.ts`)

- Umbrella: `MANAGE_APPLICATIONS` — implies every action.
- Granular: `APPLICATIONS_VIEW`, `APPLICATIONS_CREATE`, `APPLICATIONS_EDIT`,
  `APPLICATIONS_DELETE`.
- Scopes: `APPLICATIONS_OWN`, `APPLICATIONS_ALL`.
- Reserved/dormant: `USE_APPLICATIONS` (seeded, never checked).

Routes gate with `requireUmbrellaOrAction(appsG, action)` — chi middleware that
passes when the user holds the umbrella or the specific verb key.

Seed state (`db.go`):
- `admin` role gets **every** permission (including applications).
- `moderator` gets `MANAGE_APPLICATIONS`, `APPLICATIONS_VIEW/CREATE/EDIT`,
  `USE_APPLICATIONS`.
- `user` gets `USE_APPLICATIONS` only.

### 6.2 Scope semantics (`HasScope`, `engine.go` L132)

`HasScope(uid, ownKey, allKey, umbrella)` returns `(hasOwn, hasAll)` where
`hasAll` is true when the user holds `APPLICATIONS_ALL` **or the umbrella**
(umbrella implies ALL). Neither key present → legacy fallback: treated as ALL.

Handler behavior:
- **List**: when the caller has OWN but not ALL, rows are filtered by
  `OwnerID`; otherwise full catalog.
- **Get/Update/Delete**: ownership resolved as `OwnerID`, falling back to
  `UploadedBy` when `OwnerID == 0`; if it doesn't match the caller and the
  caller has OWN without ALL → 403 (fail closed for orphans).
- **Grants/activate/deactivate/env/run**: EDIT-gated only, no per-row ownership
  check.

Known quirk: the list query never selects `owner_id`, so `OwnerID` is always 0
on read; for a role holding `APPLICATIONS_OWN` without ALL, the list filter
hides **all** rows (fail-closed empty list). Get/Update/Delete are unaffected
because they fall back to `uploaded_by`. No seeded role has this combination.

---

## 7. Lifecycle

```
create (file | url | studio/manual JSON)
  └─ active = 0, application_permissions rows granted = 0
       └─ admin reviews capabilities (PUT /grants, per-capability checkboxes)
            └─ POST /activate  → 409 until every row granted; then active = 1
                 └─ POST /run  (only when active)  → application_runs history row
                      └─ POST /deactivate  (always allowed, never blocks runs of history)
delete → cascades permission rows + run history
```

Every mutating step writes an activity entry via `RecordActivity` with
`models.ActivityCategoryMod` (category `"mod"`), actions: `create`, `update`,
`delete`, `grant`, `activate`, `deactivate`, `run`.

---

## 8. Run engine (deep dive)

Entry point: `POST /api/applications/{id}/run`, handler
`application_run.go:72`. Runs are **synchronous**: the HTTP response is the
completed run row. The frontend deliberately disables its Axios timeout
(`timeout: 0`) for this call; legal duration is bounded by `timeout_sec`.

### 8.1 Request DTO

```json
{
  "target": "panel",            // "node" | "panel" (required)
  "node_id": 3,                 // required when target=node
  "exec_mode": "host",          // host|docker|lxd|kvm|multipass
  "workload": "my-container",   // required for non-host modes
  "timeout_sec": 300,           // optional; default 300; clamp 5..1800 (panel)
  "env": { "BOT_TOKEN": "…" }   // optional per-run overrides; max 64 keys
}
```

Validation (400 otherwise): unknown target/mode, missing node_id for node
targets, missing workload for non-host modes, >64 env keys, timeout outside
5..1800. Application must exist (404) and be `active` (409).

### 8.2 Environment precedence (`buildAppRunPayload` L240)

1. `config_schema` defaults (strings; JSON numbers stringified; legacy empty
   object `{}` tolerated as "no fields", anything else not an array → 400).
2. Saved `env` blob (JSON object).
3. Per-run overrides from the request (secrets travel here; never logged).

Then: keys must be POSIX identifiers (`isAppEnvName`; same rule the edge
enforces), keys with blank/whitespace values are dropped, empty keys dropped.

### 8.3 Script files & command

`files` JSON `[{path, content}]` (nil/absent = none). Each path is `Clean`ed
and must be relative (no absolute, no `..` escape); ≤ 64 files; ≤ 1 MiB each;
≤ 4 MiB combined. The entrypoint must be present among the files for
`nodejs`/`python`/`bash`.

Command by runtime (entrypoint single-quote-escaped via `shellQuotePath`):

| runtime | command |
|---|---|
| `nodejs` | `node '<entrypoint>'` |
| `python` | `python3 '<entrypoint>'` |
| `bash` | `sh '<entrypoint>'` |
| `custom` | entrypoint used verbatim as the full command (must be non-empty) |

Unsupported runtime → 400 `unsupported runtime "…"`.

### 8.4 Target resolution

```
target=node  → load node + plaintext edge token (PlainToken)
               | mode=host       → edge POST /api/edge/host-exec   (HostExecRequest)
               | mode=docker|…   → edge POST /api/edge/exec-rpc    (ExecRequest kind=mode, name=workload)
               edge HTTP client timeout = timeout_sec + 15s

target=panel → find the first LOCAL node (lowest id; isLocalNode = connection_mode
               local_port|local_wss|local_both, else loopback-address fallback;
               reverse_tunnel excluded)
               | local node found → route exactly like target=node through it
               | none + mode=host → runOnPanelShell: stage files in a fresh
                 /tmp/ksapp-* dir (0755), run `/bin/sh -c cmd` with cwd = stage
                 and a MINIMAL env (PATH, HOME, TMPDIR + run env only) so the
                 panel process env never leaks into the script; timeout kill → exit 124
               | none + container/VM mode → error: needs `./kspanel setup:localnode`
```

`run.NodeID`/`run.NodeName` are updated after the insert when a panel-target
run resolves through a local node, so history records the real executor.

### 8.5 Edge execution (`hostexec` / `execrpc` / `execstage`)

Both edge endpoints are token-gated (constant-time compare), POST-only JSON.

- `host-exec`: body cap 8 MiB (edge `edgeBodyLimit`); command ≤ 64 KiB.
- `exec-rpc`: server body cap 8 MiB but the JSON decoder reads only **1 MiB**;
  kind must be a registered driver; workload name required.
- `execstage.Validate`: ≤ 64 files, ≤ 1 MiB each, ≤ 4 MiB total, paths relative
  and escape-checked (absolute/`..`/NUL rejected).
- `execstage.Script` renders one `/bin/sh` program: env exports (POSIX keys,
  single-quote escaped; `STAGE` reserved and never exported from env), staged
  files via quoted heredocs with a random marker (`mktemp -d`; `readonly STAGE`;
  cleanup on EXIT), `cd "$STAGE"`, then the command.
- Timeouts: edge default 5 min, hard clamp 30 min. Stdout/stderr drained
  concurrently to avoid pipe deadlock. Timeout → stderr note + exit 124
  (hostexec); execrpc surfaces the driver's exit code.
- Response envelope: `{ok, stdout, stderr, exit_code, error}`.

### 8.6 Result handling

- `runErr != nil` → `error`; else exit ≠ 0 → `failed`; else `succeeded`.
- stdout/stderr truncated to 200 KiB per stream (`appRunMaxOutputBytes`,
  UTF-8-safe backoff so DB TEXT columns never receive a broken sequence).
- `CompleteApplicationRun` writes status/exit/output/error/ended_at +
  resolved node; then activity `run` records target/mode/workload/status.
- No queueing, no cancellation, no sweeper: if the panel dies mid-run the row
  can remain `running` forever (no background reconciler exists).

### 8.7 Container workload picker (frontend)

`ApplicationRunModal` lists workload candidates from `/api/instances` filtered
by `kind === exec_mode` and either the chosen node id (target=node) or a
local-address node (target=panel).

---

## 9. SSRF-hardened URL install

`POST /api/applications/url` calls the shared `fetchManifestFromURL`
(`mod_handler.go` L429, reused from the mods path):

1. URL must be http/https with a host.
2. DNS resolved up-front (5 s budget, Go resolver).
3. Every resolved IP must be public (`isPublicIP` rejects loopback, private,
   link-local, multicast, unspecified, IPv4/IPv6).
4. Transport dials the pre-resolved IPs directly (DNS-rebinding pinned),
   15 s timeouts for dial/TLS/headers/body.
5. Response body ≤ 64 MiB (`modURLFetchMaxBytes` = `modPackageMaxBytes`);
   non-2xx → 502; content type must be JSON/text/octet-stream/zip.
6. Body is JSON-unmarshalled into the same `appUpsertDTO` and validated exactly
   like an upload (name/slug/color/icon), then inserted with `source=url` and
   `source_url` recorded.

---

## 10. Validation & limits reference

| Item | Limit | Enforced at |
|---|---|---|
| name, slug | required | create |
| slug format | `^[a-z0-9-]{1,64}$` via `ValidModSlug` | create |
| color | `#rrggbb` (uppercased) | create/update/env? (create, update) |
| icon | ≤ 16 KiB | create/update |
| JSON body (direct create/update) | reader 8 MiB (middleware ~10 MiB) | handler/middleware |
| multipart manifest | ≤ 8 MiB | handler |
| URL fetch body | ≤ 64 MiB, 15 s transports, DNS-pinned public IPs | fetch helper |
| env keys (saved + per-run) | ≤ 64, POSIX identifiers | env endpoint + run |
| script files | ≤ 64, ≤ 1 MiB each, ≤ 4 MiB total, relative safe paths | run build (panel) + execstage (edge) |
| run timeout | 5..1800 s panel (default 300); edge clamps ≤ 30 min | run endpoint + edge |
| run output persisted | 200 KiB per stream | handler |
| runs list limit | 1..100 (default 25) | handler/repository |
| host-exec body | 8 MiB; command ≤ 64 KiB | edge |
| exec-rpc body | decoder reads ≤ 1 MiB | edge |

---

## 11. Frontend

### 11.1 Routes (`router.tsx`) — all `RequireAuth` + `RequirePermission(MANAGE_APPLICATIONS)`

| Path | Page |
|---|---|
| `/applications` | `Applications.tsx` (catalog) |
| `/applications/studio` | `ApplicationStudio.tsx` |
| `/applications/new` | `ApplicationEdit.tsx` (create) |
| `/applications/:id/edit` | `ApplicationEdit.tsx` (edit) |
| `/applications/:id/configure` | `ApplicationConfigure.tsx` |
| `/applications/stats` | `ApplicationStats.tsx` |
| `/applications/schedules` | `ApplicationSchedules.tsx` |
| `/application/:id` (singular!) | `ApplicationDetail.tsx` |

Sidebar entry: `Sidebar.tsx` L291 (`Extensions` group, permission
`MANAGE_APPLICATIONS`). Header crumbs: `Header.tsx` L107-114.

### 11.2 Pages & components

| File | Role / behavior |
|---|---|
| `pages/Applications.tsx` (793 L) | Card grid catalog: search (name/slug/description), state + category filters, localStorage page size (`ks.applications.pageSize`), stats chips. Per-card menu: Run…, Edit info, Configure fields, Activate/Deactivate, Delete. **Upload/Install modal** with three tabs: Upload file (`.json`/`.ksapp`, client-side JSON preview + permission list), From URL (server-side fetch), Studio (link to Studio). **Grant modal**: per-capability checkboxes (`Approve all`, `Save permissions`, `Save & Activate`), handles 409 conflict body. **Run modal** mounted here. Activation from card when `pending > 0` opens the grant modal instead. |
| `pages/ApplicationDetail.tsx` | `/application/:id` summary: header (icon/color/version/active/pending), details card, capability list (first 5), timeline with owner, recent runs (10), delete. |
| `pages/ApplicationEdit.tsx` | Create/edit form: name, slug (auto-slugified), category select, version, description, IconColorPicker + emoji icon, runtime select, entrypoint, requested-permission checkboxes (create intent), raw JSON `config_schema` textarea (parsed on submit, must be an array). Update call excludes slug; permissions cannot be changed via update. Form history undo/redo pill. |
| `pages/ApplicationConfigure.tsx` | Visual `config_schema` field editor (add/remove/reorder; key, label, type text/secret/number/select/textarea, default, placeholder, description, options `value|Label` lines, required). Saves via `updateApplication` passing unchanged meta (+ existing files kept by omission). |
| `pages/ApplicationStudio.tsx` (977 L) | Draft builder + presets (`applicationStudioPresets.ts`: blank, Discord Bot, Python Service, Bash Tool, Capability Sampler). Tabs: General / Permissions / Configure / Scripts / Raw JSON. Raw JSON buffers sync both ways; live manifest preview; client validation; Install = `createApplication(payload)` then `updateApplicationEnv(id, env)` if env non-empty. URL quick-install bar. |
| `pages/ApplicationStats.tsx` | Stat cards only: total, active, pending grants, total permissions (with search/status/category filters). |
| `pages/ApplicationSchedules.tsx` | Read-only aggregation of recent runs across up to 20 apps × 10 runs; table with trigger info; **there is no scheduler in the backend** — "system" rows are just runs with `triggered_by == null`. |
| `components/ApplicationRunModal.tsx` | Where-to-run dialog: target picker (Panel Host label shows "via local node" vs "direct shell"; any registered node), exec-mode picker, workload picker from instances, timeout (5–1800), env inputs generated from `config_schema` prefilled with saved env + defaults, required-field enforcement, result panel (status/exit/target/streams) + recent runs list. |
| `types/application.ts` | Types + metadata: `APPLICATION_CAPABILITIES` (network `listen|connect`, filesystem `read_only|read_write`, outbound_http `standard|unrestricted`, process_control `spawn|full`), `APPLICATION_CATEGORIES`, `APPLICATION_RUNTIMES`, draft + `emitStudioPayload`, `slugifyApp`, capability/category/runtime meta lookups. |
| `api/applications.ts` | Axios client: `listApplications`, `getApplication`, `createApplication`, `uploadApplicationFile(manifest, spec?)`, `updateApplication` (narrowed fields + optional files), `installApplicationFromUrl`, `deleteApplication`, `setApplicationGrants`, `activateApplication` (returns 409 conflict object instead of throwing), `deactivateApplication`, `updateApplicationEnv`, `runApplication` (`timeout: 0`), `listApplicationRuns`. |

Frontend capability/category/access-level catalogs are presentation metadata;
the backend does not constrain capability strings. Unknown capabilities still
require explicit admin grants before activation (fail closed).

---

## 12. Cross-part integration

- **Edge**: run traffic uses the panel `internal/edge` client
  (`HostExec`/`Exec`) → edge `/api/edge/host-exec` or `/api/edge/exec-rpc`.
  Tunnels/WSS are handled by the client transparently (local/reverse modes).
- **Nodes/instances**: runs need a registered node (and its token); the
  workload picker reads instances. `setup:localnode` provisions the localhost
  edge used for panel-target container/VM runs.
- **Activity feed**: all application mutations/runs are recorded under the
  shared `mod` activity category.
- **Notifications**: `NotificationCategoryApplication` exists in the model but
  no application code path creates notifications.
- **AI assistant**: `aiskills/index.md` lists topic `applications`;
  `aiskills/applications.md` is a read-only summary. There are no AI tools for
  applications; the assistant must not claim to install/configure/run them.
- **API keys / sessions / CSRF**: standard global middleware applies; no
  special application-scoped API-key tokens exist.

---

## 13. Security notes

- Fail-closed validation on create: slug (route key), color (CSS injection),
  icon size, script path escapes, env identifiers.
- Activation is fail-closed: cannot flip `active` while any grant is pending.
- Runs are EDIT-gated (arbitrary code execution by design — treat
  `APPLICATIONS_EDIT` as code-execution capability).
- URL installs are SSRF-hardened (public IPs only, DNS-pinned, time/size caps).
- Edge RPCs are token-gated with constant-time comparison; edge is the trust
  boundary and re-validates files/env.
- Panel-host fallback executes with a minimal environment; the panel's own env
  (possibly containing secrets) is never inherited.
- Secrets flow only through request bodies/env; they are not logged (activity
  messages never include env values) and `output` capture is truncation-safe.
- SQL is parameterized throughout the repository.

---

## 14. Known gaps, quirks & honest limitations

1. **Installations are dormant**: `application_installations`, the
   `ApplicationInstallation` model/type, and the `USE_APPLICATIONS` permission
   have no routes, repository, or UI. The seeded moderator/user grants are
   inert today.
2. **Own-scope list filtering is effectively fail-closed**: repository reads
   never select `owner_id` (only `uploaded_by`), while the list filter uses
   `OwnerID`. A role with `APPLICATIONS_OWN` without ALL/umbrella sees an empty
   catalog. Get/Update/Delete work because they fall back to `uploaded_by`.
3. **`source = "studio"` is never recorded by the current SPA** for
   applications: `api/applications.ts` does not send `X-KS-Source` (mods do).
   Studio and manual JSON installs therefore store `source = "json"`.
4. **No server-side capability whitelist**: manifests may request arbitrary
   capability strings; the frontend constrains the UI, and activation remains
   fail-closed because every row needs an explicit admin grant.
5. **Runtime is validated at Run time, not at create/update**; invalid runtimes
   surface when someone presses Run.
6. **exec-rpc payload mismatch**: the panel allows 4 MiB combined script
   payloads, but the edge exec-rpc JSON decoder reads only 1 MiB, so large
   file sets fail for docker/lxd/kvm/multipass runs while host runs succeed
   (host-exec reads 8 MiB).
7. **Unused constants**: `appURLFetchMaxBytes/Timeout/DNSTimeout`
   (`application_handler.go` L20-24) are declared but unused; the URL fetch
   uses the shared mod constants.
8. **No run scheduler/queue/sweeper/cancel**: runs are synchronous; a panel
   crash mid-run can strand a `running` row. `ApplicationSchedules.tsx` is a
   history view, not a scheduler.
9. **Legacy `config_schema = {}` rows**: tolerated by the run engine as "no
   fields"; any other non-array value fails runs with a 400.
10. **Delete cascades run history** (FK CASCADE) — deleting an app erases its
    execution audit trail.
11. **`spec` multipart part silently overrides `config_schema`** without
    validating that it is an array at upload time (it will surface at Run time).

---

## 15. AI navigation recipes

- Need an endpoint? Start at `server.go` L618, then read the named handler.
- Need SQL? All of it is in `application_repo.go`.
- Need run semantics? `application_run.go` (handler + payload + target
  resolution) then `edge/backend/internal/{hostexec,execrpc,execstage}`.
- Need UI behavior? `panel/frontend/src/features/applications/pages/<page>.tsx`
  and `components/ApplicationRunModal.tsx`; metadata in `types/application.ts`.
- Changing wire fields? Update in this order: migration (new, tri-dialect) →
  models → repository → handlers → frontend types/api → pages. Verify with
  `go build ./... && go test ./...` (panel + edge) and
  `npm run build && npm run typecheck && npm run lint` (frontend), then
  `bash rebuild.sh`.

## 16. Verification commands

```bash
# panel backend
(cd panel/backend && go build ./... && go test ./...)
# edge backend
(cd edge/backend && go build ./... && go test ./...)
# frontend
(cd panel/frontend && npm run build && npm run typecheck && npm run lint)
# final gate (repo root)
bash rebuild.sh
```

There are no dedicated application unit tests today; application coverage is
exercised through the generic handler/repository test suites and runtime
verification of the panel.
