# Instance Pages v2 — Top-Level Plan (31 items: 14 fixes + 17 adds)

Status quo (2026-09-15): 4 content types (`html/markdown/blocks/react`), 11 action types, ~40 SDK methods, 7 shipped `pages/*.yaml` (`html 5, react 2, markdown 0, blocks 0`), `components 0/7` usage, empty-by-default linking, sandboxed iframe + allow-list exec. Audited A-Z from `pagelib/pagelib.go`, `handlers/instance_page_*.go`, `repository/instance_page_repo.go`, `CustomPageView.tsx`, `customPageSdk.ts`, `instancePages.ts`, `InstancePageStudio.tsx`, `marketplace.json`, `GUIDE.md`.

Goal: close every correctness/permission/parity gap, then add the missing platform surface so the system does everything a top-level pages system can do. Explicitly OUT: arbitrary npm, raw `fetch`/WS/storage/cookies outside `sdk.*`, SSR/SSG, HMR.

---

## PART A — FIX / MODIFY (14)

### F1. Link OWN authz missing
- File: `panel/backend/internal/api/handlers/instance_page_handler.go:2050 LinkInstancePageHandler`
- Change: add `HasScope(InstancePagesOwn|All|Manage)` same as Get/Update/Delete/Build. Bulk `:1887` — attribute + enforce per-row.
- Accept: OWN user cannot link others' pages; test both handlers.

### F2. Execute permission split
- Files: `server.go:690-691,717`, `instance_page_handler.go:2291,2879,3037`
- Change: decide one model: either SDK `execute-action` requires instance `MANAGE` for mutating types (`shell/write/delete/docker/kvm/lxd/chmod/archive/extract`) and `VIEW` only for read types, OR keep VIEW + add per-action `readonly` flag. Document in GUIDE §17.
- Accept: same edge effect cannot have two different gates without reason; tests for both paths.

### F3. KV hardening
- Files: `instance_page_kv.go:77 pageKVScope`, `page_kv_repo.go:39`
- Change: add `IsInstanceSuspended → 403` (match execute handlers), add `RecordActivity` on Put/Delete, paginate `List` (`?limit/offset`, default 100, max values size guard).
- Accept: suspended instance KV-writes fail; audit row written; list of 100×64KiB does not OOM response.

### F4. Lifecycle coupling
- Files: `instance_page_handler.go:1821 Delete, 4601 resync`, `078_page_kv.sql`
- Change: (a) add `POST /api/instance-pages/:id/unlink {template_ids}` removing slug + stale `slug/...` rows; (b) delete library page → warn + optional cascade-unlink (never silent); (c) `page_kv` FK or cleanup job on instance/template delete; (d) resync preserves `bundle_css` + stamps per-page `version` not catalog `Version:4713`.
- Accept: unlink endpoint works; orphan `spec.pages` + `page_kv` cannot accumulate.

### F5. Bulk vs single divergence
- File: `instance_page_handler.go:1942`
- Change: bulk INSERT must include `bundle_js/bundle_css/build_status/build_log` + same validation as `repo.Create:192`.
- Accept: bulk-imported react page carries prebuilt bundle and renders without rebuild.

### F6. Panel pages parity + Delete bug
- Files: `panel_page_handler.go`, `panel_page_repo.go:46-75,354`
- Change: `Delete` checks `RowsAffected` → 404 on missing (match instance pages); document why panel pages stay `html|markdown` only or add `blocks`.
- Accept: `DELETE /api/panel-pages/:missing` → 404, not 204.

### F7. React validator multiline + flat-root
- Files: `instance_page_handler.go:134,144,934`, `reactPageTranspile.ts`
- Change: allow multiline `import {a,\n b} from 'react'/'./x'` (normalize whitespace before regex) on BE + FE identically; either support nested dirs (`importerDir != ""`) or document flat-root-only and keep `../` rejected.
- Accept: FE/BE parity tests with multiline fixtures pass both sides.

### F8. Modules `.kspm` dead config + stubs
- Files: `config/instance_pages.go:11`, `instance_page_handler.go:3636-3919`
- Change: wire `ModulesDir/MaxModuleSize/RequireSignature` (no hardcode `"instance_pages/modules"`), implement `Install:3810` (or remove route), fix `Uninstall:3860` to 404 on missing (`Stat` before `RemoveAll`).
- Accept: config changes take effect; unknown `id/version` uninstall → 404.

### F9. Postgres seed syntax
- File: `postgres/033_instance_pages_builtin_seed.sql:28`
- Change: `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING` (mysql copy already uses `INSERT IGNORE`).
- Accept: `golang-migrate` up on pg passes.

### F10. Update ergonomics + perf
- Files: `instance_page_handler.go:1723 Update, 2112 Link, 3128 getEnabledModules`
- Change: add `PATCH` (partial) or relax `name/slug` required when unchanged; remove double `repo.Get`; parse `Config` once per request (pass `parsedSpec` through).
- Accept: settings-only edit works; no N× YAML marshal on link.

### F11. Iframe SDK parity
- Files: `CustomPageView.tsx:855 BRIDGE_METHODS`, `customPageSdk.ts`
- Change: bridge `subscribe, on/emit/once, prompt, modal, downloadText, copyText, formatBytes, timeAgo, debounce, chart, markdown` (pure ones trivially; `subscribe` via parent-side poll + `ks-sdk-push`). Keep `connectWS` proxied.
- Accept: `html` page can call every host-available method or gets typed `not-allowed` list in docs; no silent subset.

### F12. Renderer mirror drift
- Files: `CustomPageView.tsx:761 renderMarkdown, 472 markdownToHtml, 493 blocksToHtml`
- Change: add `---` rule to host `renderMarkdown` (match `renderSdkMarkdown:772`), group `<li>` into single `<ul>` (match `769`), escape values in `blocksToHtml` (match `renderBlocks`).
- Accept: preview-HTML == live-HTML fixtures.

### F13. Blocks + file-op parity
- Files: `CustomPageView.tsx:540,714`, `customPageSdk.ts:1237-1247,1295`
- Change: string-path `action` block renders enabled button (or document disabled-by-design); `HtmlBlockFrame` gets read-only bridge or explicit banner; `deleteFile/createDirectory` go through `/files` parity endpoints instead of `rm -rf`/`mkdir -p`.
- Accept: blocks demo page behaves identically in all three render paths.

### F14. Theme + registry + catalog hygiene
- Files: `CustomPageView.tsx:1656`, `themeStore.ts:565`, `pageregistry.ts:105`, `marketplace.json:17,32`, `GUIDE.md`
- Change: exact `tabPageMap` match for `page:*` scopes (drop substring); delete stale `instance.panel.files/network/terminal/settings/ports` registry entries (only `overview|sftp` native); unique icons; fix `mc-properties` id≠stem (rename file or document exception); fix GUIDE refs (`rebuild.sh:1194` not 1078, catalog v3.0/2026-09-11, remove `cron-scheduler/docker-manager/api-reference` cites or ship them); restore `docs/instance-page.md` or remove links.
- Accept: per-custom-slug theming works; no dangling doc links.

---

## PART B — ADD (17)

### A15. Versioning + propagation
- Add `page_versions` table (snapshot on every Update/Build) + Studio History tab (diff/rollback) + `template.spec.pages[].page_version` + "Update available" badge + one-click re-link + instance re-deploy prompt.
- Accept: edit → rollback → re-link round-trip works.

### A16. Unlink + clone + bundle export
- `POST /:id/unlink`, `POST /:id/duplicate {slug}`, `GET /:id/export.zip` (yaml + assets). Studio buttons.
- Accept: clone renders; zip re-imports losslessly.

### A17. Visibility + ordering
- Spec row: `visible_to: [] (roles), hidden: bool, order: int`. `resolveInstanceNav` respects them; Studio drag-order.
- Accept: hidden/role-gated pages 404 for unauthorized, nav order persists.

### A18. Routing depth
- Allow `<slug>/<path>/<sub2>` (2 levels) OR document 1-level cap; sub-pages gain own `components` (fallback parent) + `actions` scope choice; `useHashRoute` recipe for `html`.
- Accept: nested URL gates via `isPageAllowed`; no open redirect.

### A19. Shared component library
- New `page_shared_components` table or `type:shared` registry UI in Studio; extract theme header into `ks_theme_head` shared ref; migrate 7 pages to use it.
- Accept: theme fix in one place propagates; 0 duplicated `<style>` headers.

### A20. Page assets
- `page_assets` (hash, mime allow-list, ≤5MiB/file, ≤50MiB/page) + `sdk.asset(name)` URL + Studio upload tab; serve via `GET /api/instance-pages/:id/assets/:hash` with `nosniff` + cache.
- Accept: image/css/js loads in iframe + host without inline bloat.

### A21. Secrets binding
- `sdk.getSecret(name)` (server vault, redacted in logs) distinct from `sdk.kv` (cleartext). Studio marks action `env` refs as secret.
- Accept: secret value never lands in `page_kv`/bundle/build log.

### A22. Schedules + audit
- Per-page action schedules (cron expr, server-side runner reusing Automation engine) + `page_audit` (who/when/what/ok) + InstanceDetail activity feed.
- Accept: schedule fires; audit row per execute/KV/link.

### A23. Offline lint + CI
- `tools/pages_lint.py` (yamllint + `validateInstancePage` caps + `validateReactSource` denylist + slug-unique + marketplace↔`ListNames` parity) + GH workflow fail on drift + `pagelib_test.go` count==marketplace count assert.
- Accept: `rebuild.sh` green only when lint green.

### A24. Library expansion (10 pages)
- Ship: `backups, database, monitoring-logs, firewall-ssl, dns, docker-manager, cron-host, system-info, home(.), api-docs(markdown), blocks-demo(blocks)`. Each: theme header via shared ref, at least one `action` block, preview screenshot.
- Accept: every category + every content type + every SDK group has ≥1 live example.

### A25. Marketplace v2
- Fields: `screenshot, changelog, license, requires_panel, min_version`; per-page `version` bump flow; search/tags filter UI; relative `download_url` support; `resync` per-page.
- Accept: install → update-available → resync without slug clash.

### A26. Studio UX
- In-Studio import (file/URL/market/local) without leaving tab; unsaved-draft action test (temp in-memory page id); sub-page build matrix display; Templates tab reads live library not just `PAGE_STARTERS`.
- Accept: author never context-switches to list page mid-edit.

### A27. File-op docs + quoting audit
- Fuzz `validActionArg/shellQuoteArg` + `validPageActionPath/archiveName`; document `stat/chmod/archive/extract` with shipped examples.
- Accept: no arg-injection; every action type has ≥1 shipped use.

### A28. Exact per-slug theming
- `themeStore.tabPageMap` gains `instance.panel.custom.<slug>` keys; Studio theme preview dropdown per slug.
- Accept: two custom pages can have different `page:*` CSS.

### A29. i18n/a11y/mobile/print
- `{{t:key}}` dict per page + `sdk.locale()`; focus states, ARIA on blocks, responsive tables, print CSS.
- Accept: Lighthouse a11y ≥90 on blocks/markdown render.

### A30. List UX
- Search/sort/filter/paginate library (100+ pages), bulk link/unlink, stale-build + orphan-spec detectors.
- Accept: 200-page library stays usable.

### A31. Quotas + rate limits
- Per-instance caps (exec/min, KV writes/min, asset bytes) + `429` + Studio display; reuse `clampActionTimeout[1,600]`.
- Accept: abusive page cannot starve edge.

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
