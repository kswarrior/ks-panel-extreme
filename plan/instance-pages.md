# Instance Pages — React Build Plan

Problem: `html` pages whole-refresh (`CustomPageView.tsx:1326` `srcDoc` rebuild on theme/search/context) and `actions` allow-list (`shell/read_file/write_file/list_files/docker/kvm/lxd`, `savedActionMatches:1399`) can't do what builtins (`InstanceFiles/Terminal/Ports/Automation/Env`, `InstanceDetail.tsx:1151-1376`) do. Complex pages work as builtin React, fail as HTML.

Goal: Studio `TSX` -> `Build` button -> sandboxed React bundle -> load per-instance. Same isolation as HTML today (opaque-origin iframe, `postMessage` bridge only), not host mount.

## Model

Extend `InstancePage` (`features/instance-pages/types/instancePage.ts:41`, `models/instance.go:56`):
- `content_type += 'react'`
- new columns: `source_tsx TEXT` (author code), `bundle_js TEXT` + `bundle_css TEXT` (build output, `≤1MiB` each like `content_html`), `build_status (idle|building|ok|error)`, `build_log TEXT (≤64KiB)`
- `actions/components/sub_pages/configure` unchanged — React pages use same `runAction/fetchPanel` allow-list + tokens.

Migration `0xx_instance_pages_react.sql` x3 DBs (mysql/postgres/sqlite), never edit shipped migration.

## Backend (`Go`)

New file only + thin wiring, no edits to `modengine/`:
- `handlers/instance_page_build.go`: `POST /api/instance-pages/:id/build {source_tsx}` (`MANAGE_INSTANCE_PAGES` + `EDIT`):
  - validate: size `≤512KiB`, imports allowlist `react/react-dom/KSPageSDK` only (regex on `from '...'`), no `eval/__proto__/fetch(` raw — must use `KSPageSDK.fetchPanel`.
  - build: `esbuild` Go API (or sidecar `node`, timeout 30s, `jsx:automatic`, `minify:true`, `target:es2020`), output `bundle_js/css`. On fail -> `build_status=error + build_log`.
  - audit `activity_logs`.
- `instance_page_handler.go:338 validateInstancePage`: accept `content_type=react`, cap `source_tsx/bundle_*` like `content_html`.
- Serve: reuse `.kspm` pattern (`instance_page_handler.go:2268 ServeAsset`): `GET /api/instance-pages/:id/bundle.js|bundle.css` (`VIEW_INSTANCES` + `isPageAllowed` check), `no-cache`, `CSP: sandbox`, traversal-guarded.
- `server.go`: mount `/build` + bundle routes in existing `instance-pages` group.

## Frontend (`TS React`)

- Studio: `InstancePageStudio.tsx:71` + new `PageStudioReactSection.tsx`: `Monaco` TSX editor + `Build` button (`POST /:id/build`), status badge + `build_log` viewer. Preview via new `ReactModuleView` (same component as runtime).
- Render: `CustomPageView.tsx:1284` branch `if (content.type==='react')` -> `ReactModuleView`:
  - stable `<iframe sandbox="allow-scripts" key={pageSlug} srcDoc={shell}>`, shell contains `importmap{react, KSPageSDK-shim}` + `<div id=root>`.
  - bundle loaded via `import(bundleUrl)` inside iframe, mount to `#root`. `KSPageSDK` injected as prop/window, same `BRIDGE_METHODS:555` (`runAction/fetchPanel/connectWS/toast/confirm/navigate/storage`).
  - live updates (`theme/instanceContext/query`) pushed via `postMessage`, never rebuild `srcDoc` — fixes whole-refresh.
- `instancePages.ts`: `getPageContent` returns `{type:'react', bundleUrl, actions, components}`; `isPageAllowed` unchanged.
- `pagelib/library/` + `marketplace.json`: `react` pages ship as `source_tsx` + prebuilt `bundle_js` so offline binary works.

## Security (fail closed)

- Bundle runs opaque-origin, `no allow-same-origin` — same as HTML. Cannot touch panel DOM/cookies/storage except bridge.
- Build sandbox: timeout, memory cap, no network at build, dependency allowlist, output size cap.
- Runtime: `fetchPanel` only `/api/instances/<own-id>/...`, `navigate` only `/instances/<own-id>/...` (`pageNavigateTarget`), `execute-action` still `savedActionMatches + findSpecPageRow`.

## Build order

1. Phase-0: migration + types + Studio editor (save `source_tsx` only, no build). Verify `retest.sh`.
2. Phase-1: `POST /:id/build` (esbuild) + bundle serve + `ReactModuleView` iframe + 1 pilot (`files` clone). Goal: edit TSX -> Build ok -> per-instance load with `useState`, no refresh on theme change.
3. Phase-2: extend `KSPageSDK` to builtin parity (`upload/chmod/archive/ports/automation/env` wrappers over `fetchPanel`), migrate complex HTML pages, marketplace `react` entries.

## Verify (`loop.md` CHECKLIST V)

- `go build ./... && go test ./...`, frontend `build+typecheck+lint`, migration compat x3.
- Live: Studio write TSX -> Build ok -> link to template -> deploy -> open `/instances/:id/<slug>` works, theme switch no reload, `runAction/fetchPanel/WS` work, bad import rejected with log.
- Security pass: XSS (bundle can't escape iframe), IDOR (bundle of instance A can't fetch B), oversize/infinite-loop rejected.
