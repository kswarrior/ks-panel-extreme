# Mod Engine Plan — items 6-11 + structural gaps

Execution plan for the remaining KS Panel Mod Engine work. Written to be executed one item at a
time in a fresh chat ("read `plan/mod.md`, execute M6", etc.), following the same loop used for
items 1-5 (see Baseline below). Check the box and update the status table as each item lands.

Rules for every item (from the repo: read `loop.md` + `map.md` first, scope discipline):

- Panel backend: `cd panel/backend && go build ./... && go build -tags modengine_goja ./... && go test ./... && go test -tags modengine_goja ./...`
- Frontend: `cd panel/frontend && npm run typecheck && npm run lint && npm run build`
- Edge untouched unless stated; if touched: `cd edge/backend && go build ./... && go test ./...`
- `gofmt`-clean the files you touch (the repo has pre-existing drift elsewhere — do not reformat
  unrelated regions). Frontend typecheck runs `tsc --noEmit`.
- New DB migrations: next free number is **081**; add the same migration to
  `internal/db/migrations/{mysql,postgres,sqlite}/`. Never edit a shipped migration.
- Never hand-edit generated output (`release/`, `internal/ui/`, `pagelib/library/`, `themelib/library/`).
- Update docs in the same item: `docs/vs/mod.md` row(s) that claim the gap, `internal/aiskills/mods.md`
  (respect the ks-panel-aiskills skill: ~3.2KB cap, Topics/index/enum sync, `TestAIDocsCoverage`),
  and `docs/THREAT_MODEL.md:121` area when the item adds a new trust surface.
- Final gate per item: `bash rebuild.sh` (slow — garble + frontend obfuscation; expect the
  `.build.lock` guard, don't delete a live lock).

## Baseline — items 1-5 DONE (do not redo)

1. Stock builds ship the Goja sandbox: `rebuild.sh` sets `GO_BUILD_TAGS="${GO_BUILD_TAGS:-modengine_goja}"` (`rebuild.sh:356-357|391`).
2. JS API expanded + per-call enforcement: `modengine/hostops.go` (`HostOps`, `hostEnv`, `ValidateModSQL`),
   `modengine/sandbox.go` bindings (`ks.db.query/exec`, `ks.files.list/read/write`, `ks.exec`,
   `ks.container.action`, `ks.vm.action`, `ks.console.send`, `ks.permissions.has/list`, `ks.capabilities.list`,
   `ks.events.on/off`, `ks.storage.*`, `ks.log`, `ks.slug`), `api/handlers/mod_hostops.go` (edge + DB bridge,
   SQL re-validation, 1000-row cap), `engine.go` `SetHostOps/RefreshHostEnv`.
3. Custom permissions persisted + grant-gated (`repository/mod_repo.go` CreateMod seeds
   `access_level='custom', granted=0`; `validateDeclaredPermissions`; grant UI shows declared descriptions).
4. Wider events: `api/handlers/mod_events.go` (`modEmitPre`/`modEmitPost`) + sites in
   `files_handler.go`, `instance_backup_handler.go`, `terminal_handler.go` (observed pumps),
   `instance_handler.go` (ActionStdin/InstallStdin/deploy/reinstall), `auth_handler.go`, `cli/launch.go`
   (install sweep). Event catalogue in `mod_events.go` header.
5. `bash rebuild.sh` green at v1.0.262 (garble + `modengine_goja`, checksums + security stage PASSED).

| # | Item | Status |
|---|------|--------|
| M6 | Mount UI slots + bundle loader + slot catalog + Studio frontend tab | ☑ done |
| M7 | Mod-to-mod dependencies (`requires{}`, topo load) | ☐ pending |
| M8 | Typed settings + encrypted secrets (migration 081) | ☐ pending |
| M9 | Scoped mod DB tables/migrations (governed) | ☐ pending (assess) |
| M10 | Dev tooling (scaffold CLI, test harness, docs, optional hot reload) | ☐ pending |
| M11 | Vendored JS deps in `.kspm` (require loader) | ☐ pending |
| M12 | Background/scheduled work (timers) | ☐ pending |
| M13 | Panel endpoint registration (mod HTTP routes) | ☐ pending |
| M14 | Custom/inter-mod events (+ optional shared KV) | ☐ pending (stretch) |
| M15 | Admin screens + sidebar nav (slot-based) | ☐ pending |

Excluded by decision (recorded in `docs/vs/mod.md`): marketplace/repo, signing/review, update path.
Excluded by design: full-trust powers (core patching, PHP, unrestricted DB, free UI replacement).

---

## M6 — Mount UI slots + bundle loader + slot catalog

Gap: registry + `<Slot>` exist but no host page mounts one, and there is no bundle loader — mods
cannot render any UI in the shipped panel (`docs/vs/mod.md` §8 honest minus). The Studio has no way
to author or ship a frontend bundle either: Studio/sample/JSON mods carry manifest+spec only (no
package zip), so a zip-relative `uiBundle` has nowhere to live.

Current facts (verified):

- Backend `SlotsHandler` (`api/handlers/mod_handler.go:1081` → `/api/mods/v1/slots`) returns
  `{mode, enabled, slots: []RegisteredSlot}`; `RegisteredSlot` (`modengine/engine.go:86`) =
  `{mod, mod_id, name, component, props}` — no bundle URL today.
- Assets: `ModAssetHandler` (`mod_handler.go:1324`, route `server.go:800`) serves
  `/api/mods/v1/assets/{slug}/*` from the extracted workdir (`modengine/pkgstore.go`,
  `EnsureWorkDirLocked`/`ReadAsset`, traversal-guarded). `pkgstore.go` header already promises the
  frontend bundle ("referenced by slots[].component").
- Frontend: `shared/components/ui/Slot.tsx` owns `window.KS.registerComponent` + `<Slot name context
  fallback>` with per-component ErrorBoundary, fetches slots once, but the loader is a stub
  ("relies on the bundle being pre-loaded… future /api/mods/:id/bundle endpoint").
- `<Slot` is used nowhere outside `Slot.tsx` — zero host mounts. Types: `shared/types/mod.ts`
  (`KSPluginComponent`, `SlotRegistryResponse`); Studio documents `instance.detail.tabs`
  (`ModStudio.tsx:789|814`).
- Samples: `api/handlers/mod_samples.go` (Event Logger, Destroy Guard, Permission Probe, Hello Slot).

Design:

1. **Slot catalog** — canonical names + context schema, owned in one place:
   `instance.detail.tabs`, `instance.detail.sidebar`, `instance.card.actions`, `dashboard.cards`,
   `dashboard.sidebar`, `settings.general.below`, `admin.mods.detail.after`. Document in
   `models/mod.go` (`SlotDefinition` comment), `shared/types/mod.ts`, and `aiskills/mods.md`.
2. **Manifest**: add top-level `uiBundle string` (zip-relative, default `frontend/bundle.js`) and
   `uiBundleSource string` (inline JS, wins over the file — mirrors `backendScriptSource` so
   Studio/sample/JSON installs stay self-contained) to `ModManifestV2` (`models/mod.go:191`);
   validate `uiBundle` stays zip-relative at upload, cap the inline source (1 MiB).
3. **Backend bundle URL**: extend `RegisteredSlot` with `BundleURL` (derived:
   `/api/mods/v1/assets/<slug>/<uiBundle>?v=<mod version|mtime>`) — no new route needed; the
   existing asset handler streams it. Register it when the workdir file exists OR `uiBundleSource`
   is present; the asset handler serves the inline source at the `uiBundle` path as a fallback, and
   `BuildPackageZip` embeds it as `frontend/bundle.js` so download/reinstall round-trips.
4. **Frontend loader** (`Slot.tsx`): after `fetchSlots()`, inject one `<script type="module">`
   per distinct `BundleURL` (idempotent by URL; remove on deactivate + `refreshSlots()`), then
   re-render. Failures log to console only (Error Isolation client-side).
5. **Mod-side contract**: bundles are IIFE/ESM built with `react`/`react-dom` mapped to globals —
   host exposes `window.React`, `window.ReactDOM`, `window.ReactJSXRuntime` (import in `App.tsx`
   or `main.tsx` and assign once). Bundle calls `window.KS.registerComponent(slot, name, Comp)`
   matching the manifest `slots[].component`. Document this exact recipe (+ an esbuild one-liner)
   in `aiskills/mods.md`.
6. **Host mounts** — add real `<Slot>` calls (memoized context): instance detail page tab strip
   (`InstanceDetail.tsx`), instance card action row (`Instances.tsx` / card component),
   dashboard cards + sidebar (`App.tsx`/shell layout). 4-5 mounts is enough for v1; leave the rest
   of the catalog declared-but-empty.
7. **Studio frontend tab** (`ModStudio.tsx`, mirror the Backend tab): new "Frontend bundle" tab with
   a JS editor writing `uiBundleSource` (react-globals contract note + `window.KS.registerComponent`
   starter template), wired into the manifest draft + Raw JSON round-trip like every other tab;
   `.kspm` uploads keep using the file-based `uiBundle`.
8. **Samples**: extend the Hello Slot sample with an inline `uiBundleSource` (now possible without a
   package file); keep a `mod_samples/hello-slot/` dev example + docs for the file-based path.

Tests / verify:

- Go: unit tests for bundle URL derivation (registered for file AND inline source; version busting
  stable), asset fallback (inline source served at the `uiBundle` path when no file is on disk),
  and `BuildPackageZip` embedding the inline bundle; existing slots handler test updated for the
  new field.
- Frontend: typecheck/lint/build; jsdom-free — assert loader idempotency via a small vitest if the
  repo has one (check `panel/frontend` for vitest config first; if none, skip and verify by
  typecheck + manual Playwright smoke: activate Hello Slot, expect mount, deactivate, expect gone;
  author a Studio mod with frontend source, expect the same).
- Update `docs/vs/mod.md` §8 (wired mounts + loader = no longer "cannot render") and §12 case 8
  score.
- `bash rebuild.sh`.

## M7 — Mod-to-mod dependencies (`requires{}`)

Gap: only `engine_version` — no dependency graph, version constraints, or load order
(`docs/vs/mod.md` §1 Version axis / §3 Compat graph).

Design:

1. **Manifest**: `requires: {"<slug>": "<constraint>"}` on `ModManifestV2`. Constraints (minimal,
   no semver dep — none in `go.mod`): `*`, exact `x.y.z`, `>=x.y.z`, `^x.y.z` (major-locked
   minimum). Implement a tiny parser in `models` (new file `models/modver.go`) with table tests;
   reject malformed constraints at upload with a 400.
2. **Upload validation** (`repository/mod_repo.go` CreateMod/update path): max 16 deps, no
   self-dep, slug regex reuse, constraint parse check.
3. **Boot/activation order**: `modengine/engine.go` `Boot` collects active mods, topologically
   sorts by `requires` (deterministic tiebreak by slug). Cycle → every participant marked
   `blocked_by: "cycle"` in diagnostics, none started. Missing dep or version mismatch → dependent
   marked `blocked_by` with the reason, dependents-of-dependents cascade.
4. **Activation endpoint** (`ActivateModHandler`, `mod_handler.go:911`): refuse 409 with the list
   of unsatisfied deps before flipping the row; `DeactivateModHandler` (`:1004`) refuses 409 when
   active dependents exist (explicit, no cascade).
5. **Diagnostics**: `ModRuntimeStatus` gains `requires` + `blocked_by` so the Mods page/Studio can
   show it; frontend type update in `shared/types/mod.ts` + minimal rendering in the status table.
6. Docs: `docs/vs/mod.md` Version axis + Compat graph rows (move from "none (honest minus)" to the
   implemented set, keep what is still missing), `aiskills/mods.md`.

Tests: constraint table test; topo order (chain + diamond + cycle); activation refusal (missing,
version mismatch, cycle); deactivation refusal with dependents; engine boot with one broken dep
keeps the rest running.

## M8 — Typed settings + encrypted secrets

Gap: mod state is a spec blob + per-slug KV; no typed schema, no scopes, no encrypted tier, no
settings UI (`docs/vs/mod.md` §7 Settings).

Design:

1. **Manifest**: `settings: [{key, label, type: text|password|number|toggle|select, options[]?,
   default?, description?}]`. Keys `[a-z0-9_]{1,64}`, max 32 settings. `password` = secret
   (secretbox-encrypted at rest, never returned by the API). Scope v1: global per mod; per-instance,
   per-user and per-server scopes are a stretch (note them, don't build).
2. **Migration 081** (`081_mod_settings.sql` ×3 dialects): `mod_settings(mod_slug TEXT, key TEXT,
   value TEXT, is_secret INTEGER NOT NULL DEFAULT 0, updated_at ...)` + unique `(mod_slug, key)`.
   Follow the existing `instance_secrets` pattern (`internal/secretbox` `Seal`/`Open`/`MaskValue`,
   key handling in `secretbox`).
3. **Repository**: `mod_settings_repo.go` — Get/List/Set (encrypt when secret), Delete; never
   return secret plaintext to callers outside the engine (a `Reveal` used only by the sandbox
   binding).
4. **API**: `GET /api/mods/{id}/settings` (masked: `{value}` or `{is_set: true}`), `PUT
   /api/mods/{id}/settings` (validated against the declared schema; MODS_EDIT gate; audit row).
   Wire in `server.go` mods group (~578-609) + `mod_handler.go`.
5. **Sandbox bindings**: `ks.settings.get(key)` (returns granted value incl. secrets — that is the
   point), `ks.settings.set(key, value)` (typed/validated; write access should require the mod to
   be active, always allowed for its own namespace). Register in `sandbox.go` + document in
   `aiskills/mods.md`.
6. **Frontend**: typed settings form in the mods detail panel (or Studio tab preview): renders
   from the manifest schema, secrets show masked/set, save → PUT. `Mods.tsx` + `api/mods.ts` +
   `shared/types/mod.ts`.
7. Docs: `docs/vs/mod.md` §7 Settings row; `docs/THREAT_MODEL.md` (new secret tier); aiskills.

Tests: repo round-trip; ciphertext ≠ plaintext in DB; API masking (secret never returned);
schema validation (unknown key, bad type, select option not in list); binding tests (typed value,
secret reveal inside the VM); `go test` both tags.

## M9 — Scoped mod DB tables (governed) — assess first

Gap: mods cannot own schema — only KV + gated queries (`docs/vs/mod.md` §7 Data access).

Decision gate (first step of the item): if the change below cannot be bounded to ~a day of work
with all three dialects, ship the **v1 registry-only** variant and mark the rest as future:

- v1 registry-only: manifest may declare `tables` but activation rejects with "runtime tables not
  supported yet" + a clear doc note (no half-schemas in the DB).

Governed design (if built):

1. Manifest `tables: [{name, columns: [{name, type: text|int|bool|timestamp|json}]}]`, names
   forced to `mod_<slug>_<name>` (server-side prefix, regex validated), max 8 tables / 24 columns.
2. Panel-run DDL at activation (idempotent `CREATE TABLE IF NOT EXISTS`), dialect-aware type map
   (sqlite/mysql/postgres), executed only through a new repository (`mod_tables_repo.go`) — handler
   layer stays SQL-free. Registry table `mod_tables(mod_slug, table_name, schema_version,
   created_at)` via migration (082 if 081 = settings), so the admin can list/drop.
3. Additive `ALTER TABLE … ADD COLUMN` only for new optional columns (no drops/renames/type
   changes in v1).
4. Drop: explicit admin action only (delete mod keeps tables; document).
5. Access remains through `ks.db` (existing SQL guard); table-name allowlist check for the
   `mod_<slug>_` prefix in `ValidateModSQL`/hostops so a mod cannot write another mod's tables.
6. THREAT_MODEL + docs/vs/mod.md §7 update; tests for DDL generation per dialect (unit), prefix
   enforcement, activation idempotency.

## M10 — Developer tooling

Gap: no scaffold, no hot reload, no mod test harness, thin docs (`docs/vs/mod.md` §10).

1. **Scaffold CLI** (`internal/cli/`, cobra pattern from `root.go:50-58`):
   - `kspanel mod init <dir>` — writes a starter `manifest.json` (v2, one hook, one slot, sample
     `settings`), `backend/main.js`, `frontend/bundle.js` stub, README; prints next steps.
   - `kspanel mod pack <dir> [-o out.kspm]` — validates the manifest (reuse
     `repository.ParseManifest` + v2 validator) and zips the directory with the same zip-slip
     rules the upload path uses (reuse `modengine/pkgstore.go` helpers if exported, else extract a
     shared writer).
2. **Mod test harness**: new package `modengine/modtest` — exported `Harness` wrapping the tagged
   runtime with `FakeOps` (promote the fake from `hostbindings_test.go`), helpers to seed grants,
   emit events, capture `ks.log`, inspect `ks.storage` + settings. Document in
   `aiskills/mods.md`; add one example test under `modengine/modtest/example_test.go`.
3. **Docs**: expand `internal/aiskills/mods.md` to a complete authoring guide (manifest fields,
   binding reference incl. new settings/timers, event catalogue pointer to `mod_events.go`,
   build-a-bundle recipe, pack/publish, testing). Keep the size cap + Topics sync; run
   `TestAIDocsCoverage`.
4. **Hot reload (stretch)**: `KSPANEL_MOD_DEV=1` watches `mod-work/<slug>` (fsnotify-free: poll
   mtime every 2s) and re-activates changed active mods; log-only otherwise. Skip if time-boxed.

Verify: run `kspanel mod init` + `mod pack` in a temp dir and validate the produced `.kspm` via the
existing upload validation; harness example test passes; aiskills tests pass.

## M11 — Vendored JS deps in `.kspm`

Gap: single-script mods, no module loader (`docs/vs/mod.md` §4 honest minus "no vendored JS deps" —
add the row when done; §7 Data/§10).

Design:

1. **Loader in the sandbox** (`sandbox.go`, goja): `require(rel)` resolving against the mod workdir
   (CommonJS subset: `module.exports`, `exports`, cache per activation, `.js` + `.json`), paths
   must resolve inside the workdir (reuse `pkgstore.ReadAsset` semantics / `filepath.Clean` +
   prefix check). Top-level script gets a `require` global only when the workdir exists.
2. Missing/unreadable module → JS exception with the resolved path (redacted), mod marked broken
   per the existing Error Isolation contract.
3. `runtime_noop`: `require` unavailable (documented), same as today's script behavior.
4. Packaging: `kspanel mod pack` (M10) already ships `vendor/**` as-is — document the recipe
   (esbuild `--bundle --format=cjs` into `vendor/`, then `require("./vendor/x.js")`).
5. Optional: `require("react")`-style bare names are NOT supported — document explicitly.

Tests: resolves relative module + JSON; cache (module body runs once); traversal (`../`) denied;
missing file throws; nested require; harness example.

## M12 — Background / scheduled work (timers)

Gap: hooks are 5s-capped, no timer/cron/worker API — mods cannot poll or run periodic work.

Design (v1 in-memory, per activation):

1. Bindings: `ks.timers.setTimeout(fn, ms)`, `ks.timers.setInterval(fn, ms)`,
   `ks.timers.clear(id)` — handles are ints. Limits: min 250ms interval, max 64 live timers per
   mod, callback runs with the same interrupt budget as hooks (reuse `sandbox.go`'s
   interruptVM/watchdog helpers) and panic recovery (a throwing tick logs to the diagnostics ring
   and keeps the schedule).
2. Lifecycle: all timers die with the runtime (`Stop`) and on deactivate/engine disable — never
   persisted, script re-registers on activation (document). No `pre:` semantics; a tick is just a
   VM call.
3. Isolation: ticks run on the runtime's single goroutine queue (serialize with hooks) so a slow
   tick cannot re-enter the VM concurrently; queued-tick cap drops + logs.
4. `runtime_noop` no-op + diagnostic note.
5. Consider (stretch): `ks.schedule.daily("HH:MM", fn)` — skip unless trivially built on the same
   queue.

Tests: fake-clock harness (inject `now`/ticker), interval fires, clear works, stop cancels,
throwing tick keeps running, cap enforcement, no concurrent VM entry (race test `-race`).

## M13 — Panel endpoint registration (mod HTTP routes)

Gap: mods cannot add HTTP endpoints; they only observe events (Laravel/service-provider panels can).

Design:

1. **Host route** in `server.go` (mods group, ~578-609): `r.Route("/api/mods/v1/ext/{slug}", ...)`
   with a wildcard handler, gated like assets (`ACCESS_ADMIN_PANEL`) — panel-session routes only in
   v1. External webhooks (token-auth, unauthenticated path) are a stretch and must mint a per-mod
   secret at activation via `secretbox` — do not build in v1.
2. **Bindings**: `ks.routes.on(method, path, fn)` at activate (path limited to the mod's namespace,
   no `..`, max 32 routes), `ks.routes.off(...)` optional. Handler signature:
   `fn(req) -> {status, headers?, body}` with `req = {method, path, query, headers (allowlist),
   body}` (body cap 1 MiB, response cap 1 MiB, JSON content type default).
3. **Dispatch**: `modengine` gains `HandleExtRequest(slug, method, path, query, headers, body)
   (status, headers, body, err)` → route to the active runtime's registered JS fn with the hook
   timeout; unknown slug/route → 404; engine disabled → 503. Engine never touches `http.ResponseWriter`
   (panel handler owns the HTTP layer, same split as today).
4. Limits: per-slug inflight cap + simple token-bucket (shared with hooks is fine) to keep one mod
   from pinning the panel.
5. Docs: aiskills + THREAT_MODEL (new request surface: authenticated admin endpoints only, no
   public exposure in v1).

Tests: handler dispatch deny/allow matrix (no capability, no route, engine off), req/resp mapping,
body cap, timeout, routing to the owning slug only.

## M14 — Custom / inter-mod events + shared KV (stretch)

Gap: `ks.events` only subscribes to host events; no emit, and `ks.storage` is per-slug isolated, so
mods cannot talk to each other.

Design:

1. `ks.events.emit(name, payload)` → bus event `mod:<slug>:<name>` dispatched post-style (async,
   no veto). Payload JSON cap 64 KiB; `name` `[a-z0-9_.-]{1,64}`.
2. Cross-mod subscription already works (`ks.events.on("mod:a:hello", fn)`) — document; add
   self-emit loop protection (max dispatch depth 8 per emit chain; drop + log beyond).
3. Manifest optional `emits: ["name", …]` for discoverability (Studio badge + docs); not enforced.
4. Shared KV (optional, only if M14 is picked up): `ks.storage.shared(ns)` requires the namespace
   declared identically in both manifests + a `storage.shared` capability grant; implement as
   `mod_storage` rows with `mod_slug = "@shared:" + ns`. Skip if not explicitly requested.

Tests: emit → other mod receives (harness), cap enforcement, loop protection, self-emit allowed but
bounded.

## M15 — Admin screens + sidebar nav (slot-based)

Gap: mods can only inject components into fixed additive host slots (M6); they cannot ship a
full-screen admin page with its own route + nav entry the way Ptero v2 `ui.screens` and Pelican
Filament pages can (`docs/vs/mod.md` §8). Depends on M6 (bundle loader + `<Slot>` mounts).

Design:

1. **Slot catalog** (extends the M6 catalog): `mod.screen` — full-screen content area, context
   `{slug, path}`, declared props `{title, icon?, nav?: bool, order?}`. The mod's `uiBundle` (M6)
   registers the component as usual.
2. **Frontend route**: add `/mods/view/:slug/*` in `src/app/router.tsx` (SPA-side only; no new
   backend route). It renders `<Slot name="mod.screen" mod={slug} context={{slug, path}} …/>`, so a
   deep link and a sidebar entry land on the same screen.
3. **Slot mod filter**: extend `<Slot>` (`shared/components/ui/Slot.tsx`) with an optional
   `mod?: string` prop that mounts only registrations owned by that slug; `undefined` keeps today's
   name-only behaviour. Needed so two screen mods don't render into each other's route.
4. **Sidebar nav**: `shared/components/layout/Sidebar.tsx` builds a "Mods" section from the cached
   slots registry (the M6 fetch): every active `mod.screen` slot with `nav !== false` becomes one
   entry (label = props.title, icon = props.icon fallback, order = props.order). No new endpoint —
   `refreshSlots()` after activate/deactivate adds/removes entries.
5. **Gate**: the route renders (and the nav shows) only for admin-panel sessions, matching the
   `ACCESS_ADMIN_PANEL` gate the slots API already enforces. No per-mod MODS_* scoping in v1 — the
   admin's activation decision is the gate.
6. **Studio + docs**: `mod.screen` preset in the Slots editor + props hint; aiskills/mods.md recipe
   (declare slot + nav props → bundle registers the component).
7. **Sample**: optional `hello-screen` builtin sample (or extend Hello Slot) exercising route + nav.

Tests / verify:

- Frontend: typecheck/lint/build; `<Slot mod>` filter test (vitest if present, else typecheck);
  Playwright smoke: activate a screen sample → sidebar entry appears → `/mods/view/<slug>` renders →
  deactivate → entry gone.
- Backend: none required (slots handler already passes props through); extend the existing slots
  handler test to assert `mod.screen` props survive the snapshot.
- Docs: `docs/vs/mod.md` §8 row when M6+M15 land; aiskills/mods.md.
- `bash rebuild.sh`.

Out of scope for this item (excluded by design, see exclusions above): host component replacement
and table-column injection — KS keeps additive-only injection.

---

## Suggested order

M6 (visible gap, unblocks samples) → M15 (same UI seam: screen route + nav) → M8 (migration path
warm-up) → M7 (manifest/graph) → M10 (tooling + docs; harness reused by the rest) → M11 → M9
(assess) → M12 → M13 → M14. Re-score `docs/vs/mod.md` §12 + verdict after each item, and keep the
"honest minus" rows truthful — a row only moves when the code actually ships.
