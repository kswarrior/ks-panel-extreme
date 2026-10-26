# KS Panel Mod System — Master Plan (`mod.md`)

> Status: planning document, 2026-10-26.
> Scope: the panel-side mod/extension system (`/mods`) — install, packaging, manifest,
> runtime, sandbox, capabilities, hooks, storage, settings, UI injection, lifecycle,
> ecosystem, tooling, governance. Game-mod managers (Modrinth/CurseForge inside a game
> server) are out of scope. Templates, Applications, Stacks and Instance Pages are
> integration points only.
>
> This document is the master roadmap. `plan/mod.md` remains the older per-item execution
> detail for M6-M15; its status column is partly stale (see §1.8). Where the two disagree,
> this document wins until `plan/mod.md` is reconciled.

Contents:

- [0. Executive verdict](#0-executive-verdict)
- [1. Current state audit](#1-current-state-audit-verified)
- [2. Comparison with other panels](#2-comparison-with-other-panels)
- [3. Target design principles](#3-target-design-principles)
- [4. Backlog](#4-backlog--everything-to-add)
- [5. Milestones](#5-milestones)
- [6. Capability contract](#6-best-mod-system-capability-contract)
- [7. Security model](#7-security-model-for-the-expanded-system)
- [8. Compatibility and migration](#8-compatibility-and-migration)
- [9. Non-goals](#9-non-goals-deliberate)
- [10. Open decisions](#10-open-decisions)
- [11. Definition of Done](#11-definition-of-done-for-every-item)
- [12. Sources read](#12-sources-read)
- [13. Suggested execution order](#13-suggested-execution-order)

---

## 0. Executive verdict

KS Panel already has the safest mod system of every panel compared here. It is not yet the
most capable, the easiest to develop for, or the easiest to distribute. "Best mod system
able to do everything" therefore means closing three gaps **without giving up the safety
lead**:

1. **Ecosystem** — signed packages, a real registry/marketplace, update channels,
   version history/rollback, dependency resolution, publisher trust.
2. **Runtime power** — vendored JS dependencies, timers/cron, background jobs, mod HTTP
   routes, custom/inter-mod events, controlled network access, WebSockets, quotas.
3. **Data, UI and DX** — governed schema ownership, scoped settings, shared KV, table
   column injection, controlled component/page replacement, a scaffold/pack/test/dev
   toolchain, TypeScript SDK, and a local emulator.

The target is **governed parity** with Pterodactyl v2 and Pelican on capability, while
keeping KS's per-call capability grants, approval gate, cancellable pre-hooks, Goja
sandbox, error isolation, multi-DB support, ownership scoping and kill switch.

A mod system cannot safely do literally everything in-process. The only powers that should
remain impossible are the ones that make the PHP panels unsafe: patching panel core files,
running arbitrary PHP/Composer in-process, unrestricted DB/ORM access, and unrestricted
host OS access. Everything else gets a governed equivalent.

### If only ten things get done

1. **H1** — reconcile `plan/mod.md` and `docs/vs/mod.md` so the next agent is not misled.
2. **L1** — wire `requires{}` and topological activation (the parser already exists).
3. **L3** — add upgrade, version history and rollback.
4. **L4** — permission diff on upgrade; never auto-grant new capabilities.
5. **E1** — sign `.kspm` packages and verify before activation.
6. **E3** — ship an MVP registry/marketplace with install and search.
7. **D2** — governed owned schema (`mod_<slug>_*` tables) with multi-DB DDL.
8. **R3** — mod HTTP routes under `/api/mods/v1/ext/{slug}` with admin auth.
9. **U3** — table-column injection with one owner per column.
10. **X1/X2** — `kspanel mod init|pack|validate|lint` so authors can build without guessing.

These ten unlock the rest: signing and registry need packaging; upgrade needs versioning;
routes/tables need the manifest validator; table columns need slot contracts.

---

## 1. Current state audit (verified)

### 1.1 Architecture

Request flow:

```
React Mods/Studio
  -> /api/mods* (internal/api/server.go:578-615)
  -> handlers/mod_handler.go
  -> repository/mod_repo.go + mod_settings_repo.go
  -> DB (mods, mod_permissions, mod_storage, mod_settings)

Activation
  -> modengine/engine.go (Boot/Activate/Deactivate)
  -> per-mod Goja VM (modengine/sandbox.go, build tag modengine_goja)
  -> capability-gated ks.* bindings
  -> handlers/mod_hostops.go -> panel DB / edge client

UI
  -> GET /api/mods/v1/slots (ACCESS_ADMIN_PANEL)
  -> shared/components/ui/Slot.tsx loader
  -> window.KS.registerComponent(...)
  -> <Slot name="..."/> host mounts
```

Key files:

| Layer | Path | Role |
|---|---|---|
| Engine | `panel/backend/internal/modengine/` | Runtime manager, event bus, Goja sandbox, package store, storage, settings, diagnostics |
| Models | `panel/backend/internal/models/mod.go`, `modver.go` | Mod, capabilities, manifest v2, slots, hooks, settings, version-constraint parser |
| Repository | `panel/backend/internal/repository/mod_repo.go`, `mod_settings_repo.go` | CRUD, grants, package metadata, settings + encrypted secrets |
| API | `panel/backend/internal/api/handlers/mod_handler.go`, `mod_events.go`, `mod_hostops.go`, `mod_settings_handler.go` | Install/lifecycle/grants/logs/slots/assets/settings, hook emitters, host operations bridge |
| Routes | `panel/backend/internal/api/server.go:578-615`, `:799-805` | `/api/mods*` + `/api/mods/v1/slots|assets` |
| Migrations | `.../db/migrations/{mysql,postgres,sqlite}/017_mods`, `020_mod_v2`, `027_mod_source`, `036_mod_package`, `081_mod_settings` | Mods, v2 fields, source, package size, typed settings |
| Frontend | `panel/frontend/src/features/mods/` | Mods list, detail, Studio (9 tabs), stats, schedules, mod screen, settings card, presets |
| UI registry | `panel/frontend/src/shared/components/ui/Slot.tsx` | Slot fetch, bundle injection, registry, error boundaries |
| Router/nav | `panel/frontend/src/app/router.tsx:640-648`, `shared/components/layout/Sidebar.tsx:397-420` | `/mods/view/:slug/*` + Mods nav entries |
| Samples | `panel/backend/mod_samples/hello-slot/`, `handlers/mod_samples.go` | File bundle example + 4 builtin samples |

### 1.2 Manifest v2 — what exists today

`models.ModManifestV2` (`models/mod.go:364-390`):

| Field | Status | Notes |
|---|---|---|
| `name`, `slug`, `version`, `description` | Shipped | Slug `^[a-z0-9][a-z0-9-]{0,63}$` |
| `engineVersion` | Shipped | 1 = static manifest, 2 = Goja engine |
| `backendScript` | Shipped | Zip-relative entry file |
| `backendScriptSource` | Shipped | Inline JS variant |
| `uiBundle` | Shipped | Zip-relative, default `frontend/bundle.js` |
| `uiBundleSource` | Shipped | Inline JS, 1 MiB cap, wins over file |
| `slots` | Shipped | `{name, component, props}` |
| `hooks` | Shipped | `{event, phase, handler}` |
| `permissionsRequested` | Shipped | Capability + access level |
| `permissionsDeclared` | Shipped | Custom `<slug>:<key>` permissions |
| `settings` | Shipped | Typed schema, global per mod, encrypted password values |
| `spec` | Shipped | Opaque JSON blob |
| `requires` | **Missing** | Parser exists in `models/modver.go`, but no manifest field, no engine wiring |
| `provides` / `conflicts` | **Missing** | No component ownership model |
| `tables` | **Missing** | No owned schema |
| `routes` | **Missing** | No mod HTTP endpoints |
| `timers` | **Missing** | No timer/cron declarations |
| `events` / `emits` | **Missing** | No custom event declaration |
| `network` | **Missing** | No egress allowlist or HTTP API |
| `sharedStorage` | **Missing** | `CapStorageShared` constant exists but is not in `AllowedCapabilties()` and is unreachable |
| `publisher`, `license`, `homepage`, `icon`, `screenshots`, `changelog` | **Missing** | No marketplace metadata |
| `requires.panel/engine/sdk` | **Missing** | No compatibility matrix |
| `signature` / `checksum` | **Missing** | No package trust |

### 1.3 Lifecycle and API surface

| Capability | Status | Evidence |
|---|---|---|
| Install from multipart `.kspm` | Shipped | `CreateModHandler`, 64 MiB cap (`mod_handler.go:394-399`), zip-slip guarded |
| Install from URL | Shipped | SSRF-guarded (public IPs only, DNS-pinned, 15s/64 MiB), accepts zip or manifest |
| Install from Studio / raw JSON | Shipped | Synthesises a `.kspm` from manifest + spec |
| Builtin samples | Shipped | 4: Event Logger, Destroy Guard, Permission Probe, Hello Slot |
| Download `.kspm` | Shipped | Serves stored package or synthesises one |
| Per-capability approval | Shipped | `PUT /api/mods/{id}/grants`; activation refuses until all granted |
| Activate/deactivate | Shipped | Starts/stops VM, installs/removes hooks + slots |
| Panel-wide kill switch | Shipped | `GET/PUT /api/mods/engine`, persisted in settings KV |
| Per-mod log ring | Shipped | 200 lines per slug, `GET /{id}/logs` |
| Diagnostics | Shipped | Engine mode (`goja`/`noop`), enabled, per-mod state/last error |
| Typed settings | Shipped | `GET/PUT /api/mods/{id}/settings`, password values write-only |
| In-place manifest/package update | **Missing** | `PUT /api/mods/{id}` only updates name/version/description/spec (`mod_repo.go:354-374`) |
| Update/rollback history | **Missing** | No version table, no previous package retention |
| Dependency graph | **Missing** | Parser only |
| Uninstall cleanup of data | Partial | Deletes package/workdir + cascades permissions/settings/storage; no owned tables (none exist), no export |
| Scheduled lifecycle | **Missing** | `ModSchedules.tsx` explicitly says "mods have no cron" |

### 1.4 Runtime API (`ks.*`)

From `modengine/sandbox.go:11-47`:

| Binding | Capability | Notes |
|---|---|---|
| `ks.log(level, msg)` | none | Goes to per-mod log ring |
| `ks.storage.get/set/delete` | none | Namespaced `mod_storage` |
| `ks.events.on/off` | none | Host lifecycle events |
| `ks.db.query` | `db.read_only` or `db.read_write` | SQL validated host-side |
| `ks.db.exec` | `db.read_write` | SQL validated host-side |
| `ks.files.list/read/write` | `filesystem` | Via edge page-action |
| `ks.exec(instanceId, cmd)` | `terminal` | Via edge |
| `ks.console.send` | `terminal` | Via edge |
| `ks.container.action` | `container.control` | Docker driver |
| `ks.vm.action` | `vm.control` | KVM/LXD/Multipass |
| `ks.permissions.has/list` | none | Custom permissions |
| `ks.capabilities.list` | none | Granted capability codes |
| `ks.settings.get/set` | none | Typed schema, secrets revealed only inside owning VM |
| `ks.timers.*` | **Missing** | No timers |
| `ks.routes.*` | **Missing** | No mod HTTP routes |
| `ks.events.emit` | **Missing** | No custom events |
| `ks.http.*` | **Missing** | No network |
| `ks.ws.*` / `ks.stream.*` | **Missing** | No WebSocket/SSE |
| `ks.jobs.*` | **Missing** | No background queue |
| `ks.storage.shared` | **Missing** | Capability constant only |
| `require(...)` | **Missing** | No module loader |
| `ks.console.onOutput` | **Missing** | Only send, no subscribe |

Sandbox guarantees:

- No `require`, `os`, `process`, raw file/network access.
- One Goja VM per mod; one mutex per VM; hooks capped at 5s.
- Panics recovered; a crashing mod is flagged/deactivated, panel stays up.
- Grants re-read per activation and refreshed on grant edits; every binding call
  re-checks the snapshot.
- SQL guard: single statement, no comments, keyword allow-list, deny-list for
  `LOAD_FILE`, `PRAGMA`, `ATTACH`, file-read/timing primitives; 1000-row cap.

### 1.5 Wired events

`handlers/mod_events.go:19-35` plus call sites:

| Phase | Events |
|---|---|
| Pre (cancellable, 409 veto) | `instance.start`, `instance.stop`, `instance.kill`, `instance.destroy`, `instance.restart`, `instance.deploy`, `instance.reinstall`, `file.write`, `file.delete`, `file.upload`, `backup.create`, `backup.restore`, `backup.delete`, `console.command` |
| Post (async) | The same lifecycle/file/backup/console events, plus `instance.install`, `console.output`, `user.login` |

Missing event domains: nodes, users (create/update/delete), roles, templates, themes,
applications, stacks, instance pages, settings, security, notifications, mod lifecycle,
schedules, ports, snapshots, database backups, and any custom/inter-mod events.

### 1.6 UI composition

Catalog (`models/mod.go:166-180`, `shared/types/mod.ts:240-249`):

| Slot | Context | Host mount |
|---|---|---|
| `instance.detail.tabs` | `{instanceId}` | `InstanceDetail.tsx` |
| `instance.card.actions` | `{instanceId}` | `InstanceCard.tsx` |
| `dashboard.cards` | `{}` | `Instances.tsx` |
| `settings.general.below` | `{}` | `Settings.tsx` |
| `admin.mods.detail.after` | `{modSlug}` | `ModDetail.tsx` |
| `mod.screen` | `{slug, path}` | `ModScreen.tsx` at `/mods/view/:slug/*` |

What works:

- Bundle loader injects one ES module per distinct `bundle_url`, idempotent by URL.
- `window.KS.registerComponent(slot, name, component)` registry.
- Per-component ErrorBoundary.
- Mod screen route + Sidebar "Mods" entries (`props.title/icon/nav/order`).
- Mod filter (`<Slot mod="slug">`) prevents two screen mods rendering into each other.
- Studio authors `uiBundleSource` + slots + presets.

What is missing:

- Table column injection.
- Component replacement / host page override.
- Nav contributions outside `mod.screen`.
- Dashboard widget sizing/order/permissions.
- Typed per-slot context contracts.
- Per-role/per-user slot visibility.
- More slots (nodes, users, templates, themes, security, database, stacks, activity).
- Bundle version pinning / React version compatibility contract beyond host globals.
- Broken-bundle telemetry and automatic disable.

### 1.7 Security and governance today

| Control | Status |
|---|---|
| Goja sandbox, no host OS surface | Shipped |
| Capability declarations + admin approval gate | Shipped |
| Per-call grant enforcement + revocation without restart | Shipped |
| Custom permissions persisted + grant-gated | Shipped |
| Cancellable ordered pre-hooks | Shipped |
| Error isolation (crash does not kill panel) | Shipped |
| Per-mod KV isolation | Shipped |
| Typed settings + AES-256-GCM secrets | Shipped |
| SQL guard | Shipped |
| SSRF-guarded URL install | Shipped |
| Zip-slip/symlink guards | Shipped |
| Multi-DB (SQLite/Postgres/MySQL) | Shipped |
| Ownership scoping (`MODS_OWN`/`MODS_ALL`) | Shipped |
| Panel-wide kill switch | Shipped |
| Audit (`activity_logs`, category `mod`) | Shipped |
| Package signing / trust store | **Missing** |
| SBOM / provenance | **Missing** |
| Per-mod quotas (CPU, memory, timers, storage, network) | **Missing** |
| Egress allowlist / controlled network | **Missing** |
| Mod HTTP route auth model | **Missing** |
| Update permission diff + re-approval | **Missing** |
| Sandbox escape monitoring / fuzzing | Partial (unit tests only) |
| Per-instance / per-user settings scopes | **Missing** |
| Owned-schema isolation | **Missing** |

### 1.8 Known drift and dead code

These are small but they make the current docs lie; fix them first.

1. `plan/mod.md` says M8 is pending, but `081_mod_settings.sql`, `mod_settings_repo.go`,
   `mod_settings_handler.go`, `ks.settings`, `ModSettingsCard.tsx` and the AI skill all
   ship it. Mark M8 done.
2. `plan/mod.md` says M7 is pending; `models/modver.go` exists but is **not wired** — no
   `requires` field, no topo sort, no activation checks. Mark M7 "parser only / not wired".
3. `plan/mod.md` says "next free migration is 081"; 081 and 082 are shipped. The next free
   migration is **083**.
4. `models.CapStorageShared` is declared but absent from `AllowedCapabilties()` and has no
   runtime implementation. Either implement shared KV (M14) or remove the constant.
5. `docs/vs/mod.md` is accurate on M6/M8/M15 but its "concrete execution list" points at
   `plan/mod.md` items whose statuses are stale.
6. `UpdateModHandler` cannot update a manifest or package; Studio-created mods cannot evolve
   their hooks/slots/settings after creation. This is both a feature gap and a docs trap.
7. `ModSchedules.tsx` is honest: mods have no cron. Any plan claiming scheduled mod work
   must add the runtime first.
8. The AI skill `aiskills/mods.md` documents only what ships; it must grow with every item
   below (respect the ~3.2 KB cap and `TestAIDocsCoverage`).

---

## 2. Comparison with other panels

### 2.1 Panel profiles

| Panel | Extension unit | Runtime | Trust model | Ecosystem |
|---|---|---|---|---|
| **KS Panel (current)** | `Mod` row + `.kspm` / manifest | Per-mod Goja VM, capability-gated bindings | Sandbox + per-capability approval + veto hooks + kill switch | 4 samples, manual sharing; no marketplace/signing/updates |
| **Pterodactyl v2 (beta)** | `.pteroext` zip + `extension.json` | PHP/Laravel service provider in-process | Full panel access; no sandbox; no approval gate; post-commit events only | Official extensions repo + paid third-party marketplace |
| **Pelican (beta)** | Plugin folder/zip + `plugin.json` | PHP/Laravel + Filament in-process; Composer deps auto-install | Full app access; no sandbox; no approval gate; no veto | Live Hub marketplace, official + community plugins, scaffold command |
| **Pterodactyl v1 + Blueprint** | Addon that patches core files | PHP after core mutation | Full access; updates break addons | Blueprint ceased operations Oct 2026; dead end |
| **PufferPanel v3** | None | Templates/themes only | N/A | None |
| **AMP (commercial, closed core)** | Plugins/addons + plugin API | In-process plugin API, closed core | Vendor trust; no documented sandbox/approval/veto | Commercial add-on ecosystem |

### 2.2 Capability matrix

`Yes` = shipped and usable; `Partial` = exists but incomplete; `No` = absent or not documented in the sources read. Competitor cells are deliberately conservative.

| Capability | KS now | KS target | Ptero v2 | Pelican | Ptero v1 | Puffer |
|---|---|---|---|---|---|---|
| Rich manifest / schema | Yes | Yes | Yes | Yes | No | No |
| Panel/engine/SDK compatibility | No | Yes | Yes | Yes | No | No |
| Mod-to-mod dependencies + topo load | No (parser only) | Yes | Yes | Yes | No | No |
| Provides/conflicts + one-owner | No | Yes | Yes | Partial | No | No |
| In-place update + rollback | No | Yes | No | Partial | No | No |
| Sandbox / isolation | **Yes** | **Yes** | No | No | No | No |
| Per-call capability enforcement | **Yes** | **Yes** | No | No | No | No |
| Approval gate before activation | **Yes** | **Yes** | No | No | No | No |
| Cancellable pre-hooks / veto | **Yes** | **Yes** | No | No | No | No |
| Post hooks / event breadth | Partial | Yes | Partial | Partial | No | No |
| Custom/inter-mod events | No | Yes | No | No | No | No |
| Typed settings | Yes (global) | Yes (scoped) | Yes | Yes | No | No |
| Encrypted settings secrets | **Yes** | **Yes** | Yes | No | No | No |
| Owned DB schema + migrations | No | Yes | Yes | Yes | No | No |
| Namespaced KV | Yes | Yes | Yes | Yes | No | No |
| Shared KV | No | Yes | N/A | N/A | No | No |
| Raw DB access | Guarded | Guarded | Unrestricted | Unrestricted | Unrestricted | No |
| Vendored JS deps / require | No | Yes | Composer | Composer | No | No |
| Timers / cron / jobs | No | Yes | Laravel | Laravel | No | No |
| Mod HTTP routes | No | Yes | Yes | Yes | No | No |
| Controlled network fetch | No | Yes | Yes | Yes | No | No |
| WebSocket / streaming | No | Yes | Yes | Yes | No | No |
| UI slots / tabs | Yes (6) | Yes (20+) | Yes | Yes | Partial | No |
| Full-screen mod pages + nav | Yes | Yes | Yes | Yes | Partial | No |
| Table column injection | No | Yes | Yes | Yes | Partial | No |
| Component/page replacement | No | Controlled | Yes | Yes | Partial | No |
| Per-role/per-user UI visibility | No | Yes | No | No | No | No |
| Marketplace / registry | No | Yes | Yes | Yes | No | No |
| Package signing / SBOM | No | Yes | No | No | No | No |
| Update channels / auto-update | No | Yes | No | Partial | No | No |
| Scaffold / pack / validate | No | Yes | Partial | Yes | No | No |
| Hot reload / dev emulator | No | Yes | No | No | No | No |
| Mod test harness | No | Yes | No | No | No | No |
| TypeScript SDK | No | Yes | No | No | No | No |
| Per-mod metrics/quotas | No | Yes | No | No | No | No |
| Kill switch | **Yes** | **Yes** | Env only | No | No | No |
| Multi-DB | **Yes** | **Yes** | Partial | Yes | Partial | No |
| Ownership scoping | **Yes** | **Yes** | Partial | Partial | No | No |
| Audit trail | Yes | Yes | Partial | Partial | No | No |

### 2.3 Current scoreboard

From `docs/vs/mod.md` §12 (honest, Oct 2026):

| Rank | Panel | Sum | Final /100 |
|---|---|---|---|
| 1 | KS | 1,090 / 1,300 | 84 |
| 2 | Pelican | 972 / 1,300 | 75 |
| 3 | Pterodactyl v2 (beta) | 967 / 1,300 | 74 |
| 4 | Pterodactyl v1 + Blueprint | 435 / 1,300 | 33 |
| 5 | PufferPanel | 120 / 1,300 | 9 |

KS loses almost entirely on **ecosystem** (case 9: 25), **UI injection breadth** (87),
**data/schema** (88) and **developer tooling** (82). It wins isolation (90), capabilities
(94), multi-DB (95), governance (90), diagnostics/kill switch (90), lifecycle (88),
manifest (88), events (88) and settings (88).

### 2.4 Target scoreboard after this roadmap

| Case | KS now | KS target | Closing items |
|---|---|---|---|
| Manifest/schema | 88 | 100 | H2, H4, H5, L1, L2 |
| Packaging/install | 85 | 98 | E1, E3, E6, L3 |
| Lifecycle | 88 | 99 | L1-L7 |
| Isolation/sandbox | 90 | 99 | R5, R8, R9, V1 |
| Capability model | 94 | 100 | D1, D4, O6, O7 |
| Events/hooks | 88 | 99 | R4, event breadth |
| Data/storage | 88 | 99 | D1-D8 |
| UI injection | 87 | 98 | U1-U12 |
| Ecosystem/distribution | 25 | 95 | E1-E12 |
| Developer tooling | 82 | 99 | X1-X10 |
| Diagnostics/kill switch | 90 | 100 | O1-O10 |
| Governance/ownership | 90 | 100 | O3, O6, O7 |
| Multi-DB | 95 | 100 | D2, V3 |
| **Total** | **84** | **~98** | |

"100" here means no known gap in the compared scope, not perfection.

### 2.5 What to copy, what never to copy

Copy from Pterodactyl v2:

- `requires{}` dependency graph + topological load.
- One-owner-per-component conflict rule.
- Screens/tabs/table-column UI registration.
- Official extension repo model (but signed and governed).
- Typed settings with scopes.

Copy from Pelican:

- Live marketplace/Hub UX, categories, install counts.
- `plugin:make`-style scaffold command.
- Incompatibility flags + load order in the admin list.
- Composer-style dependency convenience (via vendored JS, not Composer).

Do **not** copy:

- Core-file patching (Ptero v1/Blueprint) — updates break it, security reviews cannot
  reason about it, and the framework is EOL.
- Arbitrary PHP/Laravel service providers in-process (Ptero v2/Pelican) — full panel
  access is the documented weakness.
- Unrestricted DB/ORM + migrations created directly by the plugin — use the governed
  schema registry.
- "No approval gate" installs — KS's approval gate is a differentiator, keep it.
- Public unauthenticated mod routes by default — start with admin-session routes.

---

## 3. Target design principles

1. **Governed power over full trust.** Every host effect is declared, approved, checked
   per call, auditable and revocable. No raw host/DB/core access.
2. **Additive by default, replacement by explicit contract.** Slots are additive. Table
   columns and component/page replacement require explicit manifests and one-owner rules.
3. **Signed and reproducible.** Every package has a checksum, signature, SBOM and build
   provenance. Unsigned is a dev-only mode.
4. **Fail closed.** Missing grant, missing signature, missing dependency, bad schema,
   engine disabled, quota exceeded -> deny with a clear error, never silently allow.
5. **Backward compatible.** v1/v2 manifests keep working. New fields are optional until a
   new engine version is opted into. Never edit a shipped migration.
6. **Multi-DB first.** Every new table/column works on SQLite, PostgreSQL and MySQL.
7. **Observable.** Every mod has logs, metrics, health, audit and a kill switch.
8. **Developer-first.** A mod author can scaffold, run, test, pack, sign and publish
   without reading panel internals.
9. **Bounded.** Every runtime surface has a quota: time, memory, timers, routes, storage,
   DB rows, network, connections.
10. **No silent updates.** An update that adds capabilities must show a permission diff and
    require re-approval.

---

## 4. Backlog — everything to add

Priority:

- **P0** = required to call the system complete and correct.
- **P1** = required to be best-in-class / competitive.
- **P2** = differentiator / long-term.

Effort: S <= 1 day, M = 2-4 days, L = 1-2 weeks, XL > 2 weeks.

### 4.1 Correctness and hygiene (P0)

- [ ] **H1 — Reconcile status docs.** Update `plan/mod.md` statuses (M8 done, M7 partial,
      next migration 083), update `docs/vs/mod.md` where it points at stale items, and
      make `aiskills/mods.md` the single authoring summary. Effort: S.
- [ ] **H2 — Manifest schema version + central validator.** Add `apiVersion` (or
      `engineVersion: 3`) and one `ValidateManifest` choke point used by every install
      path (file, URL, Studio, JSON, sample, registry). Keep v1/v2 parsing. Effort: M.
- [ ] **H3 — Manifest/package update path.** Either extend `PUT /api/mods/{id}` to accept
      a new manifest/package or add `POST /api/mods/{id}/upgrade`. Current update only
      changes name/version/description/spec (`mod_repo.go:354-374`). Effort: M.
- [ ] **H4 — Marketplace metadata.** Add `publisher`, `license`, `homepage`, `icon`,
      `screenshots`, `changelog`, `tags` to the manifest and the Mods UI. Effort: M.
- [ ] **H5 — Compatibility matrix.** Add `requires.panel`, `requires.engine`,
      `requires.sdk` and enforce at install/activate with a clear incompatibility state.
      Effort: M.
- [ ] **H6 — Provides/conflicts + one-owner.** Add `provides` and `conflicts`; enforce
      one owner per component/slot/page; surface conflicts before activation. Effort: M.
- [ ] **H7 — Dead code cleanup.** Wire or remove `models.CapStorageShared`; wire or remove
      `models/modver.go`; remove any other unreachable capability/manifest fields. Effort: S.

### 4.2 Dependency and lifecycle (P0/P1)

- [ ] **L1 — Wire `requires{}` (M7).** Add the field to `ModManifestV2`; reuse
      `models/modver.go`; validate max 16 deps, no self-dep, slug regex, constraint parse;
      topological sort by dependency with deterministic slug tiebreak; cycle detection;
      `blocked_by` diagnostics; keep the rest of the panel running when one mod is blocked.
      Effort: L.
- [ ] **L2 — Dependency-aware activate/deactivate.** Activation refuses 409 with the list
      of unsatisfied deps; deactivation refuses 409 when active dependents exist (explicit,
      no silent cascade). Effort: M.
- [ ] **L3 — Upgrade + version history + rollback.** Keep previous manifest/package/spec
      (new `mod_versions` table or package-store versions), expose history, rollback to a
      prior version, and re-activate safely. Effort: L.
- [ ] **L4 — Update permission diff.** On upgrade, diff requested capabilities/settings/
      slots/routes/tables; show the diff; require re-approval for new grants; never
      auto-grant. Effort: M.
- [ ] **L5 — Crash-loop protection + last-known-good.** Count failures per window,
      auto-disable after threshold, keep last-known-good package, alert the admin.
      Effort: M.
- [ ] **L6 — Uninstall cleanup.** Remove workdir, package, logs, timers, routes, jobs,
      settings, storage, shared KV grants; owned tables only with explicit admin opt-in
      (or keep + warn). Effort: M.
- [ ] **L7 — Doctor command.** `kspanel mod doctor` detects orphaned packages, missing
      deps, blocked mods, stale grants, broken bundles, unused storage. Effort: M.

### 4.3 Data and state (P0/P1)

- [ ] **D1 — Scoped settings.** Manifest `settings[].scope`: `global`, `instance`,
      `user`, `node`; API `GET/PUT /api/mods/{id}/settings?scope=...`; binding
      `ks.settings.get(key, scope?)` / `set(key, value, scope?)`; secrets encrypted per
      scope. Effort: L.
- [ ] **D2 — Owned schema (M9).** Manifest `tables: [{name, columns}]`; names forced to
      `mod_<slug>_<name>`; max 8 tables / 24 columns; panel-run idempotent
      `CREATE TABLE IF NOT EXISTS`; additive `ADD COLUMN` only; registry table
      `mod_tables(mod_slug, table_name, schema_version, created_at)`; multi-DB type map;
      explicit admin drop. Effort: XL.
- [ ] **D3 — Governed query layer.** Keep `ks.db` raw-SQL guard; add
      `ks.db.table("name").select/insert/update/delete` with a table allowlist restricted
      to the mod's own prefix. Effort: L.
- [ ] **D4 — Shared KV (M14).** `sharedStorage: [ns]` in both manifests + `storage.shared`
      capability grant; `ks.storage.shared(ns)` backed by `mod_storage` rows under a
      reserved namespace; per-namespace quotas. Effort: M.
- [ ] **D5 — Storage quotas + usage.** Per-mod cap for KV keys, value size, table rows,
      settings size; usage API + admin UI; cleanup job. Effort: M.
- [ ] **D6 — Export/import mod data.** JSON export of settings, KV, shared KV (with
      permission), table schema/data; import for migration/backup. Effort: M.
- [ ] **D7 — Backup integration.** Include mod data in panel backup/restore; restore
      order respects FK and schema registry. Effort: M.
- [ ] **D8 — Secret rotation.** Rotate password settings and mod-owned secrets without
      reinstall; audit each rotation. Effort: S.

### 4.4 Runtime and integrations (P1)

- [ ] **R1 — Vendored JS deps / `require` (M11).** CommonJS subset: `module.exports`,
      `exports`, cache per activation, `.js` + `.json`, path-jailed to workdir; missing
      module throws with a redacted path; document esbuild bundling into `vendor/`.
      Effort: L.
- [ ] **R2 — Timers and cron (M12).** `ks.timers.setTimeout/setInterval/clear`; optional
      `ks.schedule.cron`; min interval 250 ms, max 64 live timers, serialized VM queue,
      panic recovery, stop on deactivate, no persistence. Effort: L.
- [ ] **R3 — Mod HTTP routes (M13).** `r.Route("/api/mods/v1/ext/{slug}", ...)` with
      `ACCESS_ADMIN_PANEL` in v1; `ks.routes.on(method, path, fn)`; request/response caps
      (1 MiB); per-slug inflight cap; no public unauthenticated routes in v1. Effort: L.
- [ ] **R4 — Custom/inter-mod events (M14).** `ks.events.emit(name, payload)`;
      `mod:<slug>:<name>` post-style; 64 KiB payload cap; max dispatch depth 8; manifest
      `emits` for discoverability; document cross-mod subscription. Effort: M.
- [ ] **R5 — Controlled network.** `ks.http.request({method, url, headers, body})` with an
      egress allowlist declared in the manifest + approved capability; SSRF guard (public
      IPs only, DNS-pinned, no redirects to private ranges), size/time caps, no raw
      sockets, audit every host. Effort: XL.
- [ ] **R6 — WebSocket/SSE.** `ks.ws.connect(url)` / `ks.stream.*` for live dashboards;
      egress rules apply; per-mod connection cap; auto-close on deactivate. Effort: L.
- [ ] **R7 — Background jobs.** `ks.jobs.enqueue(name, payload)`, retries/backoff,
      idempotency keys, dead-letter, admin view, quotas; jobs survive panel restart only
      if persisted (define which). Effort: XL.
- [ ] **R8 — Out-of-process worker (optional).** Heavy/long-running mods run in a separate
      signed process with RPC and the same capability model; Goja remains the default.
      Effort: XL.
- [ ] **R9 — Quotas and circuit breaker.** CPU time, memory, timers, routes, jobs, DB
      rows, storage, network, concurrency; per-mod breaker; admin dashboard. Effort: L.
- [ ] **R10 — Console output subscription.** `ks.console.onOutput(instanceId, fn)` with
      backpressure and redaction; keep `ks.console.send` guard. Effort: M.
- [ ] **R11 — Typed assets API.** `ks.assets.list/read` for files shipped in the package;
      path-jailed, size-capped. Effort: S.
- [ ] **R12 — Notification hooks.** `ks.notify.send(...)` through the panel notification
      system with a declared capability; rate-limited. Effort: M.

### 4.5 UI composition (P1)

- [ ] **U1 — Expand the slot catalog.** Add at least: `dashboard.sidebar`,
      `instance.detail.sidebar`, `node.detail.tabs`, `user.detail.tabs`,
      `template.detail.tabs`, `theme.studio.tabs`, `settings.tabs`, `security.tabs`,
      `database.tabs`, `stacks.detail.tabs`, `activity.cards`. Effort: L.
- [ ] **U2 — Typed slot context contracts.** Per-slot TypeScript types + runtime
      validation; document in `shared/types/mod.ts`, `models/mod.go`, `aiskills/mods.md`.
      Effort: M.
- [ ] **U3 — Table column injection.** Manifest `tableColumns: [{table, key, label,
      render}]`; allowlist tables (instances, nodes, users, templates, mods, applications);
      one owner per column; sortable/filterable contract. Effort: L.
- [ ] **U4 — Controlled host page replacement.** Manifest `replace: [{target, component}]`
      with an explicit allowlist, one owner, permission check, fallback to host component,
      and a global admin kill switch. Never allow arbitrary core replacement. Effort: XL.
- [ ] **U5 — Component override registry.** Named host components with a versioned
      contract; conflict detection; preview; rollback. Effort: L.
- [ ] **U6 — Nav/menu contributions.** Sidebar groups, header actions, instance tabs,
      "more" menus; `props.title/icon/order/permission`; no duplicate keys. Effort: M.
- [ ] **U7 — Dashboard widgets.** Size, order, refresh interval, permission, empty/error
      states; reuse `dashboard.cards` or add a dedicated widget slot. Effort: M.
- [ ] **U8 — Per-role/per-user visibility.** `requiredPermission`, `surface`
      (`admin|user|instance`), and per-slot gating; fail closed. Effort: M.
- [ ] **U9 — Mod design system.** Shared UI kit + theme tokens (`var(--ks-*)`), no hardcoded
      colors, mobile/responsive rules, dark/light parity, documented in the SDK. Effort: M.
- [ ] **U10 — Slot telemetry + auto-disable.** Report render errors, bundle load failures,
      slow components; auto-disable a broken bundle after N failures; admin alert. Effort: M.
- [ ] **U11 — Bundle versioning.** Host React globals contract, optional import map,
      compatibility check, cache busting by version/mtime. Effort: M.
- [ ] **U12 — Studio coverage.** Add tabs/editors for deps, tables, routes, timers, events,
      network, scopes, table columns, replacements; validate before save; preview. Effort: L.

### 4.6 Ecosystem and distribution (P1/P2)

- [ ] **E1 — Signed `.kspm`.** SHA-256 + detached Ed25519 (or Sigstore/cosign) signature
      over the package/manifest; trust store; publisher key pinning; unsigned allowed only
      with an explicit dev setting. Effort: L.
- [ ] **E2 — SBOM/provenance.** `sbom.json`, build metadata, dependency inventory,
      reproducible-build notes; verify before activation. Effort: M.
- [ ] **E3 — Registry/marketplace.** New `mods_market/marketplace.json` + `internal/modlib`
      embed + remote fetch (SSRF-guarded) mirroring `pagelib`/`themelib`; catalog UI with
      search/categories/detail/screenshots/install. Effort: XL.
- [ ] **E4 — Update channels.** Stable/beta/dev, version pinning, auto-update policy,
      staged rollout, maintenance windows, "update all". Effort: L.
- [ ] **E5 — Version history/rollback UI.** History tab, diff, restore, audit. Effort: M.
- [ ] **E6 — Dependency resolution from registry.** Resolve `requires` against the catalog,
      produce `mod.lock` with integrity hashes, install missing deps only with approval.
      Effort: L.
- [ ] **E7 — Publisher identity + review.** Verified publishers, signing keys, moderation
      queue, security review checklist, revocation list. Effort: L.
- [ ] **E8 — Private registry / air-gapped.** Custom registry URL + token, offline bundle
      import/export, signed local repo. Effort: M.
- [ ] **E9 — Install counts/ratings.** Opt-in telemetry, privacy-respecting counts, ratings
      and reviews (or defer if moderation cost is too high). Effort: L.
- [ ] **E10 — Marketplace security.** Malware scan, permission diff, signature verify,
      quarantine, revoke, advisory feed. Effort: L.
- [ ] **E11 — Import bridge (optional).** Import a Pterodactyl v2/Pelican plugin as a
      manifest skeleton where semantics map; never execute PHP. Effort: XL.
- [ ] **E12 — Offline package repository.** Directory-based local catalog for hosts with no
      outbound network. Effort: M.

### 4.7 Developer experience (P1)

- [ ] **X1 — `kspanel mod init`.** Scaffold manifest, backend script, frontend bundle,
      settings, tests, README, `.gitignore`, sample hook/slot. Effort: M.
- [ ] **X2 — `kspanel mod pack|validate|lint`.** Validate schema/deps/signature/size,
      produce `.kspm`, print a permission summary. Effort: M.
- [ ] **X3 — `kspanel mod dev`.** Local sandbox + fake host ops + hot reload on file
      change; `KSPANEL_MOD_DEV=1` poll mtime (no fsnotify dependency) or fsnotify if
      already present. Effort: L.
- [ ] **X4 — `modtest` harness.** Exported `Harness` wrapping the tagged runtime with
      `FakeOps` (promote `hostbindings_test.go` fake), seed grants, emit events, assert
      logs/storage/settings/routes. Effort: L.
- [ ] **X5 — TypeScript SDK.** `@kspanel/mod-sdk` with types for `ks`, manifest, slots,
      events, settings, routes, timers, jobs, tables; JSDoc examples. Effort: L.
- [ ] **X6 — Local UI emulator.** Render slots with host React globals and mock slot
      contexts; test bundles without a panel. Effort: M.
- [ ] **X7 — Documentation.** Complete authoring guide, API reference, security guide,
      upgrade/migration guide, recipes, troubleshooting. Effort: L.
- [ ] **X8 — Sample gallery.** At least 10 samples: settings, secrets, DB, files, exec,
      slots, screen, routes, timers, events, table, shared KV, signed package. Effort: M.
- [ ] **X9 — CI template.** GitHub Action to validate, test, pack, sign, publish to a
      registry. Effort: S.
- [ ] **X10 — Debug console.** Panel UI to evaluate JS in a mod's sandbox, inspect storage/
      settings/logs/timers/routes, and replay events. Admin-only, audited. Effort: L.

### 4.8 Observability and governance (P1)

- [ ] **O1 — Per-mod metrics.** Hook count/duration/errors, VM memory, timer ticks, route
      requests, DB queries, storage bytes, job failures. Effort: L.
- [ ] **O2 — Structured logs.** Levels, redaction, export, retention, per-mod ring beyond
      200 lines with a configurable cap. Effort: M.
- [ ] **O3 — Audit everything.** Install, update, grant, revoke, activate, deactivate,
      settings write, route call, DB write, table create/drop, secret reveal, kill switch.
      Effort: M.
- [ ] **O4 — Health + crash-loop detection.** Health endpoint per mod, failure counters,
      auto-disable, last-known-good, admin alert. Effort: M.
- [ ] **O5 — Quotas dashboard.** Usage vs limits, top consumers, alert thresholds. Effort: M.
- [ ] **O6 — Approval workflow.** Permission diff, expiry, re-approval, bulk approve, audit,
      reason field. Effort: M.
- [ ] **O7 — Policy engine.** Per-role policy: allow unsigned (dev only), egress allowlist,
      capabilities, surfaces, table access; policy-as-code export. Effort: L.
- [ ] **O8 — Sandbox escape monitoring + CVE process.** Goja version tracking, advisory
      subscription, fuzz targets, incident runbook. Effort: L.
- [ ] **O9 — Inventory/SBOM view.** Installed mods, versions, signatures, deps, permissions,
      tables, routes, storage, last update. Effort: M.
- [ ] **O10 — Granular kill switch.** Global, per-mod, per-capability, scheduled disable,
      emergency quarantine. Effort: M.

### 4.9 Platform integration (P2)

- [ ] **I1 — Instance Pages.** Mod-provided blocks/components/actions, shared KSPageSDK,
      one render path. Effort: L.
- [ ] **I2 — Themes.** Mod theme tokens/partials, theme marketplace integration, no CSS
      injection outside tokens. Effort: M.
- [ ] **I3 — Applications.** Mod-provided app templates and run hooks. Effort: M.
- [ ] **I4 — Stacks.** Mod-provided stack templates/sidecar hooks. Effort: L.
- [ ] **I5 — Automation.** Mod events as triggers, mod actions as steps, scheduler
      integration. Effort: L.
- [ ] **I6 — AI assistant.** Mod docs topics, read-only tools first, write tools behind
      approval, AI-assisted mod authoring/validation. Effort: L.
- [ ] **I7 — Notifications.** Mod notification channels/providers, per-user prefs. Effort: M.
- [ ] **I8 — Templates.** Mod-contributed template pages/actions/controls. Effort: M.
- [ ] **I9 — Edge/node.** Node events, per-node grants, declarative edge actions only (no
      untrusted code on edge). Effort: L.
- [ ] **I10 — Fleet.** Install/update mods across nodes or per-node activation where it
      makes sense; global mods stay panel-global by default. Effort: L.

### 4.10 Hardening and verification (P0/P1)

- [ ] **V1 — Sandbox escape suite + fuzzing.** Goja bindings, path traversal, SQL guard,
      JSON/array limits, interrupt/timeout, panic recovery, require loader, routes.
      Effort: L.
- [ ] **V2 — Race/concurrency tests.** `-race`, hook timeouts, timer queue, activate/
      deactivate races, concurrent grant edits, engine disable. Effort: M.
- [ ] **V3 — Multi-DB migration tests.** MySQL/Postgres/SQLite, upgrade from v1/v2,
      idempotent DDL, table registry. Effort: L.
- [ ] **V4 — E2E Playwright.** Install -> approve -> activate -> slot renders -> route ->
      timer -> update -> rollback -> uninstall. Effort: L.
- [ ] **V5 — Performance benchmarks.** 100 mods, 1,000 hooks, 100 timers, bundle load,
      route throughput, DB query caps. Effort: M.
- [ ] **V6 — Supply chain.** `go mod verify`, `npm ci`, signature verify, SBOM, pinned
      deps, secret scan. Effort: M.
- [ ] **V7 — Threat model.** Update `docs/THREAT_MODEL.md` for every new surface (routes,
      network, tables, timers, workers, marketplace, signing). Effort: M.
- [ ] **V8 — Compatibility tests.** Panel/engine/SDK versions, v1/v2/v3 manifests,
      dependency constraints. Effort: M.
- [ ] **V9 — Backup/restore + data migration tests.** Mod data, tables, settings, secrets.
      Effort: M.
- [ ] **V10 — Failure injection.** Crash, OOM, timeout, disk full, corrupt package,
      bad signature, registry outage. Effort: M.

---

## 5. Milestones

### Milestone 1 — Foundation (target v1.1)

Scope: H1-H7, L1-L2, D1, R1-R4, X1-X2, O1-O4, V1-V3.

Exit criteria:

- `plan/mod.md` M7-M14 either closed or explicitly re-scoped; no stale status rows.
- `requires{}` works end-to-end: install, validate, topo load, cycle, blocked diagnostics.
- Typed settings have at least `global` + `instance` scopes.
- `require`, timers, HTTP routes and custom events have tests and docs.
- Scaffold + pack + validate commands work on a clean machine.
- Sandbox escape/fuzz/race/multi-DB tests are green.
- `bash rebuild.sh` passes.

### Milestone 2 — Ecosystem (target v1.2)

Scope: E1-E6, L3-L4, U1-U2, X5-X9.

Exit criteria:

- `.kspm` signing + verification + trust store.
- Registry/marketplace catalog with search/detail/install.
- Update channels + permission diff + re-approval.
- Version history + rollback E2E.
- Dependency resolution + lockfile.
- TypeScript SDK + CI template + sample gallery.
- A signed sample mod installs, updates and rolls back in a Playwright test.

### Milestone 3 — Power (target v1.3)

Scope: D2-D4, R5-R9, U3-U8, O5-O7, I1-I5.

Exit criteria:

- Owned tables + migrations on all three DBs.
- Shared KV + quotas.
- Controlled network/WebSocket/jobs.
- Table columns, nav contributions, per-role visibility.
- Policy engine + quotas dashboard.
- Automation/instance-pages/applications/stacks integration points.
- Capability matrix parity with Ptero v2/Pelican (except full trust).

### Milestone 4 — Everything (target v2.0)

Scope: R8, E7-E12, I6-I10, U9-U12, X10, V4-V10.

Exit criteria:

- Optional out-of-process worker for heavy mods.
- Verified publishers + moderation + revocation + private/offline registry.
- AI-assisted authoring and read-only AI tools; write tools behind approval.
- Full E2E, performance, failure-injection and supply-chain gates.
- `docs/vs/mod.md` re-scored at 95+ with no P0 gap.
- Security sign-off on the expanded threat model.

---

## 6. "Best mod system" capability contract

A mod system is "best and able to do everything" when all of the following are true.
This is the acceptance checklist for v2.0.

| # | Capability | Required outcome |
|---|---|---|
| 1 | Manifest | Versioned, validated, dependency-aware, compatible-aware |
| 2 | Packaging | Signed, checksummed, SBOM, reproducible, offline-installable |
| 3 | Install paths | File, URL, Studio, JSON, sample, registry, private registry |
| 4 | Lifecycle | Install, approve, activate, deactivate, update, rollback, uninstall |
| 5 | Dependency graph | `requires`, `provides`, `conflicts`, topo load, cycles, lockfile |
| 6 | Sandbox | Per-mod VM, no host OS, 5s hook cap, panic isolation |
| 7 | Capabilities | Declared, approved, per-call, revocable, auditable |
| 8 | Pre-hooks | Ordered, cancellable, 409 veto, clear message |
| 9 | Post-hooks | Async, non-blocking, broad event coverage |
| 10 | Custom events | Inter-mod emit/subscribe, loop protection |
| 11 | Settings | Typed, scoped, encrypted secrets, admin UI, binding |
| 12 | Data | Namespaced KV, shared KV, owned tables, migrations, quotas |
| 13 | DB access | Guarded read/write, table allowlist, row caps |
| 14 | Files/exec | Instance-scoped, capability-gated, edge-mediated |
| 15 | Network | Controlled egress, SSRF guard, size/time caps |
| 16 | Timers/jobs | Timers, cron, queue, retries, dead-letter, quotas |
| 17 | HTTP routes | Namespaced, admin-authenticated, caps, rate limits |
| 18 | WebSocket/SSE | Live streams with connection caps |
| 19 | UI slots | Broad catalog, typed contexts, error boundaries |
| 20 | UI replacement | Table columns, component/page override with one-owner |
| 21 | Nav/screens | Sidebar/header/tabs, deep links, permissions |
| 22 | Marketplace | Search, categories, detail, install, updates, rollback |
| 23 | Trust | Signatures, publisher identity, review, revocation, SBOM |
| 24 | Updates | Channels, pinning, permission diff, staged rollout |
| 25 | DX | Scaffold, pack, validate, dev, hot reload, test harness, SDK |
| 26 | Docs | Authoring, API, security, migration, recipes, samples |
| 27 | Observability | Logs, metrics, health, audit, inventory |
| 28 | Governance | Ownership, roles, policy, quotas, kill switch |
| 29 | Compatibility | v1/v2/v3 manifests, panel/engine/SDK matrix, multi-DB |
| 30 | Hardening | Fuzz, race, E2E, performance, supply chain, threat model |

---

## 7. Security model for the expanded system

### 7.1 Trust levels

| Level | Package | Allowed by default | Requirements |
|---|---|---|---|
| Built-in | Shipped samples/built-ins | Yes | Reviewed in-tree |
| Verified | Signed by a verified publisher | Yes, after capability approval | Signature + SBOM + review |
| Community | Signed by any publisher | Yes, with warning + approval | Signature + permission diff |
| Unsigned | No signature | Dev only | Explicit `allow_unsigned` setting |
| Quarantined | Revoked/suspicious | No | Admin override + audit |

### 7.2 Package verification pipeline

1. Fetch package with SSRF guard and size/time caps.
2. Verify SHA-256 against the manifest/registry entry.
3. Verify detached signature against the publisher key/trust store.
4. Verify SBOM/provenance (when present).
5. Validate manifest schema, dependencies, capabilities, slots, routes, tables.
6. Diff permissions against the installed version.
7. Show the admin a review screen; require approval for new grants.
8. Extract to a per-mod workdir with zip-slip/symlink guards.
9. Activate only after all capabilities are granted.
10. Audit every step.

### 7.3 Runtime isolation

- Goja remains the default. No `require`, `os`, `process`, raw file/network, or host OS.
- All host effects go through capability-gated bindings.
- Every binding call re-checks the grant snapshot.
- Hooks, timers, routes, jobs share a serialized per-mod queue with timeouts.
- Optional out-of-process worker for heavy mods; same capability RPC, no extra trust.
- No untrusted code on edge nodes; edge work goes through existing allow-listed
  page-action/exec APIs.

### 7.4 Data isolation

- `mod_storage` keyed by slug; shared KV only with declared namespace + capability.
- Owned tables forced to `mod_<slug>_<name>`; SQL guard enforces the prefix.
- Settings scoped and encrypted; secrets never returned by the API.
- Per-mod quotas prevent one mod exhausting panel resources.
- Export/import and backup include mod data only with explicit admin action.

### 7.5 UI isolation

- Slots render inside host React with per-component error boundaries.
- No direct DOM access to host internals; only the documented slot contract.
- Replacement/override requires an explicit manifest contract + one owner + permission.
- Bundle load failures are isolated and auto-disable the bundle.
- Theme changes only through documented tokens.

### 7.6 Supply chain and incident response

- Pinned dependencies, `go mod verify`, `npm ci`, signature verification.
- SBOM + provenance for mods and panel.
- Revocation list + advisory feed.
- Kill switch (global/per-mod/per-capability) + quarantine.
- Rollback to last-known-good.
- Audit trail for every security-relevant action.

---

## 8. Compatibility and migration

- Keep v1 and v2 manifests working. Add v3 fields as optional; require
  `engineVersion: 3` (or `apiVersion: 3`) only for new surfaces.
- Never edit a shipped migration. New migrations start at **083** (081 settings, 082
  remove-seeded-applications are shipped). Add every new migration to MySQL, PostgreSQL and
  SQLite in the same item.
- Provide `kspanel mod migrate` to upgrade a v2 manifest to v3 and to rewrite package
  metadata.
- Keep `Mod Engine v2` semantics for existing rows; new engine behavior is opt-in.
- Deprecation policy: announce, warn for one minor release, then remove with a migration
  guide.
- `docs/vs/mod.md` must be re-scored after each milestone; a row moves only when the code
  ships.
- `map.md` must be updated when new main parts appear (`mods_market/`, `internal/modlib/`,
  `modengine/modtest/`, worker package, SDK package).

---

## 9. Non-goals (deliberate)

1. Core-file patching (Pterodactyl v1/Blueprint). It breaks on updates and cannot be
   security-reviewed.
2. Arbitrary PHP/Composer execution inside the panel process (Pterodactyl v2/Pelican).
3. Unrestricted DB/ORM access or plugin-created migrations outside the registry.
4. Unrestricted host OS access from JS.
5. Unauthenticated public mod HTTP routes by default.
6. Silent auto-updates that add capabilities without re-approval.
7. Running untrusted mod code on edge nodes.
8. Replacing host pages without an explicit, versioned contract.
9. Game-mod managers (Modrinth/CurseForge) inside instances; that is a separate feature.
10. A paid/closed marketplace that would compromise the OSS trust model.

---

## 10. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Manifest versioning | Extend v2 vs `apiVersion: 3` | Add `apiVersion: 3`, keep v2 parser |
| 2 | Worker runtime | Goja only vs optional out-of-process | Optional worker in v2.0, Goja default |
| 3 | Signing | Ed25519 detached vs Sigstore keyless | Ed25519 for self-hosted, Sigstore optional |
| 4 | Marketplace hosting | Official only vs official + community | Official index + community registries |
| 5 | Reviews/ratings | Build vs defer | Defer until moderation capacity exists |
| 6 | Per-user mods | Admin-only vs user surfaces | Start admin-only; add `surface` with permissions |
| 7 | Edge code | Never vs declarative actions only | Declarative actions only |
| 8 | Auto-update | Off vs opt-in per mod | Opt-in per mod + channels + permission diff |
| 9 | Table drops | Keep vs drop on uninstall | Keep by default; explicit admin drop |
| 10 | Shared KV | Build vs remove capability | Build (M14), it is a real gap |

---

## 11. Definition of Done for every item

Every backlog item must satisfy the repo rules (`loop.md`) and these extra gates:

1. Backend: `cd panel/backend && go build ./... && go build -tags modengine_goja ./... && go test ./... && go test -tags modengine_goja ./...`
2. Frontend: `cd panel/frontend && npm run typecheck && npm run lint && npm run build`
3. Edge (if touched): `cd edge/backend && go build ./... && go test ./...`
4. Migration (if any): verified on SQLite, PostgreSQL and MySQL; added to all three
   dialects; no shipped migration edited.
5. Tests: unit + integration + race where concurrency is involved; E2E for user-visible
   flows; fuzz/security test for new host surfaces.
6. Docs: `docs/vs/mod.md`, `plan/mod.md` (status), `aiskills/mods.md` (size cap + Topics
   sync + `TestAIDocsCoverage`), `docs/THREAT_MODEL.md` (new trust surface),
   `docs/BUILD_SECURITY.md` (supply chain/signing), `map.md` (new main parts).
7. No dead code, no TODO/FIXME/debug prints, no swallowed errors.
8. `bash rebuild.sh` passes with real output.
9. If the change touches security/auth/migrations/API contracts/multiple parts, run PASS 2
   per `loop.md` §5.
10. Honest report: what was verified, what was not, and why.

---

## 12. Sources read

Repo:

- `loop.md`, `map.md`, `AGENTS.md`
- `plan/mod.md`
- `docs/vs/mod.md`
- `docs/vs.md`
- `docs/vs/template.md` (comparison style only)
- `docs/THREAT_MODEL.md`
- `docs/BUILD_SECURITY.md`
- `docs/application.md` (boundary between Applications and Mods)
- `panel/backend/internal/models/mod.go`, `models/modver.go`
- `panel/backend/internal/modengine/engine.go`, `eventbus.go`, `sandbox.go`,
  `hostops.go`, `pkgstore.go`, `runtime.go`, `runtime_noop.go`, `settings.go`,
  `storage.go`, `status.go`, `hostbindings_test.go`, `settings_bindings_test.go`,
  `sqlguard_test.go`, `sandbox_interrupt_test.go`, `ui_bundle_test.go`
- `panel/backend/internal/repository/mod_repo.go`, `mod_settings_repo.go`
- `panel/backend/internal/api/handlers/mod_handler.go`, `mod_events.go`,
  `mod_hostops.go`, `mod_settings_handler.go`, `mod_samples.go`
- `panel/backend/internal/api/server.go` (mods routes + slots/assets)
- `panel/backend/internal/db/migrations/{mysql,postgres,sqlite}/017_mods`,
  `020_mod_v2`, `027_mod_source`, `036_mod_package`, `081_mod_settings`
- `panel/backend/internal/permissions/keys.go` (MODS_* keys)
- `panel/backend/mod_samples/hello-slot/`
- `panel/frontend/src/features/mods/` (Mods, ModDetail, ModStudio, ModScreen,
  ModStats, ModSchedules, ModSettingsCard, presets, API)
- `panel/frontend/src/shared/components/ui/Slot.tsx`
- `panel/frontend/src/shared/components/layout/Sidebar.tsx`
- `panel/frontend/src/shared/types/mod.ts`
- `panel/frontend/src/app/router.tsx`
- `panel/backend/internal/aiskills/mods.md`

External comparison sources (as recorded in `docs/vs/mod.md`):

- Pterodactyl v2.0.0-beta.2 (14 Oct 2026), SDK 2.0.0-beta.6, extension docs.
- Pterodactyl v1.15.1 (12 Aug 2026) + Blueprint; Blueprint ceased operations Oct 2026.
- Pelican v1.0.0-beta37; plugin docs; `hub.pelican.dev/plugins`.
- PufferPanel v3.0.9 (no plugin system).
- AMP (CubeCoders) commercial panel, plugin/addon API (qualitative; closed core).

---

## 13. Suggested execution order

1. H1-H7 (truth + schema foundation).
2. L1-L2 (dependency graph + activation rules) — closes the oldest honest gap.
3. R1-R4 (require, timers, routes, custom events) — closes the runtime gap.
4. D1 (scoped settings) then D2-D4 (schema, query layer, shared KV).
5. U1-U6 (slot catalog, table columns, controlled replacement, nav).
6. E1-E6 (signing, registry, updates, rollback, dependency resolution).
7. X1-X10 (scaffold, pack, dev, harness, SDK, docs, samples, CI, console).
8. O1-O10 (observability, quotas, policy, kill switch).
9. I1-I10 (platform integration).
10. R5-R9 (network, WebSocket, jobs, worker, quotas) — highest risk, do after the
    governance layer exists.
11. V1-V10 continuously, not at the end.

Keep `docs/vs/mod.md` honest after every item. A capability only counts when the code,
tests, docs and UI all ship.
