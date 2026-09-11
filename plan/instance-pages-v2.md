# Instance Pages — Near-Real v2 Plan (the 7 doable upgrades)

Status quo (2026-09-11): `content_type=react` supports JSX + light TS
(`type/interface/enum/namespace`, `: T`, `as T`, `<T>`, `!`, `?.`),
`import ... from 'react'`, declaration `export`, ambient `declare` erasure —
transpiled dependency-free in `panel/frontend/src/shared/lib/reactPageTranspile.ts`,
mirrored by Go `validateReactSource`. Still missing vs real React+TS: the 7
items below. Explicitly OUT (security boundary, will not do): arbitrary npm,
raw `fetch`/WS/storage/cookies/workers outside `sdk.*`, SSR/SSG, HMR/tests/
storybook, decorators.

## 1. Allowlisted libs via `sdk` (chart, markdown)

Goal: `sdk.chart(el, series)` (canvas, theme-aware via `--ks-*`) +
`sdk.markdown(md)` (render a safe subset to HTML string) so pages stop
hand-rolling charts/parsers. No new deps: implement dependency-free in
`customPageSdk.ts` (chart ~120 lines canvas bars/lines; markdown reuses the
subset rules of `CustomPageView.tsx` `renderMarkdown`). No `import` needed.
Verify: harness render test + demo block in `react-dashboard.yaml`.

## 2. Multi-file page sources (virtual modules)

Goal: Studio "Files" list per page (`index` + named modules); `import { x }
from './util'` resolves at transpile time by concatenation in dependency
order (relative paths only, `.`/`..` outside root rejected, cycle → clear
build error). Storage: new `page_modules` JSON column? No — reuse
`components` with `type: 'module'` (`{name, content}`), zero migration;
`transpileReactPageSource(src, modules)` gains optional second arg, default
`{}` keeps old call sites working. Backend validator: allow
`from './...'` imports (same jail check server-side). Verify: 2-module demo
+ cycle/escape unit tests both sides.

## 3. In-page router helper

Goal: `sdk.tabs()`-level helper — `sdk.useHashRoute(routes, fallback)` hook
(multiline-safe, works with `sdk.pageSlug` + `KS_PAGE_QUERY`) + docs pattern
for tab<nav state without reloads. Pure frontend addition to
`customPageSdk.ts` + one GUIDE recipe. No `react-router` exposure (host
router must stay panel-owned). Verify: harness + dashboard tabs migrated to
it in a follow-up page edit.

## 4. Lite diagnostics in Studio

Goal: pre-Build warning list from our own scanner (unbalanced brackets,
unknown `sdk.*` method typo via allowlist of `CustomPageAPI` keys, `return
Page;` missing, `fetch(`/`localStorage` that will fail validation). New
`diagnoseReactPageSource()` next to the transpiler; `PageStudioReactSection`
shows warnings inline (non-blocking; Build stays the gate). No TS compiler,
no new deps. Verify: warning fixtures incl. zero-false-positive run over
shipped `pages/*.yaml` sources.

## 5. Monaco editor (needs explicit ok — heavy)

Goal: replace Studio `<textarea>` with `monaco-editor` (+ `vite-plugin-monaco`
or CDN-offline ESM bundle) with `sdk`/`React` typings stub + JSX/TS
highlighting. Cost: ~MBs of bundle, new dep, build-time change, offline
packaging review. Do NOT start without user sign-off. Verify: typecheck,
bundle-size note, offline load test.

## 6. New edge action types

Goal: extend `PageActionDef.type` beyond
`shell/read_file/write_file/list_files/docker/kvm/lxd` for proven needs
(candidates: `stat`, `chmod`, `archive`/`extract` — today hand-rolled via
shell). Touches: `customPageSdk.ts` types + Studio Actions tab options +
`instance_page_handler.go` allow-list/`savedActionMatches` + edge executor +
Go tests. One action per change, allow-listed end to end. Verify: new
`validateReactSource`-adjacent tests + edge round-trip via existing action
test path.

## 7. Per-page server KV store

Goal: `sdk.kv.get/set/delete` persisted server-side per instance+page
(survives browsers/profiles, unlike `sdk.storage` localStorage). Needs: new
migration x3 DBs (`page_kv` table: `instance_id, page_slug, k, v, updated`;
never edit shipped migrations), `POST /api/instance-pages/kv/*` scoped to
`VIEW_INSTANCES` + `findSpecPageRow` family check, SDK wrappers, quota
(e.g. ≤100 keys, ≤64KiB value). Verify: migration compat x3, quota tests,
cross-profile read-back.

## Build order

1, 3, 4 (frontend-only, additive) → 2 (transpiler+validator, needs parity
tests both sides) → 6, 7 (backend/edge, migrations for 7 only) → 5 last
(gated on sign-off).

## Verify (loop.md CHECKLIST V, each item)

- `go build ./... && go test ./...`, frontend `tsc --noEmit`, transpile
  harness (extend `/tmp` suites or repo tests where they exist).
- FE/BE parity re-check for every validator/transpiler rule change.
- `rebuild.sh` after green; confirm `pagelib/library` + `ui/dist` carry it.
