# Instance Pages v2 — Top-Level Plan (31 items: 14 fixes + 17 adds)

Status quo (2026-09-15): 4 content types (`html/markdown/blocks/react`), 11 action types, ~40 SDK methods, 7 shipped `pages/*.yaml` (`html 5, react 2, markdown 0, blocks 0`), `components 0/7` usage, empty-by-default linking, sandboxed iframe + allow-list exec. Audited A-Z from `pagelib/pagelib.go`, `handlers/instance_page_*.go`, `repository/instance_page_repo.go`, `CustomPageView.tsx`, `customPageSdk.ts`, `instancePages.ts`, `InstancePageStudio.tsx`, `marketplace.json`, `GUIDE.md`.

Goal: close every correctness/permission/parity gap, then add the missing platform surface so the system does everything a top-level pages system can do. Explicitly OUT: arbitrary npm, raw `fetch`/WS/storage/cookies outside `sdk.*`, SSR/SSG, HMR.

Repo root: `/home/runner/work/ks-panel-extreme/ks-panel-extreme`. Always verify with `go build ./... && go test ./...`, frontend `tsc --noEmit`, and `rebuild.sh` when `pagelib/library` or frontend changes.

---

## PART A — FIX / MODIFY (14)

> MAJOR PROMPT A — copy everything inside the fence to a fresh chat to execute all 14 fixes in order:
```text
You are a senior full-stack engineer in repo /home/runner/work/ks-panel-extreme/ks-panel-extreme. Execute PART A — all 14 instance-pages FIXES (F1-F14) in this exact order, one by one, no shortcuts.

CONTEXT: 4 content types (html/markdown/blocks/react), 11 action types, sandboxed iframe + allow-list exec (savedActionMatches), empty-by-default linking. Key files: panel/backend/internal/api/handlers/instance_page_handler.go (CRUD:1623/1656/1723/1821/1887, Link:2050, execute:2291/2879/3037, import:3281+, kspm:3597+, resync:4601), instance_page_react.go (Build:29), instance_page_kv.go:77 + page_kv_repo.go, instance_page_guard.go, pagelib/pagelib.go+decode.go, panel_page_handler.go + panel_page_repo.go, config/instance_pages.go:11, migrations 032/041/046/047/048/049/054/056/057/060/075/078 (+postgres 033 seed), server.go:683-738 routes, frontend CustomPageView.tsx:855 BRIDGE + :761/:472/:493 renderers, customPageSdk.ts, instancePages.ts, themeStore.ts:565, pageregistry.ts:105, marketplace.json, GUIDE.md, rebuild.sh:1194 sync_pagelib.

DO IN ORDER:
F1 Link OWN authz (:2050+:1887 add HasScope Own|All|Manage, tests owner-own ok / owner-чужой 403 / bulk mixed).
F2 Unify execute gates (server.go:690-691 vs :717 — read types VIEW, mutating types MANAGE, or readonly flag + GUIDE §17 table, tests both paths).
F3 KV hardening (pageKVScope add IsInstanceSuspended→403 + RecordActivity Put/Delete + List ?limit/offset default 100 + byte guard).
F4 Lifecycle (add POST /:id/unlink, fix resync bundle_css + per-page version not catalog Version:4713, page_kv cleanup on instance delete, route+admin.ts).
F5 Bulk parity (bulk INSERT add bundle_js/bundle_css/build_status/build_log + same validation as repo.Create).
F6 Panel-pages Delete →404 on 0 RowsAffected (match instance Delete).
F7 Multiline import parity BE+FE (normalize whitespace before reactFromAllowRe/reactRelativeFromRe + collectReactImportSpecs, keep ./ ../ jail, flat-root documented, parity fixtures).
F8 kspm wiring (use ModulesDir/MaxModuleSize/RequireSignature from config, implement or remove Install:3810 stub, Uninstall Stat-first→404).
F9 Fix postgres/033 seed INSERT OR IGNORE → ON CONFLICT DO NOTHING.
F10 Update PATCH/relaxed + remove double Get + parse Config once per request.
F11 Bridge missing iframe SDK methods (subscribe/on/emit/once/prompt/modal/downloadText/copyText/formatBytes/timeAgo/debounce/chart/markdown, keep connectWS proxied) + GUIDE §11 table.
F12 Fix renderer drift (--- rule, single <ul> grouping, escape blocksToHtml to match renderBlocks/renderSdkMarkdown).
F13 Blocks+file parity (action block runnable in string path or documented, HtmlBlockFrame banner/bridge, deleteFile/mkdir via /files API not rm -rf).
F14 Hygiene (exact tabPageMap match drop substring, delete stale pageregistry files/network/terminal/settings/ports, unique icons, fix mc-properties id≠stem, fix GUIDE refs rebuild.sh:1194 + catalog v3.0/2026-09-11, restore or unlink docs/instance-page.md).

RULES: read each file before editing, keep FE/BE validator parity, never edit shipped migrations (new ones only), fail-closed security, update GUIDE where behavior changes.
VERIFY EACH ITEM then final: go build ./... && go test ./... -run 'InstancePage|Link|Bulk|Execute|KV|PanelPage|React|Module|Marketplace', frontend tsc --noEmit + transpile harness, grep no dangling docs/instance-page.md refs. Return: diff summary per F1-F14 + full test logs + remaining risks.
```

### F1. Link OWN authz missing
- File: `panel/backend/internal/api/handlers/instance_page_handler.go:2050 LinkInstancePageHandler`
- Change: add `HasScope(InstancePagesOwn|All|Manage)` same as Get/Update/Delete/Build. Bulk `:1887` — attribute + enforce per-row.
- Accept: OWN user cannot link others' pages; test both handlers.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F1 Link OWN authz.
Read panel/backend/internal/api/handlers/instance_page_handler.go:2050 LinkInstancePageHandler and :1887 Bulk handler, plus Get:1623/Update:1723/Delete:1821/Build in instance_page_react.go:29 for the correct HasScope(InstancePagesOwn|All|Manage) pattern and migration 054 owner semantics.
Add the missing OWN check to Link (return 403 on чужой page) and per-row enforcement in Bulk. Add/update Go tests covering: owner can link own page, owner gets 403 on чужой page, admin can link all, bulk mixed own/чужой.
Verify: go build ./... && go test ./... -run 'InstancePage|Link|Bulk'. Show diff + test output.
```

### F2. Execute permission split
- Files: `server.go:690-691,717`, `instance_page_handler.go:2291,2879,3037`
- Change: decide one model: either SDK `execute-action` requires instance `MANAGE` for mutating types (`shell/write/delete/docker/kvm/lxd/chmod/archive/extract`) and `VIEW` only for read types, OR keep VIEW + add per-action `readonly` flag. Document in GUIDE §17.
- Accept: same edge effect cannot have two different gates without reason; tests for both paths.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F2 execute permission model.
Read panel/backend/internal/api/server.go:690-691,717 and instance_page_handler.go:2291 ExecutePageActionHandler, :2879 ExecuteCustomPageActionHandler, :3037 ExecuteModulePageActionHandler plus guard helpers and customPageSdk.ts executeAction.
Implement: read-only types (read_file/list_files/stat) allow VIEW_INSTANCES, mutating types require MANAGE/InstancesAll (or add readonly flag — pick one and document). Update GUIDE.md §17 security table. Add Go tests for VIEW-holder blocked on shell/write but allowed on read, MANAGE allowed all.
Verify: go build ./... && go test ./... -run 'Execute|Action|Guard'. Show matrix + docs diff.
```

### F3. KV hardening
- Files: `instance_page_kv.go:77 pageKVScope`, `page_kv_repo.go:39`
- Change: add `IsInstanceSuspended → 403` (match execute handlers), add `RecordActivity` on Put/Delete, paginate `List` (`?limit/offset`, default 100, max values size guard).
- Accept: suspended instance KV-writes fail; audit row written; list of 100×64KiB does not OOM response.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F3 KV hardening.
Read panel/backend/internal/api/handlers/instance_page_kv.go:77 pageKVScope, repository/page_kv_repo.go, and execute handlers for IsInstanceSuspended + RecordActivity pattern.
Add: suspended→403 on Put/Delete (and List?), RecordActivity on Put/Delete, List pagination ?limit/offset default 100 with total-bytes guard. Update SDK kv client if params change. Add Go tests: suspended blocked, audit written, pagination caps 6.4MB case.
Verify: go build ./... && go test ./... -run 'KV|PageKV'. Show diff + test output.
```

### F4. Lifecycle coupling
- Files: `instance_page_handler.go:1821 Delete, 4601 resync`, `078_page_kv.sql`
- Change: (a) add `POST /api/instance-pages/:id/unlink {template_ids}` removing slug + stale `slug/...` rows; (b) delete library page → warn + optional cascade-unlink (never silent); (c) `page_kv` FK or cleanup job on instance/template delete; (d) resync preserves `bundle_css` + stamps per-page `version` not catalog `Version:4713`.
- Accept: unlink endpoint works; orphan `spec.pages` + `page_kv` cannot accumulate.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F4 lifecycle coupling.
Read instance_page_handler.go:1821 Delete, :2050 Link, :4601 resync, specyaml parse/marshal, 078_page_kv.sql, template/instance delete paths.
Implement: POST /api/instance-pages/:id/unlink {template_ids} (remove slug + stale slug/... rows, preserve config), fix resync to preserve bundle_css and stamp per-page version, add page_kv cleanup on instance delete (FK or job). Wire route in server.go + admin.ts client + tests.
Verify: go build ./... && go test ./... -run 'Link|Unlink|Resync|KV'. Demo link→unlink→relink round-trip.
```

### F5. Bulk vs single divergence
- File: `instance_page_handler.go:1942`
- Change: bulk INSERT must include `bundle_js/bundle_css/build_status/build_log` + same validation as `repo.Create:192`.
- Accept: bulk-imported react page carries prebuilt bundle and renders without rebuild.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F5 bulk parity.
Read instance_page_handler.go:1887 Bulk handler + :1942 INSERT vs repository/instance_page_repo.go:188 Create and instance_page_react.go build columns.
Fix bulk prepared INSERT to include bundle_js/bundle_css/build_status/build_log with same validation/size caps as single create. Add Go test: bulk-import react page with bundle → GET returns bundle → renders without rebuild.
Verify: go build ./... && go test ./... -run 'Bulk|InstancePage'. Show SQL diff + test.
```

### F6. Panel pages parity + Delete bug
- Files: `panel_page_handler.go`, `panel_page_repo.go:46-75,354`
- Change: `Delete` checks `RowsAffected` → 404 on missing (match instance pages); document why panel pages stay `html|markdown` only or add `blocks`.
- Accept: `DELETE /api/panel-pages/:missing` → 404, not 204.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F6 panel-pages delete fix.
Read panel/backend/internal/api/handlers/panel_page_handler.go and repository/panel_page_repo.go:354 Delete vs instance_page_repo.go:248 Delete RowsAffected pattern.
Fix Delete to return 404 on 0 rows affected, add Go test for DELETE missing →404 and existing →204. Update docs if behavior change. 
Verify: go build ./... && go test ./... -run 'PanelPage'. Show diff + test output.
```

### F7. React validator multiline + flat-root
- Files: `instance_page_handler.go:134,144,934`, `reactPageTranspile.ts`
- Change: allow multiline `import {a,\n b} from 'react'/'./x'` (normalize whitespace before regex) on BE + FE identically; either support nested dirs (`importerDir != ""`) or document flat-root-only and keep `../` rejected.
- Accept: FE/BE parity tests with multiline fixtures pass both sides.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F7 multiline import parity.
Read instance_page_handler.go:134 reactFromAllowRe, :144 reactRelativeFromRe, :934 collectReactImportSpecs and panel/frontend/src/shared/lib/reactPageTranspile.ts rewriteReactImports/collectFileImports/normalizeModuleSpecifier.
Fix both sides to handle multiline imports (normalize whitespace/newlines before regex) identically, keep jail (./ ../ only, no escape) and decide flat-root-only with docs. Add FE+BE fixtures: multiline from react, multiline from ./util, cycle, escape — all must agree.
Verify: go test ./... -run React + frontend transpile harness + tsc --noEmit. Show parity table.
```

### F8. Modules `.kspm` dead config + stubs
- Files: `config/instance_pages.go:11`, `instance_page_handler.go:3636-3919`
- Change: wire `ModulesDir/MaxModuleSize/RequireSignature` (no hardcode `"instance_pages/modules"`), implement `Install:3810` (or remove route), fix `Uninstall:3860` to 404 on missing (`Stat` before `RemoveAll`).
- Accept: config changes take effect; unknown `id/version` uninstall → 404.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F8 kspm config + install/uninstall fix.
Read panel/backend/internal/config/instance_pages.go:11 and instance_page_handler.go:3636-3919 (List/Get/Upload/Install/Uninstall/Serve asset) + server.go:729-738 routes.
Wire ModulesDir/MaxModuleSize/RequireSignature from config (remove hardcoded instance_pages/modules), implement Install or remove route + frontend refs, fix Uninstall to Stat-first →404 on missing. Add Go tests for custom dir, size cap, uninstall 404.
Verify: go build ./... && go test ./... -run 'Module|Kspm'. Show config diff + tests.
```

### F9. Postgres seed syntax
- File: `postgres/033_instance_pages_builtin_seed.sql:28`
- Change: `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING` (mysql copy already uses `INSERT IGNORE`).
- Accept: `golang-migrate` up on pg passes.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F9 postgres seed fix.
Read panel/backend/internal/db/migrations/postgres/033_instance_pages_builtin_seed.sql:28 vs sqlite + mysql copies and regen.sh convention.
Fix pg dialect to ON CONFLICT DO NOTHING (keep sqlite OR IGNORE, mysql IGNORE). Verify SQL parses and migrate up/down works if docker/pg available, else at least sqlfluff/parse + go build.
Verify: go build ./... && git diff of the one file. Show before/after.
```

### F10. Update ergonomics + perf
- Files: `instance_page_handler.go:1723 Update, 2112 Link, 3128 getEnabledModules`
- Change: add `PATCH` (partial) or relax `name/slug` required when unchanged; remove double `repo.Get`; parse `Config` once per request (pass `parsedSpec` through).
- Accept: settings-only edit works; no N× YAML marshal on link.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F10 update ergonomics + perf.
Read instance_page_handler.go:1723 Update (double Get, full-replace validation), :2112 Link N× specyaml parse/marshal, :3128 getEnabledModules double parse.
Implement PATCH or relaxed Update (allow partial, keep slug-unique check), remove double Get, parse Config once and thread parsedSpec through. Add Go tests for partial update + benchmark/log showing single parse.
Verify: go build ./... && go test ./... -run 'InstancePage'. Show diff + no regression.
```

### F11. Iframe SDK parity
- Files: `CustomPageView.tsx:855 BRIDGE_METHODS`, `customPageSdk.ts`
- Change: bridge `subscribe, on/emit/once, prompt, modal, downloadText, copyText, formatBytes, timeAgo, debounce, chart, markdown` (pure ones trivially; `subscribe` via parent-side poll + `ks-sdk-push`). Keep `connectWS` proxied.
- Accept: `html` page can call every host-available method or gets typed `not-allowed` list in docs; no silent subset.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F11 iframe SDK parity.
Read panel/frontend/src/shared/components/ui/CustomPageView.tsx:855 BRIDGE_METHODS + buildIframeDocument + ks-sdk-response proxy and shared/lib/customPageSdk.ts full CustomPageAPI.
Bridge missing methods (subscribe via parent poll + ks-sdk-push, on/emit/once, prompt/modal, downloadText/copyText/formatBytes/timeAgo/debounce, chart, markdown) to iframe stub. Update GUIDE §11 with parity table. Add frontend test/harness page calling each from iframe.
Verify: tsc --noEmit + harness demo html page calling all bridged methods. Show diff.
```

### F12. Renderer mirror drift
- Files: `CustomPageView.tsx:761 renderMarkdown, 472 markdownToHtml, 493 blocksToHtml`
- Change: add `---` rule to host `renderMarkdown` (match `renderSdkMarkdown:772`), group `<li>` into single `<ul>` (match `769`), escape values in `blocksToHtml` (match `renderBlocks`).
- Accept: preview-HTML == live-HTML fixtures.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F12 renderer mirror fix.
Read CustomPageView.tsx:761 renderMarkdown vs customPageSdk.ts:772 renderSdkMarkdown, :472 markdownToHtml li grouping vs :769, :493 blocksToHtml escaping vs renderBlocks:552.
Fix: add --- hr rule, group li into single ul, escape values in blocksToHtml. Add fixture tests (md with ---, list, blocks with <script>) asserting preview==live==sdk output.
Verify: tsc --noEmit + fixture test output. Show diff.
```

### F13. Blocks + file-op parity
- Files: `CustomPageView.tsx:540,714`, `customPageSdk.ts:1237-1247,1295`
- Change: string-path `action` block renders enabled button (or document disabled-by-design); `HtmlBlockFrame` gets read-only bridge or explicit banner; `deleteFile/createDirectory` go through `/files` parity endpoints instead of `rm -rf`/`mkdir -p`.
- Accept: blocks demo page behaves identically in all three render paths.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F13 blocks + file-op parity.
Read CustomPageView.tsx:540 action block string path, :714 HtmlBlockFrame, :686 host action button, and customPageSdk.ts:1237 deleteFile/createDirectory vs :1295 parity endpoints (stat/rename/copy/chmod/archive).
Make string-path action block runnable (or explicitly document disabled with reason), add read-only bridge or banner to HtmlBlockFrame, migrate deleteFile/createDirectory to /files API (no shell rm -rf). Add tests/demo blocks page.
Verify: tsc --noEmit + go test for new file endpoints + demo page screenshots/text. Show diff.
```

### F14. Theme + registry + catalog hygiene
- Files: `CustomPageView.tsx:1656`, `themeStore.ts:565`, `pageregistry.ts:105`, `marketplace.json:17,32`, `GUIDE.md`
- Change: exact `tabPageMap` match for `page:*` scopes (drop substring); delete stale `instance.panel.files/network/terminal/settings/ports` registry entries (only `overview|sftp` native); unique icons; fix `mc-properties` id≠stem (rename file or document exception); fix GUIDE refs (`rebuild.sh:1194` not 1078, catalog v3.0/2026-09-11, remove `cron-scheduler/docker-manager/api-reference` cites or ship them); restore `docs/instance-page.md` or remove links.
- Accept: per-custom-slug theming works; no dangling doc links.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement F14 theme+registry+hygiene.
Read CustomPageView.tsx:1656 customPageThemeCss scope match vs themeStore.ts:565 matchingScopeCss, pageregistry.ts:105 stale entries vs instancePages.ts:40 native slugs, marketplace.json duplicate icons + mc-properties id≠stem, GUIDE.md stale refs.
Fix: exact tabPageMap match, delete stale registry entries, unique icons, fix id/stem (rename or document), fix GUIDE line refs + catalog version/date, restore or unlink docs/instance-page.md. 
Verify: tsc --noEmit + go build + grep no dangling refs. Show diff.
```

---

## PART B — ADD (17)

> MAJOR PROMPT B — copy everything inside the fence to a fresh chat to execute all 17 adds in order:
```text
You are a senior full-stack engineer in repo /home/runner/work/ks-panel-extreme/ks-panel-extreme. Execute PART B — all 17 instance-pages ADDS (A15-A31) in this exact order. Assume PART A fixes are already merged. Do not re-do F-fixes; build on them.

CONTEXT: same as PART A + Studio (InstancePageStudio.tsx 8 tabs, PageStudio* sections, pageStarters.ts), template spec (templateFormUtils serializeSpec/parseSpec, TemplatePagesSection, instanceFormUtils), 7 pages/*.yaml + marketplace.json v3.0, tools/pages_lint.py (create in A23), rebuild.sh:1194 sync_pagelib. OUT: arbitrary npm, raw fetch/WS/storage outside sdk.*, SSR/SSG, HMR.

DO IN ORDER:
A23 FIRST (lint+CI gate): write tools/pages_lint.py (yamllint + validateInstancePage caps 1MiB/64KiB/512KiB/16KiB + validateReactSource denylist + slug-unique + marketplace↔ListNames parity + icons unique) + GH workflow + pagelib count test. Must be green before A24+.
A19 shared library: global snippets registry (or type:shared UI), extract ks_theme_head, migrate all 7 pages to {{component:ks_theme_head}} (keep 5-pass resolve, module exclusion).
A24 expand library to 17 total: backups, database, monitoring-logs, firewall-ssl, dns, docker-manager, cron-host, system-info, home slug ., api-docs (markdown), blocks-demo (blocks+action block). Each: valid slug, shared theme head, ≥1 saved action tested, sanitized icon, marketplace entry + screenshot field.
A25 marketplace v2: fields screenshot/changelog/license/requires_panel/min_version, per-page version + update-available + per-page resync (no slug clash), relative download_url, search/tags UI.
A15 versioning: page_versions table x3 DBs (snapshot on Update/Build), Studio History diff/rollback, spec.pages[].page_version + badge + one-click relink.
A30 list UX: search/sort/filter/paginate 200+ rows, bulk link/unlink, stale-build + orphan-spec detectors.
A26 studio UX: in-Studio import (file/URL/market/local), draft action test without save, sub-page build matrix, Templates tab live library (not just PAGE_STARTERS).
A17 visibility+order: spec visible_to/hidden/order, enforce in resolveInstanceNav/isPageAllowed/guard (404 unauthorized), drag-order UI.
A21 secrets: sdk.getSecret server-vault read (VIEW+family gate, redacted logs), Studio secret marking, docs KV-cleartext vs vault.
A20 assets: page_assets (hash, mime allow-list, 5MiB/file 50MiB/page), GET /:id/assets/:hash nosniff+cache+scope, sdk.asset() + upload tab.
A18 routing: 2-level <slug/path/sub2> gated (no // or dot-segments) with sub components fallback + actions scope, or enforce+document 1-level cap + html hash-tabs recipe.
A22 schedules+audit: page_action_schedules (cron via automation engine) + page_audit (actor/instance/slug/action/ok/ms) on execute/KV/link + InstanceDetail feed, migrations x3.
A28 exact per-slug theming: instance.panel.custom.<slug> keys, exact match, per-slug preview dropdown.
A27 fuzz+docs: fuzz validActionArg/shellQuoteArg/path/archive/mode (no injection), ship stat/chmod/archive/extract examples + GUIDE §7 table.
A29 i18n/a11y/mobile/print: per-page dict + {{t:key}} (5-pass) + sdk.locale(), ARIA/focus/responsive tables/print CSS, a11y ≥90.
A31 quotas: per-instance exec/min + kv writes/min + asset bytes/day →429+Retry-After + Studio display, reuse clampActionTimeout[1,600], config+migrations.

RULES: new migrations only (never edit shipped), FE/BE parity on every validator change, fail-closed, update GUIDE + marketplace + rebuild.sh embed each new page, keep sdk.* as only escape hatch.
VERIFY EACH ITEM then final: go build ./... && go test ./... -run 'Version|Audit|Schedule|Quota|Marketplace|Asset|Secret', tsc --noEmit, tools/pages_lint.py green, rebuild.sh ok, live Studio→link→deploy→/instances/<id>/<slug>→runAction→audit row demo. Return: files added/modified per A15-A31 + test logs + demo notes + risks.
```

### A15. Versioning + propagation
- Add `page_versions` table (snapshot on every Update/Build) + Studio History tab (diff/rollback) + `template.spec.pages[].page_version` + "Update available" badge + one-click re-link + instance re-deploy prompt.
- Accept: edit → rollback → re-link round-trip works.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A15 page versioning + propagation.
Read instance_page_repo.go Update/UpdateBuild, template spec pages (templateFormUtils serializeSpec/parseSpec), InstancePageStudio handleSave/handleBuild, Link handler.
Add migration x3 DBs for page_versions (page_id, version, snapshot JSON, created), snapshot on Update/Build, Studio History tab with diff/rollback, spec.pages[].page_version + Update-available badge + one-click re-link. Add Go + FE tests.
Verify: go build ./... && go test ./... -run 'Version|InstancePage' + tsc --noEmit. Demo edit→rollback→relink.
```

### A16. Unlink + clone + bundle export
- `POST /:id/unlink`, `POST /:id/duplicate {slug}`, `GET /:id/export.zip` (yaml + assets). Studio buttons.
- Accept: clone renders; zip re-imports losslessly.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A16 unlink/clone/export (pairs with F4 if not done).
Read Link handler + specyaml + pagelib NormalizePageBytes + admin.ts link client.
Implement POST /:id/unlink, POST /:id/duplicate {new_slug}, GET /:id/export.zip (yaml + assets), server routes + admin.ts + Studio buttons. Tests: duplicate renders, zip re-import lossless via NormalizePageBytes round-trip.
Verify: go build ./... && go test ./... -run 'Unlink|Duplicate|Export'. Show API + UI diff.
```

### A17. Visibility + ordering
- Spec row: `visible_to: [] (roles), hidden: bool, order: int`. `resolveInstanceNav` respects them; Studio drag-order.
- Accept: hidden/role-gated pages 404 for unauthorized, nav order persists.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A17 visibility + ordering.
Read shared/utils/instancePages.ts resolveInstanceNav/isPageAllowed/getPageContent, InstanceDetail InstanceDynamicPage gate, TemplatePagesSection + templateForm types PageOverride, instance_page_guard.go.
Add spec row fields visible_to/hidden/order, enforce in resolveInstanceNav + isPageAllowed + guard (404 for unauthorized), Studio drag-order + visibility controls. Tests for hidden/role/ordering.
Verify: tsc --noEmit + go test -run Guard. Demo two roles see different nav.
```

### A18. Routing depth
- Allow `<slug>/<path>/<sub2>` (2 levels) OR document 1-level cap; sub-pages gain own `components` (fallback parent) + `actions` scope choice; `useHashRoute` recipe for `html`.
- Accept: nested URL gates via `isPageAllowed`; no open redirect.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A18 routing depth.
Read instancePages.ts splitSubSlug/findSubPageEntry/isPageAllowed, instance_page_handler validateSubPages, customPageSdk pageNavigateTarget + useHashRoute.
Implement either 2-level <slug/path/sub2> with gates (exact + parent fallback, no // or dot-segments) + sub-page components fallback + actions scope, OR enforce+document 1-level cap with clear error. Add GUIDE recipe for html hash tabs. Tests for nested allow/deny + navigate guard.
Verify: tsc --noEmit + go test -run 'SubPage|Guard|Navigate'. Show URLs matrix.
```

### A19. Shared component library
- New `page_shared_components` table or `type:shared` registry UI in Studio; extract theme header into `ks_theme_head` shared ref; migrate 7 pages to use it.
- Accept: theme fix in one place propagates; 0 duplicated `<style>` headers.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A19 shared component library.
Read CustomPageView resolveComponentTokens/componentToHtml, pageStudio Components tab, sharedPanelComponents registry, all 7 pages/*.yaml theme <style> headers.
Implement shared registry UI (global snippets, import-by-reference type:shared), extract ks_theme_head, migrate all 7 pages to {{component:ks_theme_head}}, keep 5-pass nested resolve + module exclusion. Tests for nested + missing literal.
Verify: tsc --noEmit + pages_lint + rebuild.sh embeds. Show before/after yaml size.
```

### A20. Page assets
- `page_assets` (hash, mime allow-list, ≤5MiB/file, ≤50MiB/page) + `sdk.asset(name)` URL + Studio upload tab; serve via `GET /api/instance-pages/:id/assets/:hash` with `nosniff` + cache.
- Accept: image/css/js loads in iframe + host without inline bloat.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A20 page assets.
Read instance_page import/upload (10MiB multipart), kspm unzip hardening + safe segment + ServeFile, customPageSdk + CustomPageView iframe srcDoc asset URLs.
Add page_assets storage (hash, mime allow-list image/css/js, 5MiB/file 50MiB/page), GET /:id/assets/:hash with nosniff+cache+scope check, sdk.asset() + Studio upload tab. Tests for mime/traversal/size + iframe load.
Verify: go build ./... && go test -run Asset + tsc --noEmit. Demo image in html + react.
```

### A21. Secrets binding
- `sdk.getSecret(name)` (server vault, redacted in logs) distinct from `sdk.kv` (cleartext). Studio marks action `env` refs as secret.
- Accept: secret value never lands in `page_kv`/bundle/build log.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A21 secrets binding.
Read sdk kv/storage, instance secrets (env) vault + guardInstancePage Secrets path, execute allow-list env handling + edge PageActionRequest.
Implement sdk.getSecret(name) server-vault read (VIEW_INSTANCES + family gate, redacted logs/activity), Studio secret marking for action env, docs KV-cleartext vs vault-secret. Tests: unauthorized denied, secret never in kv/bundle/log.
Verify: go build ./... && go test -run 'Secret|KV'. Show redaction proof.
```

### A22. Schedules + audit
- Per-page action schedules (cron expr, server-side runner reusing Automation engine) + `page_audit` (who/when/what/ok) + InstanceDetail activity feed.
- Accept: schedule fires; audit row per execute/KV/link.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A22 schedules + audit.
Read automation.yaml + edge automation API, execute-action handlers + RecordActivity pattern, page_kv handlers (no audit today).
Add page_action_schedules (cron, server runner reusing automation engine) + page_audit (actor, instance, slug, action, ok, ms) written on execute/KV/link + InstanceDetail feed. Migrations x3, SDK read-only list. Tests for fire + audit row.
Verify: go build ./... && go test -run 'Audit|Schedule'. Demo scheduled run appears in feed.
```

### A23. Offline lint + CI
- `tools/pages_lint.py` (yamllint + `validateInstancePage` caps + `validateReactSource` denylist + slug-unique + marketplace↔`ListNames` parity) + GH workflow fail on drift + `pagelib_test.go` count==marketplace count assert.
- Accept: `rebuild.sh` green only when lint green.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A23 offline lint + CI.
Read tools/pages_json_to_yaml.py field list, pagelib.go ListNames/Read + decode.go NormalizePageBytes, instance_page_handler validate caps + validateReactSource denylist, marketplace.json, rebuild.sh sync_pagelib, pagelib_test.go.
Write tools/pages_lint.py checking yaml parse, caps (1MiB content, 64KiB actions, 512KiB subs/components, 16KiB icon), denylist parity, slug-unique, marketplace↔ListNames parity + icons unique. Add GH workflow + pagelib count test. 
Verify: python tools/pages_lint.py passes on 7 pages + fails on fixture bad page. Show CI log.
```

### A24. Library expansion (10 pages)
- Ship: `backups, database, monitoring-logs, firewall-ssl, dns, docker-manager, cron-host, system-info, home(.), api-docs(markdown), blocks-demo(blocks)`. Each: theme header via shared ref, at least one `action` block, preview screenshot.
- Accept: every category + every content type + every SDK group has ≥1 live example.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A24 library expansion (do after A19 shared head + A23 lint).
Read 7 pages/*.yaml (esp files.yaml theme header + sub_pages, react-dashboard useHashRoute/chart, minecraft-properties open_args/storage) + GUIDE §18-19 checklist + marketplace.json schema.
Ship 10 pages: backups, database, monitoring-logs, firewall-ssl, dns, docker-manager, cron-host, system-info, home slug ., api-docs (markdown), blocks-demo (blocks with action block). Each: valid slug, theme shared ref, ≥1 saved action + test, icon_svg sanitized. Update marketplace.json + rebuild.sh embed + lint green.
Verify: tools/pages_lint.py + pagelib_test + Studio import→link→deploy each. List new files + screenshots.
```

### A25. Marketplace v2
- Fields: `screenshot, changelog, license, requires_panel, min_version`; per-page `version` bump flow; search/tags filter UI; relative `download_url` support; `resync` per-page.
- Accept: install → update-available → resync without slug clash.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A25 marketplace v2.
Read marketplace.json + pagelib ReadCatalog, import/marketplace + resync handlers, InstancePages.tsx market UI + admin.ts market client.
Add fields screenshot/changelog/license/requires_panel/min_version, per-page version + update-available + per-page resync (no slug clash), relative download_url support, search/tags UI. Migrate existing 7 entries. Tests for version bump + resync preserving slug/source_tsx.
Verify: go test -run Marketplace + tsc --noEmit + lint. Demo install→update→resync.
```

### A26. Studio UX
- In-Studio import (file/URL/market/local) without leaving tab; unsaved-draft action test (temp in-memory page id); sub-page build matrix display; Templates tab reads live library not just `PAGE_STARTERS`.
- Accept: author never context-switches to list page mid-edit.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A26 studio UX.
Read InstancePageStudio.tsx tabs + handleTest/handleSave/handleBuild, PageStudioTemplatesSection (PAGE_STARTERS only), PageStudioPreviewSection, InstancePages.tsx import flows, admin.ts import/local/market clients.
Add in-Studio import (file/URL/market/local), draft action test without save (temp id or dry-run), sub-page build matrix, Templates tab live library + starters. Keep STATIC_SDK_STUB for no-instance preview.
Verify: tsc --noEmit + manual Studio flow video/text. No regression on save/build.
```

### A27. File-op docs + quoting audit
- Fuzz `validActionArg/shellQuoteArg` + `validPageActionPath/archiveName`; document `stat/chmod/archive/extract` with shipped examples.
- Accept: no arg-injection; every action type has ≥1 shipped use.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A27 file-op fuzz + docs.
Read instance_page_handler.go validActionArg/shellQuoteArg/resolveExecPayload/savedActionMatches + validPageActionPath/ArchiveName/Mode + edge PageAction executor, GUIDE §7.
Fuzz open_args (charset, 200ch, 4-max, {{args}} required for shell), path/archive traversal, chmod mode; add Go fuzz/unit tests proving no injection. Add shipped examples for stat/chmod/archive/extract (or extend A24 pages) + GUIDE table.
Verify: go test -fuzz + go test -run 'Action|Archive|Arg'. Show payload matrix.
```

### A28. Exact per-slug theming
- `themeStore.tabPageMap` gains `instance.panel.custom.<slug>` keys; Studio theme preview dropdown per slug.
- Accept: two custom pages can have different `page:*` CSS.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A28 exact per-slug theming.
Read themeStore.ts resolveThemeIdByRoute/tabPageMap/matchingScopeCss + CustomPageView customPageThemeCss scope match + GUIDE §12.
Add instance.panel.custom.<slug> keys with exact match (remove substring), Studio theme preview per-slug dropdown, migration/docs for existing page:* CSS. Test two slugs get different CSS, fallback to instance.panel.custom.
Verify: tsc --noEmit + visual demo with two themed pages. Show diff.
```

### A29. i18n/a11y/mobile/print
- `{{t:key}}` dict per page + `sdk.locale()`; focus states, ARIA on blocks, responsive tables, print CSS.
- Accept: Lighthouse a11y ≥90 on blocks/markdown render.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A29 i18n/a11y/mobile/print.
Read CustomPageView renderBlocks/renderMarkdown + blocksToHtml, resolveComponentTokens (add resolveTtokens alongside), customPageSdk locale, theme CSS.
Add per-page i18n dict + {{t:key}} (5-pass like components) + sdk.locale(), ARIA roles/labels on blocks, focus states, responsive tables, print CSS. Add fixtures + a11y checklist.
Verify: tsc --noEmit + Lighthouse/a11y check on blocks+markdown demo. Show before/after.
```

### A30. List UX
- Search/sort/filter/paginate library (100+ pages), bulk link/unlink, stale-build + orphan-spec detectors.
- Accept: 200-page library stays usable.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A30 library list UX.
Read InstancePages.tsx cards/import/market/resync + InstancePageDetail link UI + admin.ts bulk/link clients + template spec orphan rows (F4).
Add search/sort/filter/paginate (100+ pages), bulk link/unlink, detectors for stale-build (source newer than bundle) + orphan spec (template has slug not in library) + missing marketplace entry. Tests for 200-row perf.
Verify: tsc --noEmit + demo with 200 seeded pages. Show UI diff.
```

### A31. Quotas + rate limits
- Per-instance caps (exec/min, KV writes/min, asset bytes) + `429` + Studio display; reuse `clampActionTimeout[1,600]`.
- Accept: abusive page cannot starve edge.
- Execute prompt (copy to new chat):
```text
In repo /home/runner/work/ks-panel-extreme/ks-panel-extreme implement A31 quotas + rate limits.
Read execute-action + kv Put + assets handlers, clampActionTimeout, edge PageAction timeout, config for limits.
Add per-instance caps (exec/min, kv writes/min, asset bytes/day) with 429 + Retry-After + Studio quota display, reuse clampActionTimeout. Migrations/config + Go tests (burst →429, refill).
Verify: go build ./... && go test -run 'Quota|Rate|Limit'. Show 429 demo.
```

---

## Build order

1. F9, F6, F5, F1, F3 (backend correctness, no UI).
2. F7, F12, F13, F11 (parity — FE/BE lockstep, add fixtures).
3. F4 (+A16 unlink/clone), F10, F8, F14 (lifecycle + cleanup).
4. A23 lint/CI (gate everything after).
5. A19 shared theme head → A24 library expansion (uses it) → A25 marketplace v2.
6. A15 versioning → A30 list UX → A26 studio UX.
7. A17 visibility → A21 secrets → A20 assets → A18 routing.
8. A22 schedules/audit → A28 theming → A27 fuzz docs → A29 i18n/a11y → A31 quotas.

## Verify (each item)

- `go build ./... && go test ./...` (add Go tests for F1-F10, A15/A22/A31).
- Frontend `tsc --noEmit` + transpile parity harness for F7/F11/F12.
- `tools/pages_lint.py` green + `rebuild.sh` embeds `marketplace.json + pages/*.yaml` + `ui/dist` carries change.
- Live round-trip: Studio → link → deploy → `/instances/<id>/<slug>` → `KSPageSDK.runAction` → audit row.
