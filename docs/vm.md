# VM & Instance Management — Current Panel (2026-09-01)

> **Scope:** The live panel as it ships today (`panel/frontend/src` + VM-relevant backend/edge glue). Replaces stale drafts — every claim below is pinned to a real file/line. If a line reference no longer resolves, the doc is stale.
>
> **Verified against:** `panel/frontend/src/app/router.tsx` · `panel/frontend/src/app/App.tsx` · `panel/frontend/src/shared/components/layout/Layout.tsx:7` · `panel/frontend/src/shared/components/layout/Sidebar.tsx:15` · `panel/frontend/src/shared/types/permissions.ts:1` · `panel/frontend/src/features/instances/pages/Instances.tsx:59` · `panel/frontend/src/features/instances/pages/InstanceDetail.tsx:95` · `panel/frontend/src/features/instances/pages/InstanceForm.tsx:23` · `panel/frontend/src/features/nodes/pages/Nodes.tsx:32` · `panel/frontend/src/features/nodes/pages/NodeDetail.tsx:60` · `panel/frontend/src/features/templates/pages/Templates.tsx:63` · `panel/frontend/src/features/templates/types/templateForm.ts:5` · `panel/frontend/src/shared/types/instance.ts:5` · `panel/frontend/src/shared/components/ui/CustomPageView.tsx:11` · `panel/frontend/src/shared/lib/customPageSdk.ts:216` · `edge/backend/internal/drivers/kvm.go`
>
> **Stack (from `panel/frontend/package.json:1`):** React `18.3.1` + React Router `6.30.6` + Zustand `4.5.7` + Vite `5.4.21` + Tailwind `3.4.19` + Xterm `6.0.0` + Axios `1.19.0`. Typecheck `tsc --noEmit` (`5.9.3`). Build `vite build` → `panel/backend/internal/ui/dist` embedded by `panel/backend/internal/ui/embed.go`.

---

## 1) What "VM" Means in KS Panel

KS Panel is not a Minecraft-only panel. **Instances** are the generic workload abstraction; the `kind` field (`panel/frontend/src/shared/types/instance.ts:5`, `panel/frontend/src/features/templates/types/templateForm.ts:5`) selects the driver that actually spawns the workload on the edge host:

| `kind` | Driver | What runs on the edge | Typical image |
|---|---|---|---|
| `docker` | Docker (`edge/backend/internal/drivers/docker.go`) | Container (`docker run`) | any OCI image |
| `lxd` | LXD (`edge/backend/internal/drivers/lxd.go`) | System container / light VM | `images:ubuntu/22.04` |
| `kvm` | KVM/QEMU (`edge/backend/internal/drivers/kvm.go`) | Full virtual machine | `ubuntu-22.04.qcow2` or ISO |
| `multipass` | Multipass (`edge/backend/internal/drivers/multipass.go`) | Ubuntu VM (cloud-init) | `22.04`, `20.04` |

The **frontend does not special-case Minecraft**. Game servers, raw VMs, system containers and custom apps are all instances; the difference is the template's `spec` (image, limits, env, install steps, actions) and the node's advertised drivers.

```
Panel (Go + TS/React)  ──deployInstance──▶  Edge (ksedge)  ──driver──▶  Docker / LXD / KVM / Multipass
        │                                   │  ├─ exec/handler.go, hostexec/handler.go, pageaction/handler.go, install/engine.go
        │                                   │  └─ heartbeat/heartbeat.go (push to panel)
        └─ InstanceDetail / Terminal ──WS───┘  └─ drivers/helpers.go + inspect_helpers.go
```

---

## 2) Frontend Architecture (where VM code lives)

```
panel/frontend/src/
├── app/
│   ├── App.tsx                        # Bootstrap: theme reapply, panel brand, /api/me session restore, InstanceNavProvider
│   └── router.tsx                     # 55+ routes, every route wrapped in RequireAuth + RequirePermission
├── shared/
│   ├── components/layout/
│   │   ├── Layout.tsx:7               # Flex shell: ThemedBackground + Sidebar + Header + <Outlet/>
│   │   ├── Sidebar.tsx:15             # Single serial nav (adminSubItems), permission-aware, collapsible
│   │   ├── Header.tsx                 # Bell, search, instance-nav, mobile toggle
│   │   ├── InstanceNavContext.tsx     # Syncs instance.config snapshot into the global sidebar
│   │   └── RouteThemeSync.tsx         # Re-applies theme per pathname
│   ├── types/permissions.ts:1         # PermissionKey + PERMISSION_AREAS (OWN/ALL, granular VIEW/CREATE/EDIT/DELETE)
│   ├── types/instance.ts:5            # Instance + Template + DeployRequest wire types (mirror Go models)
│   ├── api/client.ts + admin.ts       # Axios client (CSRF, session cookie) + all admin/instance/node/template/theme/mod/app APIs
│   ├── stores/authStore.ts            # user + permissions + initialized
│   └── utils/instancePages.ts:104     # resolveInstanceNav / isPageAllowed / getPageContent / findSpecPageRow
└── features/
    ├── instances/                     # VM fleet + per-VM panel
    ├── nodes/                         # Hosts + drivers + health
    ├── templates/                     # Blueprints that define a VM/container
    ├── instance-pages/                # Custom HTML/MD/Blocks pages injected into the instance panel
    ├── system/ | security/ | activity/ | database/ | themes/ | mods/ | applications/ | tickets/ | users/ | roles/
    └── auth/                          # Login / Register / VerifyEmail + me/meAuth
```

Build output goes to `panel/backend/internal/ui/dist` (`index.html` + `assets/index-*.js|css` + `xterm-*.js|css`) and is embedded by the Go server at startup (`internal/dist`, `internal/ui/embed.go`). The bootstrap script in `internal/api/bootstrap.go` splices `panel_name / panel_logo / footer_text / activeTheme` into `index.html` at request time.

---

## 3) Routing (full table, as shipped)

All routes live under `<Layout/>` except `/auth/*`. Every page inside Layout is additionally gated by `<RequireAuth>` + `<RequirePermission permission={Key}>` (`panel/frontend/src/app/router.tsx:1`, `panel/frontend/src/shared/components/ui/RequireAuth.tsx`, `RequirePermission.tsx`). The pattern is **umbrella-or-granular**: `hasAreaAccess` (`permissions.ts:408`) admits `MANAGE_*` or any `*_VIEW/*_CREATE/*_EDIT/*_DELETE` or `*_OWN/*_ALL` of that area.

| Path | File | Perm | Notes |
|---|---|---|---|
| `/auth/login`, `/auth/register`, `/auth/verify-email` | `features/auth/pages/*` | public | `Login.tsx`, `Register.tsx`, `VerifyEmail.tsx` |
| `/instances` | `features/instances/pages/Instances.tsx:59` | `MANAGE_INSTANCES` (or any `INSTANCES_*` / `VIEW_INSTANCES`) | **Unified list** — fleet via `listInstances()` when privileged (`MANAGE_INSTANCES` ‖ `INSTANCES_ALL`), else `listMyInstances()` (own-only). Search (name/template/node/owner/external_id), driver filter (all/docker/lxd/kvm/multipass), status filter (`running/stopped/creating/installing/errored/install_failed/destroyed/suspended/attention`), suspend/unsuspend, stats link |
| `/instances/stats` | `features/instances/pages/InstanceStats.tsx` | `MANAGE_INSTANCES` | Fleet aggregates, status breakdown |
| `/instances/new` → `advanced` | `features/instances/pages/InstanceForm.tsx:23` + `AdvanceOptionPage.tsx` / `DeployFormShell.tsx` + `deployFormStore.tsx` | `MANAGE_INSTANCES` (`CREATE`) | General (name/display_name/icon/color/owner/template/node) → driver mismatch warning (`driverEnabled`) → env vars → **Advance Option** overlay (full spec override) |
| `/instance/:id/edit` | `features/instances/pages/InstanceEditAdvanced.tsx` + `InstanceAdvancedOptionsFullScreen.tsx:336` | `MANAGE_INSTANCES` (`EDIT`) | Per-instance overrides (env/install/runtime/labels/healthcheck/pages) diffed via `buildOverrides` (`utils/instanceFormUtils.ts:416`), snapshotted into `instance.config` |
| `/instances/:id/*` | `features/instances/pages/InstanceDetail.tsx:24` | `VIEW_INSTANCES` (umbrella) | **Instance panel shell** `InstancePanel` syncs `parseConfig(instance.config)` into `InstanceNavContext` (`useInstanceNavSync`). Child `InstanceDynamicPage:95` resolves `wildcard` → `effectiveSlug = wildcard\|\|'.'` → `isPageAllowed` else "not part of template" → special-case `terminal` → `getPageContent` → `CustomPageView` |
| `/nodes` | `features/nodes/pages/Nodes.tsx:32` | `MANAGE_NODES` | Card grid, heartbeat 24h sparkline, driver ring, health checks, token rotate/purge |
| `/nodes/stats` | `features/nodes/pages/NodeStats.tsx` | `MANAGE_NODES` | By-kind, TLS/region, uptime aggregates |
| `/nodes/new`, `/nodes/:id/edit`, `/node/:id` | `features/nodes/pages/NodeForm.tsx`, `NodeDetail.tsx:60` | `MANAGE_NODES` | CRUD, probe/recheck, allocate, country/category/location, drivers toggle |
| `/templates` | `features/templates/pages/Templates.tsx:63` | `MANAGE_TEMPLATES` | Card grid, KIND_META badges, spec summary (limits/ports/env/install/mounts), upload-file / from-URL / create tabs |
| `/templates/stats` | `features/templates/pages/TemplateStats.tsx` | `MANAGE_TEMPLATES` | By-kind counts, age |
| `/templates/new`, `/templates/:id/edit`, `/template/:id` | `features/templates/pages/TemplateForm.tsx`, `TemplateDetail.tsx` | `MANAGE_TEMPLATES` | 10-tab builder (see §7) |
| `/system` | `features/system/pages/System.tsx` | `ACCESS_ADMIN_PANEL` | Host telemetry, tiles + `useUpdateInfo` (check/apply/reinstall) |
| `/security` | `features/security/pages/Security.tsx` + `components/Authentication|Authority|DDoS|Firewall|Sessions.tsx` | `ACCESS_ADMIN_PANEL` | RPS, top IPs, blocked, errors, bandwidth, login attempts, lockout policy, sessions revoke |
| `/activity` | `features/activity/pages/Activity.tsx` + `components/ActivityCards.tsx` | `ACCESS_ADMIN_PANEL` | Global feed (own rows when not admin) |
| `/database` | `features/database/pages/Database.tsx` | `ACCESS_ADMIN_PANEL` | Engine switcher (SQLite/PG/MySQL), live inspector |
| `/users`, `/users/new`, `/users/:id/edit`, `/user/:id`, `/users/stats` | `features/users/pages/*` | `MANAGE_USERS` | CRUD, search, role badge, suspension |
| `/roles`, `/roles/new`, `/roles/:id/edit`, `/roles/stats` | `features/roles/pages/*` | `MANAGE_ROLES` | Permissions block driven from `PERMISSION_AREAS` |
| `/settings` | `features/settings/pages/Settings.tsx` | `VIEW_SETTINGS` | Brand, footer, region |
| `/api-keys`, `/api-keys/new`, `/api-keys/:id/edit`, `/api-key/:id`, `/api-keys/stats` | `features/api-keys/pages/*` | `MANAGE_API_KEYS` | Keys + scopes |
| `/mods`, `/mods/studio`, `/mods/stats` | `features/mods/pages/*` | `MANAGE_MODS` | Mod engine v2 (Goja, .kspm), slot/event bus |
| `/applications`, `/applications/:id/edit`, `/applications/:id/configure`, `/applications/stats` | `features/applications/pages/*` | `MANAGE_APPLICATIONS` | Curated templates + run modal (node/panel-host, env) |
| `/instance-pages`, `/instance-pages/studio`, `/instance-pages/:id`, `/instance-pages/:id/studio`, `/instance-pages/stats` | `features/instance-pages/pages/*` | `MANAGE_INSTANCE_PAGES` | Library CRUD + Studio (see §9) |
| `/themes`, `/themes/studio`, `/themes/stats` | `features/themes/pages/*` | `MANAGE_THEMES` (any theme sub-cap also admits) | Studio (Accent/Background/Button/Cards/CustomCSS/Dropdowns/Forms/Header/Loading/Shape/Sidebar/Typography/Utilities) |
| `/tickets`, `/tickets/stats`, `/tickets/new`, `/tickets/:id`, `/tickets/:id/edit`, `/tickets/:id/chat` | `features/tickets/pages/*` | `MANAGE_TICKETS` | Area-aware (TICKETS_VIEW admits) |
| `/notifications`, `/notifications/stats`, `/notifications/broadcast` | `features/notifications/pages/*` | `MANAGE_NOTIFICATIONS` | Inbox + broadcast |
| `/account` | `features/account/pages/Account.tsx` | `VIEW_ACCOUNT` | Banner/about/accent/avatar, per-field permission |
| `*` | `router.tsx` catch-all | — | `→ /instances` (if auth) else `/auth/login` |

Sidebar (`Sidebar.tsx:232` `adminSubItems`) renders **one flat list** (no dropdown) in this exact order: System → Tickets → Notifications → Security → Activity → Database → Users → Roles → Settings → API Keys → Nodes → Templates → Instance Pages → Mods → Applications → Themes → All Instances. Each entry is filtered by `hasSidebarAccess` (`Sidebar.tsx:265`) which checks umbrella → area extra keys → `VIEW_INSTANCES` / `MANAGE_THEMES` shortcuts. When `initialized===false` it shows `SidebarSkeleton` (`SidebarSkeleton.tsx`).

Layout (`Layout.tsx:7`) detects `inInstancePanel = /^\/instances\/\d+/` to swap `Header` controls, collapses at `md` breakpoint, off-canvas overlay below `md`, collapsible width via `collapsed` prop (`w-64` ↔ `w-16`).

---

## 4) Instances — Fleet View (`features/instances/pages/Instances.tsx:59`)

**Single-file permission branching** (replaced former `Instances` + `AdminInstances`):
- `isPrivileged = permissions.includes(MANAGE_INSTANCES) || INSTANCES_ALL` → `listInstances()` (fleet) else `listMyInstances()` (own-only). Mirrors `ListInstancesHandler` scope.
- `canCreate = hasAreaAccess(CREATE)`, `canEdit = hasAreaAccess(EDIT)`, `canDelete = hasAreaAccess(DELETE)`, `canControl = isPrivileged || canEdit`, `canSuspend = isPrivileged`.

**Card** (`features/instances/components/InstanceCard.tsx`): glass card, status dot (color per `status`), `started_at` uptime, node/template/owner chips, suspend banner (`suspended===1`), actions via `CardAction[]` (`actionsFor` `Instances.tsx:192`): Edit (EDIT), Start/Stop/Restart (canControl), Destroy (DELETE, confirm), Suspend (prompt reason, `duration_hours`), Unsuspend (confirm). Owner badge & suspend chip only when `showOwner = isPrivileged`.

**Filters**: text search on `name/template_name/node_name/owner_name/external_id`, `kindFilter` (`all|docker|lxd|kvm|multipass`), `statusFilter` (`all|running|stopped|creating|installing|errored|install_failed|destroyed|attention|suspended`). "Attention" = `errored/install_failed/creating/installing` (`ATTENTION_STATES`). Clear button resets all.

**Stats**: counts per status + `suspended`.

---

## 5) Deploy & Edit — How a VM Gets Created

**Deploy entry** (`features/instances/pages/InstanceForm.tsx:23`, `stores/DeployFormShell.tsx`, `stores/deployFormStore.tsx`, `utils/instanceFormUtils.ts`, `types/instanceForm.ts`):

1. `InstanceForm` mounts → `Promise.all([listNodes(), listTemplates(), listUsers(), listRoles()])` (`InstanceForm.tsx:47`), defaults `ownerId = users[0].id`.
2. Owner picker: searchable dropdown with role badge color, avatar symbol, keywords (`username email badge`) (`InstanceForm.tsx:72`).
3. Template picker: card grid (`InstanceFormComponents.tsx:KindIcon|TemplateCard`), `selectedTemplate = templates.find(id===templateId)`.
4. Node picker: card grid (`NodeCard`), `incompatibleKind` computed from `driverEnabled(node, kindKey(template.kind))` (`types/instanceForm.ts`, `utils/nodesUtils.ts:driverEnabled`). Warning banner when selected node doesn't advertise the driver (`InstanceForm.tsx:234`).
5. Identity: `name` (required), `displayName`, `icon` (preset SVG strip + custom SVG input, `ICON_PRESETS`), `color` (`COLOR_SWATCHES` + color input).
6. Env: when `selectedTemplate && editor.env.length>0`, renders per-variable controls for `text/number/select/checkbox`, `rule` regex hint, `required` marker, `display`/`options` handling (`InstanceForm.tsx:405`).
7. **Advance Option** button → `navigate('/instances/new/advanced')` (`AdvanceOptionPage.tsx`, `InstanceAdvancedOptionsFullScreen.tsx:336`): full `PageOverride[]` editor (environment, install spec, `advanced` per-driver runtimes, labels & devices, healthcheck, pages). State diffed via `buildOverrides(editor, baseline)` → `overrides: Record<string,unknown>`.
8. Submit (`InstanceForm.tsx:117`): validates `name/owner/template/node`, re-checks driver, coalesces `envVarPayload` (only non-empty/non-default, respecting `required/user_editable`), builds `DeployRequest` (`shared/types/instance.ts:87`: `name,display_name,icon,color,owner_id,template_id,node_id,overrides,env_vars`) → `deployInstance(payload)` → `navigate(created.id ? /instances/{id} : /instances)`. New instance boots in `creating` → edge install workflow → `installing` → `running` (or `install_failed` / `errored`). The home page shows the live install transcript while `install_state==='running'`.

**Edit** (`features/instances/pages/InstanceEditAdvanced.tsx`, `InstanceAdvancedOptionsFullScreen.tsx`): loads current `instance.config`, merges overrides, re-uses the same store/utils, calls `UpdateInstance` (panel) → snapshot updated. File reference for overrides flow: `utils/instanceFormUtils.ts:240` `serializeEditor` / `113` `parseConfig`.

---

## 6) Nodes — Where VMs Run (`features/nodes/pages/Nodes.tsx:32`, `NodeDetail.tsx:60`)

**Model** (`features/nodes/types/node.ts`, `shared/types/node.ts`): `id, name, address, use_tls, skip_tls_verify, state/status, health_enabled/interval/timeout/retries, probe_reachable/checked_at/seen_name/fail_count/next_probe_at, last_seen_at, uptime_secs/pct, ram_used/total, cpu_percent, disk_used/total, driver flags (driver_docker/kvm/lxd/multipass), location_country/country/node, category, icon/color, allowed_kinds, alloc_mem/disk, overcommit, install_dir/instances_dir, token_prefix, hw_*_ok, connection_mode`.

**Nodes list** (`Nodes.tsx:32`): loads `listNodes()` + `nodeHeartbeats(n.id, MONITOR_BARS)` per node (`NODES` → heartbeat map). Card shows: icon/HeartbeatIcon, name + site label `{location_node}`, `https|http://address`, country flag + category + LTS badge, driver ring (`DriverRing`, 4 arcs colored per driver), RAM/CPU/DISK pills (`formatPercent`, `ResourceBar`), 24h uptime sparkline (`buildMonitor(n,hbMap)` → `upPctDisplay`), footer health_off chip. Filters: text (name/address/category/country/node/notes), state (`all/up/down/pending/partial` via `resolveState`), TLS. Actions per node via `CardMenu`: rotate token (returns token + `config.json` via `buildEdgeConfig` — download/copy), probe single/all (`probeNode/probeAllNodes`), purge local (`purgeLocalNode` — stops daemon, deletes binary/config/logs), delete.

**Node detail** (`NodeDetail.tsx:60`): header with back + CardMenu (Edit/Probe/Copy address/host/Rotate/Purge/Delete), stat card with gauges (`Gauge` from `SystemCharts`), resource usage (GB), uptime 24h bar, connectivity block (mode resolved from `connection_mode` else `address==='tunnel' ? reverse_tunnel : local_port/direct`; `hostUrl` = `WSS tunnel` vs `https://address`), allocation & placement (category/country/site, icon, allowed_kinds, alloc + overcommit, dirs, token prefix), timeline (created/last_seen/uptime). `useConfirm` everywhere — no `window.confirm`.

**Connection modes** (`NodeDetail.tsx:253`): `direct`, `reverse_tunnel` (edge dials panel via WSS, `address==='tunnel'`), `local_port`/`local_wss` (`127.0.0.1:` or `localhost:`). TLS via `use_tls`; `skip_tls_verify` for self-signed.

---

## 7) Templates — Blueprints (`features/templates/pages/Templates.tsx:63`, `components/TemplateForm/*`, `types/templateForm.ts:248`, `utils/templateFormUtils.ts`)

**List** (`Templates.tsx:63`): `KIND_META` badges (Docker sky, LXD indigo, KVM orange, Multipass fuchsia), enriched view model per `parseSpec(spec)` (limits/ports/env/install/mounts/category/type/mem/cpu/disk, updated/created timestamps). Filters: text (name/description/image/category/type), kind, category; sort (updated/newest/name/kind). Install modal with 3 tabs: **Upload file** (`multipart manifest` → `POST /api/templates/`), **From URL** (`POST /api/templates/url`, SSRF-guarded server-side fetch, DNS-pinned, size/time capped), **Create** (jump to `/templates/new`). Each card shows image mono line, RAM/CPU/DISK row, footer updated date → detail link.

**Form types** (`types/templateForm.ts:248` `TemplateFormState`): `id,name,category,type,description,kind,image,ports(Mapping host/guest/tcp|udp),mounts(source/target/rw|ro),limits(ram_mb/cpu_pct/disk_mb/swap_mb),caps(databases/backups/networks),env(EnvVariable[] name/label/desc/default/user_viewable/editable/required/rule/display(text|number|select|checkbox)/options...),install(InstallStep[] action shell|download|extract|move|write|chmod|mkdir|git_clone|pip_install|npm_install|http_check + command/url/filename/archive/dest/from/to/path/content/branch/retries/ignore_errors),install_timeout_s,actions(TemplateAction[] id/name/description/allowed_states/requires_online/async_run/run_on_create/cooldown_s/user_invokable/session long_running|console_session|vm_full /auto_start/ auto_stop.../allowed/blocked_commands/max_runtime/stop_command... + steps),labels(Device/Label),healthcheck(enabled,test_command,interval/timeout/retries/start_period),advanced(Advanced startup_command/stop_command/signal/working_dir/user/hostname/privileged/readonly_rootfs/tty/dns/extra_hosts/network_mode/restart_policy/shm/pid/ulimit/log_driver/.../kvm:KvRuntime/lxd:LxdRuntime/multipass:MpRuntime),pages(PageOverride[])`. Tabs: General | Environment | Env Variables | Actions | Install | Runtime | Labels & Devices | Healthcheck | Pages | Spec Preview.

**Runtime tab** (`components/TemplateForm/TemplateRuntimeSection.tsx`):
- `docker` → `Advanced` (startup/stop/signal/working_dir/user/hostname/privileged/readonly_rootfs/tty/dns/extra_hosts/network/restart/shm/pid/ulimit/log/oom/cpu quota/io weight/environment template).
- **`kvm`** (`types/templateForm.ts:195` `KvRuntime`, `TemplateRuntimeSection.tsx` `onKvmRuntimeUpdate`): `vcpus` (2), `cpu_model` (host-passthrough|host-model|kvm64), `machine` (pc|q35|virt), `uefi` (true), `secure_boot`, `tpm`, `vga` (virtio|std|qxl|none), `video_memory_mb` (16), `boot_order` (cd|hd|net), `kernel_args`, `extra_args` (`-device …`), `vnc_port` (auto), `vnc_password`, `spice_port` (auto), `install_iso` (`/path/to/ubuntu.iso`), `disk_bus` (virtio|sata|ide|nvme|scsi), `disk_cache` (writeback|none|writethrough|directsync), `io_thread`, `discard`, `numa`, `hugepages`, `rdm_reservation`.
- `lxd` → profiles/storage_pool/volume_size/config/devices/limits_cpu_allowance/priority/security_protection/privileged/raw_idmap/boot_autostart/snapshot_pattern.
- `multipass` → cpus/disk_mb/mem_mb/cloud_init_userdata/metadata/image_alias/bridges/bridged/launch_argument/autorecovery.

**Serialization** (`utils/templateFormUtils.ts:121` `serializeSpec` / `232` `parseSpec`, `instanceFormUtils.ts:320` / `instanceFormUtils.ts:113`): spec is a JSON string on `Template.spec` and `Instance.config` (`shared/types/instance.ts:15`). `parseSpec` restores `pages` handling both string-encoded `actions` and inline arrays plus `components` (`parsePageComponents`/`parseSpecComponents`). Deploy snapshot copies `template.spec` + per-instance overrides into `instance.config`; subsequent template edits never affect deployed instances.

---

## 8) Instance Panel — One VM's Cockpit (`features/instances/pages/InstanceDetail.tsx:24`)

Every instance tab is a **custom page** injected from the Instance Pages library (no static built-ins; legacy `kind:'builtin'` wiped in `046_instance_pages_drop_builtin.sql`). The panel is empty-by-default — a template exposes zero tabs until an operator imports pages.

**Shell** (`InstancePanel:24`): `useInstance(id)` (hook at `shared/hooks/useInstance.ts`), `useInstanceNavSync(instanceId, spec, loading)` where `spec = useMemo(() => parseConfig(instance.config), [instance.config])` (stable ref to avoid infinite loop). Renders `<Outlet/>`.

**Dynamic resolver** (`InstanceDynamicPage:95`):
```ts
wildcard = useParams()['*']; effectiveSlug = (wildcard||'').replace(/\/+$/,'') || '.'
if (!isPageAllowed(effectiveSlug, spec)) → NoPagesState or "not part of template"
if (effectiveSlug==='terminal') → <TerminalRealPage/> (native xterm, not CustomPageView)
label = getPageLabel(effectiveSlug,spec) ?? (effectiveSlug==='.'?'Home':effectiveSlug)
content = getPageContent(effectiveSlug,spec); if missing → "has no content"
instanceContext = {id,name,kind,status,template_id,node_id,owner_id,config(ex parsed),external_id,created_at,install_*,display_name,icon,color}
→ <CustomPageView content title={label} instanceContext pageSlug={effectiveSlug} />
```

`isPageAllowed` (`shared/utils/instancePages.ts:141`) checks exact `slug`, `original_slug`, nested `findSubPageEntry`, and fallback any `<parent>/<path>` under enabled parent. `getPageContent:306` prefers `findPageRow(slug)` else `findSubPageEntry`; `components` are inherited from parent, `actions` not.

**Terminal** (`InstanceDetail.tsx:95` `TerminalRealPage`, `shared/components/ui/Terminal.tsx`): xterm 6.0.0 + Fit/WebLinks addons, PTY via WebSocket `ws(s)://host/api/instances/:id/terminal` (panel → edge `/api/edge/exec`), session cookie auth, auto-reconnect, title parsing for `cwd`, header `user@host:cwd$`, Clear/Reconnect.

**Navigation**: host pages (`markdown/blocks`) fire `window.dispatchEvent(CustomEvent('ks-navigate',{detail:{to}}))` → `InstancePanel:34` `pageNavigateTarget(instanceId,to)` then `navigate(target)`. Iframe pages go via bridge `ks-sdk-call` `navigate` → parent validates via same `pageNavigateTarget` (`shared/lib/customPageSdk.ts:182` — rejects `//`, `.|..`, outside `/instances/:id`, >2048).

---

## 9) Rendering & SDK — How Pages Execute VM Actions (`shared/components/ui/CustomPageView.tsx:11`, `shared/lib/customPageSdk.ts:216`)

**Content types**:

| Type | Host vs Iframe | SDK |
|---|---|---|
| `html` | sandboxed `<iframe sandbox="allow-scripts allow-forms allow-popups allow-modals"` **without** `allow-same-origin` (opaque origin), `srcDoc` from `buildIframeDocument:516` (theme CSS + `KSPageSDK` bridge) | `postMessage` `ks-sdk-call` ↔ `ks-sdk-response`, whitelisted `BRIDGE_METHODS:509` |
| `markdown` / `blocks` | host React (`renderMarkdown:414`, `renderBlocks:205`) | `window.KSPageSDK = createCustomPageSDK(...)` direct |

**Blocks** (`pageStudio.ts:68`, `CustomPageView.tsx:205`): `heading|text|image|button|code|stat|table|list|html|action|spacer|divider`. All textual fields run `resolveComponentTokens` (`CustomPageView.tsx:83`) so `{{component:header}}` composes like React (5-pass bounded). `HtmlBlockFrame:362` per-`html`-block iframe auto-height (`ks-block-resize`). `action` blocks call `sdk.runAction(name)` (`confirmText` via `confirmDialog`).

**Components** (`types/instancePage.ts:55` `PageComponentDef {name,type(html|markdown|block), description?, content(≤1MiB)}`): authored in Studio → Components tab (`PageStudioComponentsSection.tsx:15`), referenced as `{{component:name}}` (`COMPONENT_TOKEN_RE:74`), max 50 / 512 KiB (`instance_page_handler.go:173`), validated `^[A-Za-z0-9_][A-Za-z0-9_-]*$`. Inherited by sub-pages (`pagePayloadFromSub`).

**Sub-pages** (`types/instancePage.ts:63` `InstancePageSubPage {path,name,content_type,content_*}`): single segment `path` `^[a-z0-9_-]+$` (`validSubPagePath`), effective slug `<slug>/<path>`, max 20 / 512 KiB, not emitted as tabs.

**Actions** (`types/instancePage.ts:9` `PageActionDef {name,type(shell|read_file|write_file|list_files|docker|kvm|lxd), command?,path?,content?,args?,open_args?,env?,timeout?}`): declared in Studio Actions tab, persisted as JSON (`instance_pages.actions`) → inline array in `spec.pages[]` → snapshot `instance.config`. Two execution paths: **Studio Test** `POST /api/instance-pages/:id/actions` (requires `MANAGE_INSTANCE_PAGES`), **Live SDK** `POST /api/instance-pages/execute-action` (`instance_page_handler.go:1151`, gated `VIEW_INSTANCES`, `pageSlug` → `findSpecPageRow` → `savedActionMatches` exact + `resolveExecPayload` `open_args` ≤4 `validActionArg`, shell-quoted) → edge `POST /api/edge/page-action`.

**KSPageSDK** (`customPageSdk.ts:216` `createCustomPageSDK(instanceContext,savedActions,pageSlug)`):
```
sdk.instance, sdk.actions, sdk.runAction(name, overrides?), sdk.executeAction(action)
sdk.fetchPanel(path,init?)  // only /api/instances/:id/…
sdk.shell/readFile/writeFile/listFiles/deleteFile/createDirectory/docker/kvm/lxd
sdk.subscribe(action,cb,intervalMs) polling, sdk.navigate(to)
sdk.toast/confirm/prompt/modal, sdk.on/once/emit + ks-page-event relay
sdk.storage.{get,set,delete,clear,keys} (localStorage ks_page_<id>_), sdk.connectWS
window.KS_PAGE_QUERY (=location.search, safeInlineJson:509)
```
Bridge parent handler (`CustomPageView.tsx:947`) validates `event.source===iframe`, method ∈ `BRIDGE_METHODS`, `sdkRef` exists; WebSocket proxy for `connectWS` (parent opens real WS with session cookie, relays `ks-ws-*`).

**Theme in iframe** (`CustomPageView.tsx:822` `customPageThemeCss`, `cssConst:804` strips `{}<>\\;` + controls, cap 256): bakes concrete `--ks-*` (heading/body/muted/link/ok/warn/bad/info/card/input/button/font) from `themeStore.active()` + per-page Custom CSS, so KVM console pages, VM dashboards, tables all follow the active theme.

---

## 10) VM Driver Quick Reference (what the frontend exposes)

| Driver | Kind key | Frontend surfaces | Key spec / runtime fields |
|---|---|---|---|
| **KVM** | `kvm` | TemplateForm Runtime (full `KvRuntime` form), page action `type:kvm`, node `driver_kvm`, template list orange badge, instance `kind === 'kvm'` uses host VM exec | `vcpus, cpu_model, machine, uefi, secure_boot, tpm, vga, video_memory_mb, boot_order, kernel_args, extra_args, vnc_port/password, spice_port, install_iso, disk_bus/cache, io_thread, discard, numa, hugepages, rdm_reservation` |
| **LXD** | `lxd` | Runtime `LxdRuntime` form, action `type:lxd`, indigo badge | `profiles, storage_pool, storage_volume_size, config, devices, limits_cpu_allowance/priority, security_protection/privileged, raw_idmap, boot_autostart, snapshot_pattern` |
| **Multipass** | `multipass` | Runtime `MpRuntime` form, fuchsia badge | `cpus, disk_mb, mem_mb, cloud_init_userdata/metadata, image_alias, bridges/bridged, launch_argument, autorecovery` |
| **Docker** | `docker` | `Advanced` (network/restart/log/limits/env_template) + action `type:docker`, sky badge | `startup_command, stop_command/signal, working_dir, user, hostname, privileged, readonly_rootfs, enable_tty, dns, extra_hosts, network_mode, restart_policy, shm_size, pid_limit, ulimit_nofiles/nproc, log_driver/max_size/files, oom_kill_disable, cpu_quota_period, io_weight` |

Session kinds for template actions (`types/templateForm.ts:115` `session`): `long_running` (default), `console_session` (pty), `vm_full` (`panel/backend` gives raw LXD/KVM/Multipass console — trusted users only, `TemplateActionsSection.tsx` note).

**Template pages inside a VM** (`TemplateForm` Pages tab → `InstancePageDetail` / `InstancePageStudio`): imported from Instance Pages library (`components/PageStudio/*`), linked into `template.spec.pages[]` via `POST /api/instance-pages/:id/link` (`instance_page_handler.go:586` sanitized `icon_svg`, `components` inline array, replaces existing `slug` or drops legacy `slug/...` flattened rows).

---

## 11) Permissions (VM-relevant slice of `shared/types/permissions.ts:1`)

Umbrella keys: `MANAGE_INSTANCES`, `MANAGE_NODES`, `MANAGE_TEMPLATES`, `MANAGE_INSTANCE_PAGES`, `ACCESS_ADMIN_PANEL`, `VIEW_INSTANCES`. Each area in `PERMISSION_AREAS` (`Permissions.ts:197`) carries granular `VIEW/CREATE/EDIT/DELETE` + `OWN/ALL` + `extraKeys`. Frontend helpers: `hasAreaAccess(set,area,action)` (`Permissions.ts:408` umbrella implies all actions) and `hasPermissionAny` (`:418`).

- **Instances** (`label:'Instances'`, umbrella `MANAGE_INSTANCES`, keys `INSTANCES_VIEW/CREATE/EDIT/DELETE`, `extraKeys [VIEW_INSTANCES]`, `ownKey INSTANCES_OWN`, `allKey INSTANCES_ALL`): list/exec gates honor it. Sidebar entry `/instances` admits `VIEW_INSTANCES` or any `INSTANCES_*` (`Sidebar.tsx:279`).
- **Nodes** / **Templates** / **Instance Pages** similar — their `VIEW` keys gate the list/detail pages; instance panel execute (`/execute-action`) is gated `VIEW_INSTANCES` intentionally (page runs inside `/instances/:id/*`).
- **OWN vs ALL**: backend scopes `list` filtering and creates (`owner_id` forced to self when `OWN`). Frontend mirrors by picking fleet vs own data source.

`RequirePermission` in `router.tsx` admits via umbrella OR any granular key of that area (area lookup + `hasPermissionAny`).

---

## 12) Nodes ↔ Template ↔ Instance Data Flow (deploy path)

```
Instance Page Studio (/instance-pages/studio)          Template Editor (Pages tab)
  name/slug/category  ──Create/Update──▶  instance_pages table        Import from library
  content (html/md/    instance_pages table                           → spec.pages[] entry
    blocks)                                                            (label,icon,actions,sub_pages,components)
  icon_svg ◀─Import JSON ───────────────                               ──serializeSpec()──▶  template.spec (JSON string)
  actions[] / sub_pages[] / components[]                               templateFormUtils.ts:121 / instanceFormUtils.ts:320
                                                                       │
Deploy shell (/instances/new) ──buildOverrides()──▶  template.spec + overrides ──POST /api/instances/deploy──▶
                                                                       panel handler merges env_vars + overrides
                                                                       → edge /api/edge/lifecycle (driver=kind, image, spec)
                                                                       → DB instance.config = shapshot JSON
                                                                       → install_state tracking + installSweepLoop

Instance panel (/instances/:id/*) ◀──parseConfig(instance.config)── instance.config shapshot (frozen)
                                ──► resolveInstanceNav / isPageAllowed / getPageContent / CustomPageView
```

Template URL install is SSRF-hardened (`client.ts` + `template_handler.go`): public-IP only, DNS-pinned, size/time capped.

---

## 13) VM-Relevant API Surface (frontend client `shared/api/admin.ts` + `shared/api/client.ts`)

| Method | Path | Gate | Frontend caller |
|---|---|---|---|
| `GET` | `/api/instances/` | `VIEW_INSTANCES` (scoped Own/All) | `listInstances`, `listMyInstances` (`features/auth/api/me.ts`) |
| `POST` | `/api/instances/deploy` | `MANAGE_INSTANCES CREATE` | `deployInstance(DeployRequest)` |
| `PUT` | `/api/instances/:id` | `MANAGE_INSTANCES EDIT` | `updateInstance` (advanced overrides) |
| `POST` | `/api/instances/:id/start|stop|restart|destroy` | `MANAGE_INSTANCES` (≈ EDIT/CONTROL) | `start/stop/restart/destroyInstance` (`Instances.tsx:133`) |
| `POST` | `/api/instances/:id/suspend|unsuspend` | `MANAGE_INSTANCES` (privileged) | `suspendInstance({reason,duration_hours})` |
| `GET` | `/api/instances/:id/terminal` | `VIEW_INSTANCES` (+ WS upgrade) | `Terminal.tsx` WS bridge |
| `GET` | `/api/nodes/` | `MANAGE_NODES VIEW` | `listNodes` |
| `POST` | `/api/nodes/` | `MANAGE_NODES CREATE` | `createNode` |
| `PUT` | `/api/nodes/:id` | `MANAGE_NODES EDIT` | `updateNode` |
| `DELETE` | `/api/nodes/:id` | `MANAGE_NODES DELETE` | `deleteNode` |
| `POST` | `/api/nodes/:id/rotate-token` | `MANAGE_NODES` | `rotateNodeToken` → shows `config.json` (`nodesUtils.ts:buildEdgeConfig`) |
| `POST` | `/api/nodes/:id/probe` + `POST /api/nodes/probe-all` | `MANAGE_NODES` | `probeNode/probeAllNodes` |
| `GET` | `/api/nodes/:id/heartbeats?bars=…` | `MANAGE_NODES VIEW` | `nodeHeartbeats` |
| `POST` | `/api/nodes/:id/purge-local` | `MANAGE_NODES` | `purgeLocalNode` |
| `GET` | `/api/templates/` | `MANAGE_TEMPLATES VIEW` | `listTemplates` |
| `POST` | `/api/templates/` (multipart `manifest`) | `MANAGE_TEMPLATES CREATE` | upload flow (`Templates.tsx:110`) |
| `POST` | `/api/templates/url` `{url}` | `MANAGE_TEMPLATES CREATE` | URL install (`Templates.tsx:149`) |
| `GET` | `/api/templates/:id/download` → blob | `MANAGE_TEMPLATES VIEW` | `downloadTemplate` |
| `DELETE` | `/api/templates/:id` | `MANAGE_TEMPLATES DELETE` | `deleteTemplate` |
| `POST` | `/api/instance-pages/:id/actions` | `MANAGE_INSTANCE_PAGES EDIT` | `executePageAction` (Studio Test) |
| `POST` | `/api/instance-pages/execute-action` `{instance_id,page_slug,type,…}` | `VIEW_INSTANCES` | `customPageSdk.ts:277` live page |
| `GET/POST/PUT/DELETE` | `/api/instance-pages/` + `:id` + `:id/link` + `/import` etc | `MANAGE_INSTANCE_PAGES` VIEW/CREATE/EDIT/DELETE | `listInstancePages` et al. (`shared/api/admin.ts`) |

Edge (panel → ksedge over `edge.New(node,token)`):
`POST /api/edge/page-action` (page actions / `docker|kvm|lxd` exec), `POST /api/edge/exec` (terminal PTY), `POST /api/edge/host-exec` (one-shot host exec), `POST /api/edge/lifecycle` (create/destroy/start/stop), `POST /api/edge/files/*`, `POST /api/edge/install`, `/api/edge/inspect`, `/health`, `POST /push` heartbeats.

---

## 14) Theming for VM Pages

VM pages follow the active panel theme despite opaque-origin iframes. `customPageThemeCss(activeTheme)` (`CustomPageView.tsx:803`, `colorUtils.ts:2`, `theme/defaults.ts`, `theme/studioControls.tsx`) bakes concrete `--ks-*` (font/heading/body/muted/link/ok/warn/bad/info/card/input/button) from `themeStore.active()` (`shared/stores/themeStore.ts:413`). Used in: HTML iframe `srcDoc` (`CustomPageView.tsx:942`), `HtmlBlockFrame:380`, Studio static preview (`pageStudioUtils.ts:248`). `RouteThemeSync.tsx` re-applies on pathname change; `ThemeAssignMenu.tsx` + `pageregistry.ts:14` groups pages into `auth|admin|instance` for per-page assignment.

---

## 15) Frontend File Map (VM focal)

```
panel/frontend/src/
├── app/{App.tsx, router.tsx}
├── shared/{api/client.ts|admin.ts, components/layout/{Layout.tsx,Sidebar.tsx,Header.tsx,InstanceNavContext.tsx,RouteThemeSync.tsx}, components/ui/{CustomPageView.tsx,Terminal.tsx,Card.tsx,SkeletonGrid.tsx,RequireAuth.tsx,RequirePermission.tsx}, types/{permissions.ts,instance.ts,node.ts}, utils/instancePages.ts, lib/customPageSdk.ts, stores/{authStore.ts,themeStore.ts,confirmStore.ts}, hooks/useInstance.ts}
└── features/
    ├── instances/{pages/{Instances.tsx,InstanceDetail.tsx,InstanceForm.tsx,InstanceStats.tsx,AdvanceOptionPage.tsx,InstanceEditAdvanced.tsx,InstanceAdvancedOptionsFullScreen.tsx}, components/{InstanceCard.tsx,InstanceFormComponents.tsx,InstanceTabs.tsx}, stores/{deployFormStore.tsx,DeployFormShell.tsx}, types/{instance.ts,instanceForm.ts,instanceAdvanced.ts}, utils/instanceFormUtils.ts}
    ├── nodes/{pages/{Nodes.tsx,NodeDetail.tsx,NodeForm.tsx,NodeStats.tsx}, components/NodesComponents.tsx, types/nodes.ts, utils/{nodesUtils.ts,nodeIcons.tsx,nodeFormUtils.ts}}
    ├── templates/{pages/{Templates.tsx,TemplateDetail.tsx,TemplateForm.tsx,TemplateStats.tsx}, components/TemplateForm/{TemplateActionsSection.tsx,TemplateEnvVariablesSection.tsx,TemplateEnvironmentSection.tsx,TemplateHealthcheckSection.tsx,TemplateInstallSection.tsx,TemplateLabelsDevicesSection.tsx,TemplatePagesSection.tsx,TemplateRuntimeSection.tsx,TemplateSpecPreviewSection.tsx}, types/templateForm.ts, utils/templateFormUtils.ts}
    └── instance-pages/{pages/{InstancePages.tsx,InstancePageDetail.tsx,InstancePageStudio.tsx,InstancePageStats.tsx}, components/PageStudio/{PageStudio*.tsx}, templates/pageStarters.ts, types/{instancePage.ts,pageStudio.ts,pageregistry.ts}, utils/pageStudioUtils.ts}
```

Backend glue (VM): `panel/backend/internal/api/handlers/{instance_handler.go,node_handler.go,template_handler.go,instance_page_handler.go:40,instance_page_guard.go:702}`, `internal/models/instance.go:56`, `internal/repository/{instance_repo.go,node_repo.go,template_repo.go,instance_page_repo.go:32}`, `internal/config/instance_pages.go`, `internal/pagelib/library/marketplace.json`. Edge: `edge/backend/internal/drivers/{kvm.go,lxd.go,docker.go,multipass.go,helpers.go}`, `exec/handler.go`, `pageaction/handler.go`.

---

## 16) Security (VM surface)

- HTML iframe `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"` **no** `allow-same-origin` → opaque origin; only `postMessage` bridge (`BRIDGE_METHODS:493`, source === iframe, method allowlist, `sdkRef` gate). `HtmlBlockFrame` same sandbox without downloads.
- `PageActionDef` allow-list (`savedActionMatches` exact compare, `open_args` ≤4, `validActionArg` charset, `shellQuoteArg`, `{{args}}` required for shell `open_args`, timeout 1–600s).
- `pageSlug`-bound execution (`findSpecPageRow(parseSpecRows(config), pageSlug)` must exist, 403 otherwise).
- `fetchPanel` / `navigate` fail-closed on `//`/`.`/`..`/over-2048 (`customPageSdk.ts:182`, `307`).
- Icon SVG hardened 10-pass strip (`sanitizeIconSVG` remove `script/foreignObject/iframe/on*=/javascript:`).
- Upload `.kspm` unzip hardened (`instance_page_handler.go:1966` entry≤2000/per≤64M/total≤256M, `filepath.Clean` + `HasPrefix(destAbs)`).
- Permissions fail-closed per route (`server.go:467` `requireUmbrellaOrAction`); `MANAGE_INSTANCE_PAGES` for library, `VIEW_INSTANCES` for live execute.
- All panel fetches cookie-only (`HttpOnly` session + CSRF header `internal/api/csrf.go` + rate limiter), security headers.

---

## 17) Limits & Hard Stops (server-side, all fail closed)

`validateInstancePage` (`instance_page_handler.go:306`): `name`≤200, `slug` `^ [A-Za-z0-9][A-Za-z0-9._-]*$` or `.` (≤64, no `..`), `description/category/type`≤500, `content_*`& `component.content` ≤1 MiB each, `icon_svg` ≤16 KiB, `actions` JSON ≤64 KiB, `sub_pages` ≤512 KiB ≤20, `components` ≤512 KiB ≤50 unique. Template spec: install workflow budget `install_timeout_s` (edge default 30 m). Node: heartbeat push + probe (`probe_reachable`), alloc overcommit `%`.

---

## 18) Quick Start (VM from zero)

1. **Add a node** — `/nodes` → Add Node → address (`host:port` or `tunnel`), `use_tls`, drivers (check what `ksedge` advertises) → Create → Rotate token → `config.json` on edge → `./ksedge launch` → heartbeats green.
2. **Create a KVM template** — `/templates/new` → General (`name=Ubuntu 22.04 KVM`, `kind=kvm`, `image=ubuntu-22.04.qcow2`) → Runtime (KVM: `vcpus=4`, `cpu_model=host-passthrough`, `machine=q35`, `uefi=on`, `tpm=off`, `vnc_port=auto`, `disk_bus=virtio`, `install_iso=/iso/ubuntu.iso`) → Env Variables (e.g. `SSH_PASSWORD` required, `SSH_PUBKEY` editable) → Install (one `shell` step `cloud-init` if qcow2, or none if already-installed) → Pages → import `Home` + `Terminal` from Instance Pages library → Create.
3. **Deploy** — `/instances/new` → pick template (KVM) → pick node (green driver ring) → set name (`vm-01`), owner, `SSH_PASSWORD` → Advance Option (override cloud-init user-data, limits) → Deploy → jump to `/instances/<id>` → watch install transcript until `running`.
4. **Use** — `/instances/<id>` Home (custom HTML with `KSPageSDK`), Terminal (native xterm WS), any imported pages. `KSPageSDK.listFiles('/etc')`, `KSPageSDK.kvm("virsh list")`, `KSPageSDK.navigate('/instances/12/dashboard/edit?path=/etc/netplan')`.
5. **Operate** — fleet at `/instances` → search/filter/suspend (`reason` required), detail → per-VM card actions (Start/Stop/Restart/Destroy), node detail gauges/health, template detail kind badge.

---

## 19) Troubleshooting (VM)

| Symptom | Cause | Fix |
|---|---|---|
| Node shows Drivers detection failed | `ksedge` probe couldn't run `docker --version`/`kvm --version` etc | Check `edge/backend/internal/drivers/helpers.go`, ensure driver installed + `ksedge` user in `kvm/libvirt`/`docker` groups |
| Deploy warns "node doesn't advertise kvm" | `driverEnabled(node, 'kvm')===false` | Install KVM on edge, restart ksedge, re-probe from Nodes list/Node detail |
| `/instances/<id>/terminal` shows Clear but state closed | WS `/api/instances/:id/terminal` 403 or edge unreachable | `probeNode` from Nodes; check `connection_mode`/`use_tls`/`skip_tls_verify`; tail `/tmp/kspanel-retest/kspanel.log` |
| Instance stuck `installing` | Edge `install/engine.go` step failed | Open instance detail → install transcript → first stderr line in `install_error`; `instance_page_handler.go:774` Studio Test uses same path |
| VM page "not part of template" | `isPageAllowed(effectiveSlug,spec)===false` | Re-import page in `/instance-pages` → link into template (`/templates/:id/edit` Pages) → redeploy or Advanced edit |
| Action button 403 "action is not defined" | `savedActionMatches` mismatch or missing `pageSlug` | Ensure action saved, page linked, instance has that `slug`; `open_args` requires `{{args}}` in stored command |
| Thermal sparkline flat 0% | `node_heartbeats` empty or `status===down` | Check `nodeHeartbeats` API, `heartbeat/push` on edge, `nodesUtils.ts:buildMonitor` |

---

## 20) Differences from `docs/instance-page.md` & `docs/instance-pages.md`

- `instance-page.md` is the **library + rendering** doc (components/sub-pages/actions/SDK/theme/sandbox/limits, pinned to `instance_page_handler.go:40`, `CustomPageView.tsx:79`). This file is the **fleet + VM** doc (deploy/edit/nodes/templates/drivers/instance panel).
- `instance-pages.md` is the **legacy `.kspm` module design** (ZIP bundle manifest, capabilities `websockets/pty/fileAccess`, `manage-workflow`, `create-kspanel-page-module` scaffold). That module system still builds (`UploadInstancePageModuleHandler:1716`, `ServeInstancePageModuleAssetHandler`) but is orthogonal to the shipped custom-page path — this doc treats modules as optional extension, not the default.

---

*Last verified:* `router.tsx:109` instance panel `VIEW_INSTANCES`, `Sidebar.tsx:232` `adminSubItems` serial + `hasSidebarAccess:265`, `instances/Instances.tsx:59` fleet vs own, `InstanceDetail.tsx:34` `ks-navigate` + `95` `InstanceDynamicPage`, `Nodes.tsx:32` card grid + `NodeDetail.tsx:253` `connection_mode`, `Templates.tsx:63` + `templateForm.ts:195` `KvRuntime`, `instance.ts:5` driver `Kind`, `CustomPageView.tsx:83` tokens + `216` SDK bridge + `803` theme, `permissions.ts:197` `PERMISSION_AREAS`, `pageStudio.ts:68` blocks, `instancePage.ts:55` components, build at `panel/backend/internal/ui/dist` (2026-08-29 `index-C-6mEd_3.js`). Re-check with `npm run typecheck` in `panel/frontend` and `bash retest.sh` for a live panel.
