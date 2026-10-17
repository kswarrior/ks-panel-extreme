# Mod / Extension System vs — `/mods` Only (honest, Oct 2026, rev 1: Pterodactyl v1 (patch/Blueprint) and v2 beta (native extensions) split into two columns — v1 ships today, v2 is real code but open beta; both counted)

Scope: panel-side mod/extension/plugin systems only — install, lifecycle, sandbox, capabilities,
hooks, storage, UI injection, ecosystem, tooling. Game-mod managers (Modrinth/CurseForge inside a
server) are deliberately out of scope; this compares how each panel extends *itself*. No standalone
feature tour.

Panels + latest checked: `KS` (this repo, Mod Engine v2, master @ Oct 2026) vs `Pterodactyl v1.15.1 (12 Aug 2026, stable, 9.2k★ — no native system, community Blueprint patches are the de-facto, Blueprint ceased operations with Pterodactyl Oct 2026, security-only updates, team moving to the Hydrodactyl fork)` vs `Pterodactyl v2.0.0-beta.2 (14 Oct 2026, open beta, SDK 2.0.0-beta.6)` vs `Pelican v1.0.0-beta37 (plugin system marked "still in development", live Hub marketplace)` vs `PufferPanel v3.0.9 (no plugin system — templates/themes only; v2-era "scales" plugins are gone)`.

## 1. Shape vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Unit | `Mod` row + `.kspm` package, or manifest-only JSON | addon that patches panel core files at install | `Extension` (`.pteroext` zip + `extension.json`) | `Plugin` folder/zip (`.json` manifest + PHP class) | none (templates + themes only) |
| Manifest | v2 rich manifest: `engineVersion`, `permissionsRequested[{capability, access_level}]`, `hooks{pre,post}`, `slots`, `customPermissions`, `spec.pages`; v1 static manifest kept for legacy rows (`models/mod.go:39`) | patch definitions, no typed schema in core | `id/name/version/requires{panel,sdk,php}/provider/autoload/ui{entry,mode,prefix,screens}` | `plugin.json` (`id`, `namespace`, `class`, `panels`, `panel_version`, `composer_packages`, `update_url`) | — |
| Runtime | per-mod sandboxed Goja JS VM — **only when built with `-tags modengine_goja`**; stock `rebuild.sh` links the noop runtime (`runtime_noop.go`, `rebuild.sh:354`), so a stock build is JSON/manifest-only | PHP executed in the panel process after patching core | PHP/Laravel service provider in-process | PHP/Laravel service provider + Filament plugin; composer deps auto-installed | — |
| Version axis | per-row `engine_version` 1|2; panel-wide engine toggle | panel-version coupled; updates break addons | `requires{}` + dependency graph + topological load; one-owner-per-component conflict rule | `panel_version` (`^` = minimum) + load order; incompatible plugins marked and skipped | — |

## 2. Install / package vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Paths | multipart file, URL (SSRF-guarded: public IPs only, DNS-pinned, 15s/64 MiB), Mod Studio, raw JSON, builtin samples (`server.go:578`) | manual upload of patcher, mutates core | Admin → Extensions upload + `php artisan p:extension:install` | plugin list Import button or `plugins/` folder + `p:plugin:install` | — |
| Size cap | 64 MiB (`.kspm`, zip-slip guarded, symlinks skipped) | none documented | 50 MB (`.pteroext`) | none documented | — |
| 1-click catalog | 4 builtin samples — Event Logger, Destroy Guard, Permission Probe, Hello Slot (`mod_samples.go`) | community addon sites | official `pterodactyl/extensions` repo | plugins repo + Hub marketplace | — |
| Signature / trust | none — honest minus (no signing, no review process) | none | dependency/version checks only; no signing | composer resolution + `update_url`; no signing | — |

## 3. Lifecycle vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Enable | `POST /{id}/activate` — **refuses until every requested capability is granted** (unique gate), spins the runtime, installs hooks/slots | install = patch now, no toggle | `p:extension:enable` / admin toggle; migrations run under `ext_` prefix; failed enable keeps previous state | install/enable via admin list, update job | — |
| Disable | `POST /{id}/deactivate` tears the runtime down, drops hooks/slots (`mod_handler.go:1032`); row/grants survive | uninstall = restore core (blueprint uninstall) | `p:extension:disable` | disable in list | — |
| Kill switch | panel-wide `PUT /api/mods/engine` persisted in settings KV + `SetEnabled(false)` stops all runtimes; per-mod engine v1/v2 | none (core mutation) | `PTERODACTYL_EXTENSIONS_ENABLED` env | not documented | — |
| Compat graph | none between mods (honest minus); engine_version only | none | full `requires{}` + topo load + component ownership conflicts | `panel_version` + composer | — |

## 4. Isolation / sandbox vs (the big one)

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Model | per-mod VM; host surface only through granted bindings (`ks.db`, `ks.files`, `ks.exec`, `ks.container`, `ks.vm`, `ks.console`, `ks.permissions`, `ks.capabilities`) — each checked per call against the mod's grants; 5s hook timeout; panics recovered, mod flagged broken, panel unaffected (Error Isolation) | none — patched core runs with full panel access | **none** — docs state extensions "run with the same access as the Panel and can read your database, settings, and users' data" | none — Laravel service provider, full app access + composer execution | — |
| Honest minus | capability grants enforced per call (sandbox bindings + host-side SQL re-validation), custom perms persisted and grant-gated, **but** no signing, no marketplace/update path, no mod-to-mod dependency graph/version constraints | ecosystem now EOL (Oct 2026), patching breaks on updates | beta; arbitrary PHP is a feature to some and a blast radius to others | beta plugin system, same trust model as Ptero v2 | — |

## 5. Capabilities / permissions vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Declaration | `permissionsRequested`: capability + access level (`db.read_only|read_write`, `filesystem`, `terminal`, `container.control`, `vm.control`, …); unknown codes rejected at upload (`mod_repo.go:159`) | none | `registerPermissions` at runtime | `Role::registerCustomPermissions` / `Subuser::registerCustomPermissions` | — |
| Approval | per-capability `granted` rows seeded on install; activation blocked until admin approves each (`PUT /{id}/grants`) | none | none — permissions appear in roles/subuser editors after install | none — permissions appear after install | — |
| Panel-side RBAC | `MANAGE_MODS` umbrella + `MODS_VIEW/CREATE/EDIT/DELETE` + `MODS_OWN/ALL` ownership scoping | admin-only addons | admin extension management | admin plugin resource | — |

## 6. Events / hooks vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Pre-hooks | **cancellable, ordered** — a pre-hook can veto the action, HTTP request gets `409 "blocked by a mod"` (`EmitPre`, `instance_handler.go:2792`) | core-patch dependent, no contract | not documented (no veto) | not documented | — |
| Post-hooks | concurrent, async, fire-and-forget (`EmitPost:2916`) | core-patch dependent | `listenToServerOperations` — provision/install/reinstall/backup, post-commit only | Laravel listeners | — |
| Wired events | instance lifecycle (`pre:/post:instance.{start,stop,kill,destroy,restart}`), deploy/reinstall (`pre:/post:instance.deploy|reinstall`), install completion (`post:instance.install`), files (`pre:/post:file.{write,delete,upload}`), backups (`pre:/post:backup.{create,restore,delete}`), console (`pre:/post:console.command`, `post:console.output`), login (`post:user.login`) | — | server operations set above | Filament/Laravel hooks | — |

## 7. Data / storage vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Data access | namespaced KV only (`mod_storage(mod_slug,key,value JSON)`, FK cascade) via `ks.storage` | full DB once core patched | full DB/ORM; migrations on enable (`ext_` prefix) | full DB; auto-registered migrations | — |
| Settings | mod `spec` blob + KV; no secretbox tier for mods | none | typed settings (text/password/number/toggle/select), `forUser/forServer` scopes, secrets encrypted, never sent to frontend | plugin settings page (`HasPluginSettings`) | — |
| DB engines | SQLite/Postgres/MySQL (mod tables triplicated across dialects) | MySQL | MySQL | MySQL/Postgres | — |

## 8. UI composition vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Injection | slot registry `GET /api/mods/v1/slots` + `window.KS.registerComponent` + React `<Slot>` with per-component ErrorBoundary + asset route `/api/mods/v1/assets/{slug}/*`; Studio declares slots + `spec.pages` | themes + patched templates | `slots.register` (`server.console.before`, screens, tabs, table columns, component replacement w/ one-owner rule), Tailwind prefix requirement, per-slot error boundaries | native Filament resources/pages/widgets per panel (admin/app/server), views, translations | themes only |
| Honest minus | registry + `<Slot>` component exist but **no host mounts are wired yet** and there is no auto bundle loader (`bundle` endpoint absent) — slots cannot render in the shipped UI today | core-file patching | beta, SDK churn | beta | — |

## 9. Ecosystem / distribution vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Distribution | manual `.kspm`/URL sharing only — **no marketplace, no update checks** (honest minus) | Blueprint addon sites; framework ceased operations Oct 2026 | official extensions repo + paid marketplace (third-party) | **live Hub marketplace** (`hub.pelican.dev/plugins`; official + community; free while beta), plugins repo | — |
| State of ecosystem | 4 samples, young | frozen/EOL, team -> Hydrodactyl | open beta, not production; v1 gets security fixes only | most live of the PHP panels, still beta | none |

## 10. Developer workflow / diagnostics vs

|  | KS | Ptero v1 (+Blueprint) | Ptero v2 | Pelican | Puffer |
|---|---|---|---|---|---|
| Authoring | Mod Studio: 8 tabs (Meta, Permissions, Slots, Hooks, Backend script, Custom perms, Spec, Raw JSON) + presets (`modStudioPresets.ts`) | write patches | docs + SDK packages | `p:plugin:make` scaffold, structure mirrors Laravel/Filament | — |
| Diagnostics | engine status (mode, enabled), per-slug bounded log ring, `GET /{id}/logs`, kill switch UI | none | admin extension list | plugin status/incompatibility flags, load order | — |
| Honest minus | no scaffold command, thin docs (5-line AI skill page), no dev hot-reload, no unit-test harness for mods | — | beta docs | — | — |

## 11. Verdict vs (honest)

- **KS vs all on safety-shaped power**: only system with any isolation at all (per-mod JS VM, host access only through granted + per-call-enforced bindings), only one with an *approval gate before activation*, only one with cancellable pre-hooks (409 veto), typed capability+access-level declarations, custom perms persisted and grant-gated, per-slug KV isolated per mod, error isolation (a crashing mod cannot take the panel down), multi-DB, ownership scoping, kill switch, SSRF-guarded URL install, Mod Studio authoring. Paid for with the smallest ecosystem, slots not yet mounted, no marketplace/update path, no mod-to-mod dependency graph/version constraints, no signing.
- **Ptero v2 vs KS on raw power**: in-process PHP can do anything — DB reads/writes, migrations, composer deps, deep UI replacement (screens/tabs/columns), dependency graph, official repo, paid marketplace reach. That is also the weakness: no sandbox, no grant gate, post-commit-only events, beta. On any given *capability* ask, v2 can usually out-do KS; on *governed capability* KS out-does v2.
- **Ptero v1/Blueprint**: the only reason 1.x had extensions; community framework now ceased operations with Pterodactyl (Oct 2026), security-only updates, migration path is the Hydrodactyl fork — anything built there is a dead end. v1's extension story scores accordingly.
- **Pelican vs KS**: the strongest live ecosystem today (Hub marketplace, scaffold command, Filament-native UI, official+community plugins) and same trust model as Ptero v2 (no sandbox, no veto). Beats KS on ecosystem and event/UI breadth; loses on isolation, approval gate, veto hooks and diagnostics.
- **PufferPanel vs KS**: no plugin system at all in v3 — templates and themes only; not a competitor in this category.

## 12. Scores (`/100` per case, honest)

| # | Case | KS | Ptero v1 | Ptero v2 | Pelican | Puffer |
|---|------|----|----------|----------|---------|--------|
| 1 | Manifest / schema | 88 | 30 | 85 | 80 | 10 |
| 2 | Packaging / install | 85 | 35 | 80 | 85 | 10 |
| 3 | Lifecycle / enable / disable | 88 | 40 | 85 | 80 | 5 |
| 4 | Isolation / sandbox | 85 | 5 | 12 | 12 | 5 |
| 5 | Capability / permission model | 92 | 15 | 78 | 75 | 10 |
| 6 | Events / hooks | 80 | 30 | 82 | 72 | 5 |
| 7 | Data / storage | 82 | 60 | 88 | 85 | 5 |
| 8 | UI injection | 75 | 55 | 88 | 90 | 30 |
| 9 | Ecosystem / distribution | 25 | 20 | 82 | 88 | 5 |
| 10 | Developer tooling | 82 | 25 | 80 | 85 | 5 |
| 11 | Diagnostics / kill switch | 90 | 30 | 75 | 70 | 5 |
| 12 | Governance / ownership | 90 | 30 | 72 | 70 | 5 |
| 13 | Multi-DB | 95 | 60 | 60 | 80 | 20 |

### Total

| Rank | Panel | Sum | Final `/100` |
|------|-------|-----|--------------|
| **1** | **KS** | **1,057 / 1,300** | **81** |
| 2 | Pelican | 972 / 1,300 | 75 |
| 3 | Pterodactyl v2 (beta) | 967 / 1,300 | 74 |
| 4 | Pterodactyl v1 (+Blueprint) | 435 / 1,300 | 33 |
| 5 | PufferPanel | 120 / 1,300 | 9 |

Case 4 alone decides the shape: every PHP panel scores full-trust by design (documented, not an
accident), so KS's only structural loss is *ecosystem* (case 9) and the not-yet-mounted slots
(case 8). Closing KS's gap is cheap and non-structural: wire host `<Slot />` mounts + bundle
loader, emit a wider event set, persist/enforce custom perms, add a mod scaffold command and a
signed/marketplace path. The PHP panels cannot match the sandbox + approval gate + veto hooks
without a format break.

## 13. Sources

- KS: `panel/backend/internal/modengine/` (`engine.go`, `eventbus.go`, `sandbox.go` — `-tags modengine_goja` — `pkgstore.go`, `storage.go`, `status.go`, `runtime_noop.go`), `models/mod.go:39`, `repository/mod_repo.go:159|518`, `api/handlers/mod_handler.go` (slots `:1059`, assets `:1307`, activate `:976`, teardown `:1032`), `api/server.go:578-609|794-800`, `handlers/instance_handler.go:2792|2916|3000`, migrations `017_mods|020_mod_v2|027_mod_source|036_mod_package` (×3 dialects), `features/mods/pages/ModStudio.tsx` (8 tabs), `modStudioPresets.ts`, `shared/components/ui/Slot.tsx`, `rebuild.sh:354` (build tags), `docs/THREAT_MODEL.md:121`
- Ptero v2: `docs.pterodactyl.io/v2/extensions` (+ `/building`, `/backend`), release `v2.0.0-beta.2` (14 Oct 2026), SDK `2.0.0-beta.6` (announced 5 Oct 2026)
- Ptero v1/Blueprint: panel `v1.15.1` (12 Aug 2026), `blueprint.zip`, `pineriver.net/blog/what-is-happening-to-pterodactyl` (Oct 2026 — Blueprint ceased operations, security-only v1 updates, Hydrodactyl fork)
- Pelican: `v1.0.0-beta37`, `pelican-dev/docs plugins.mdx` (`plugin.json`, `p:plugin:install|make`, "still in development", no sell during beta), `hub.pelican.dev/plugins` (live marketplace), DeepWiki `pelican-dev/panel` PluginService
- Puffer: `docs.pufferpanel.com` 3.x (templates/operators/CEL only — no plugin system; v2 "scales" plugins discontinued)
