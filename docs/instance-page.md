# Instance Pages — Complete Guide

> **Scope:** Custom instance-panel pages (HTML / Markdown / Visual Blocks) with reusable Components, nested Sub-pages and server-validated Actions. Instance Pages are **empty-by-default**: a template exposes no sidebar pages until an operator imports pages from the library. Each page is a DB row (`instance_pages`) that is copied into `template.spec.pages[]` and snapshotted into `instance.config` at deploy time. The frontend (`CustomPageView` + `instancePages` resolver) then mounts the page inside the instance panel (`/instances/:id/*`). Legacy `kind: 'builtin'` was removed in migration `046_instance_pages_drop_builtin.sql`; only `custom` remains.

> For the legacy `.kspm` module bundle design see `docs/instance-pages.md` (module registry/marketplace). This document describes the **current shipped system**.

---

## 1) Mental Model

```
Instance Page Studio (/instance-pages/studio)          Template Editor (Pages tab)
  ┌─────────────────────┐                               ┌──────────────────────────┐
  │ name/slug/category  │ ──Create/Update──────────────▶ │ Import from library    │
  │ content (html/md/   │   instance_pages table        │  → spec.pages[] entry  │
  │   blocks)           │                               │  (label, icon, actions, │
  │ icon_svg            │ ◀─Import JSON ─────────────── │   sub_pages,components)│
  │ actions[]           │                               └──────────┬───────────────┘
  │ sub_pages[]         │                                          │ serializeSpec()
  │ components[]        │                                          ▼
  └─────────────────────┘                               template.spec (JSON string)
                                                                │
                                                                │ DeployInstance
                                                                ▼
                                                     instance.config (snapshot)
                                                                │
                                                                ▼
   Frontend route: /instances/:id/*  ──►  resolveInstanceNav() / isPageAllowed() / getPageContent()
                                              │                        │
                                              ▼                        ▼
                                        Sidebar tabs             CustomPageView
                                        (resolveInstanceNav)    (html iframe | markdown | blocks + SDK)
```

Key files:
- Types: `panel/frontend/src/features/instance-pages/types/instancePage.ts:25`, `panel/frontend/src/features/instance-pages/types/pageStudio.ts:15`
- Resolver: `panel/frontend/src/shared/utils/instancePages.ts:104`, `panel/backend/internal/api/handlers/instance_page_handler.go:702` (link)
- Rendering: `panel/frontend/src/shared/components/ui/CustomPageView.tsx:884`, `panel/frontend/src/features/instances/pages/InstanceDetail.tsx:95`
- SDK: `panel/frontend/src/shared/lib/customPageSdk.ts:216`
- API: `panel/backend/internal/api/server.go:467` (`/api/instance-pages`), `panel/backend/internal/api/handlers/instance_page_handler.go:40`
- DB: `panel/backend/internal/repository/instance_page_repo.go:32`, `panel/backend/internal/db/migrations/sqlite/049_instance_page_components.sql`, `panel/backend/internal/models/instance.go:56`
- Studio: `panel/frontend/src/features/instance-pages/pages/InstancePageStudio.tsx:67`

---

## 2) Data Model

### 2.1 DB Table `instance_pages`

Created in `032_instance_pages.sql`; extended by `041_instance_page_actions.sql` (`actions`), `047_instance_page_sub_pages.sql` (`sub_pages`), `048_instance_page_type.sql` (`page_type`), `049_instance_page_components.sql` (`components`). All migrations are MySQL/Postgres/SQLite compatible (`panel/backend/internal/db/db.go:408`).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | auto |
| `name` | TEXT | max 200 (`instance_page_handler.go:95`) |
| `slug` | TEXT UNIQUE | see §2.2, max 64 |
| `kind` | TEXT | only `custom` (`validInstancePageKinds` `instance_page_handler.go:72`) |
| `category` | TEXT | free-form, max 500 |
| `page_type` | TEXT | flavor tag (`dashboard`/`status`/`docs`/`admin-panel`/`widget`/`generic`, max 500) |
| `description` | TEXT | max 500 |
| `content_type` | TEXT | `html` \| `markdown` \| `blocks` |
| `content_html` | TEXT | max 1 MiB, `validateBlocksJSON` not applied |
| `content_markdown` | TEXT | max 1 MiB |
| `content_blocks` | TEXT | max 1 MiB, must be JSON array when non-empty (`validateBlocksJSON` `instance_page_handler.go:150`) |
| `icon_svg` | TEXT | max 16 KiB, sanitized server-side (`sanitizeIconSVG` `instance_page_handler.go:135`, 10-pass strip of `<script>/<iframe>/on*=`/`javascript:`) |
| `actions` | TEXT | `""` == none, else JSON array `PageActionDef[]`, max 64 KiB |
| `sub_pages` | TEXT | `""` == none, JSON array `InstancePageSubPage[]`, max 512 KiB, max 20 entries (`047`) |
| `components` | TEXT | `""` == none, JSON array `PageComponentDef[]`, max 512 KiB, max 50 entries (`049`) |
| `created_at`/`updated_at` | DATETIME |  |

Model: `panel/backend/internal/models/instance.go:56` (`Components string`).

### 2.2 Slug

Validated by `validSlug` (`instance_page_handler.go:99`):
- `.` is the reserved Home slug (renders at index route `/instances/:id`)
- else: `^[A-Za-z0-9][A-Za-z0-9._-]*$`, length ≤64, no `/`, no `..`
- Sub-page `path` (inside a page) is stricter: `^[a-z0-9_-]+$`, lowercase, ≤64 (`validSubPagePath` `instance_page_handler.go:292`).

### 2.3 PageComponentDef

`instancePage.ts:55`:

```ts
interface PageComponentDef {
  name: string;              // ^[A-Za-z0-9_][A-Za-z0-9_-]*$, max 64 (instance_page_handler.go:188)
  type: 'html' | 'markdown' | 'block'; // block = JSON blocks array serialized as string
  description?: string;
  content: string;            // max 1 MiB per component
}
```

Referenced in content as `{{component:name}}` (`CustomPageView.tsx:71`). Up to 5 iterative passes replace nested components (component A contains `{{component:B}}`). Unknown names stay literal.

Parsing: `parsePageComponents` (`instancePage.ts:106`) degrades corrupt JSON to `[]`.

Limits: `maxInstancePageComponents=50`, `maxInstancePageComponentsBytes=512 KiB` (`instance_page_handler.go:173`).

### 2.4 InstancePageSubPage

`instancePage.ts:63`:

```ts
interface InstancePageSubPage {
  path: string;              // single segment, maps to <slug>/<path> (e.g. files/edit)
  name: string;              // display label
  content_type: 'html' | 'markdown' | 'blocks';
  content_html?: string;
  content_markdown?: string;
  content_blocks?: string;
}
```

Persisted as JSON string in `sub_pages`. Effective slug is `<parentSlug>/<path>` (`instancePages.ts:40`). Sub-pages are **not** top-level sidebar tabs; `resolveInstanceNav` skips any slug containing `/`. They are reachable only via URL and keep parent tab highlighted (NavLink prefix match).

Limits: `maxInstancePageSubPages=20`, `maxInstancePageSubPagesBytes=512 KiB` (`instance_page_handler.go:165`). Empty `path` rows filtered (`subPagesOf`).

### 2.5 PageActionDef

`instancePage.ts:9`:

```ts
interface PageActionDef {
  name: string;               // unique per page, run via KSPageSDK.runAction(name)
  type: 'shell'|'read_file'|'write_file'|'list_files'|'docker'|'kvm'|'lxd';
  command?: string; path?: string; content?: string; args?: string[];
  open_args?: boolean; env?: Record<string,string>; timeout?: number;
  description?: string;
}
```

`open_args` allows caller to append ≤4 runtime args (validated charset `validActionArg` `instance_page_handler.go:1051`, shell-quoted via `shellQuoteArg`). For `shell` the stored `command` must contain `{{args}}` placeholder to splice extras (`resolveExecPayload` `instance_page_handler.go:1085`).

### 2.6 Template Spec Shape `spec.pages[]`

When a page is linked to a template (`LinkInstancePageHandler` `instance_page_handler.go:586` does `pageEntry["components"] = compsAny`), or added via Template editor (`TemplatePagesImportModal` `TemplateForm.tsx:147` + `serializeSpec` `templateFormUtils.ts:121` / `instanceFormUtils.ts:320`), the spec entry is:

```ts
interface PageOverride {
  slug: string; enabled: boolean; label: string; icon_svg: string;
  kind: 'custom'; content_type?: 'html'|'markdown'|'blocks';
  content_html?: string; content_markdown?: string; content_blocks?: string;
  actions?: PageActionDef[];          // inline array (LinkInstancePageHandler writes array)
  components?: PageComponentDef[];    // inline array (same)
  sub_pages?: InstancePageSubPage[];
}
```

`PageOverride` types: `panel/frontend/src/features/templates/types/templateForm.ts:136`, `panel/frontend/src/features/instances/types/instanceForm.ts:211`. Important: `components` are stored as **inline array** in `spec.pages[]`, not JSON string. The resolver handles both: `parseSpecComponents` (`instancePages.ts:215`) accepts string or array (double-encoded guard).

`serializeSpec` (`templateFormUtils.ts:121`) and `serializeEditor` (`instanceFormUtils.ts:320`) write `components` when non-empty. `parseSpec` (`templateFormUtils.ts:383`, `instanceFormUtils.ts:113`) restores them via `parsePageComponents`/`parseSpecComponents`.

### 2.7 Instance Snapshot `instance.config`

Deploy copies the template's spec (plus any per-instance overrides from `DeployFormShell`/`InstanceAdvancedOptionsFullScreen`) into `instance.config` (JSON string column on `instances`). From then on `InstanceDetail` reads **only** `instance.config` (`InstanceDetail.tsx:111` `parseConfig(instance.config)`) – editing the template later does not affect already-deployed instances. Overrides diffed via `buildOverrides`/`deepEqual` (`instanceFormUtils.ts:416`).

---

## 3) Content Types

### 3.1 `html`

Raw HTML rendered in a **sandboxed opaque-origin iframe** (`CustomPageView.tsx:1084`, `sandbox="allow-scripts allow-forms allow-popups allow-modals"` **without** `allow-same-origin`). The iframe's `srcDoc` is built in `buildIframeDocument` (`CustomPageView.tsx:516`) with:

- Theme CSS baked from `customPageThemeCss(activeTheme)` (`CustomPageView.tsx:822`, `colorUtils.ts:2`)
- `window.KSPageSDK` bridge (postMessage RPC) + `window.KS_PAGE_QUERY = location.search` (sub-pages can read `?path=`)

Supports all SDK features (see §7). `{{component:name}}` resolved before `srcDoc` build (`CustomPageView.tsx:936`). Auto-resize via `ks-iframe-resize` postMessage.

### 3.2 `markdown`

Rendered host-side as React nodes (`renderMarkdown` `CustomPageView.tsx:399`). Supported subset: `#`/`##`/`###` headings, `**bold**`/`*italic*`/`` `code` ``, `[text](url)` links, `-/ *` and `1.` lists. `{{component:name}}` resolved first (`resolveComponentTokens`). Links sanitized via `safeUrl` (only `https:`, `http:`, `mailto:`, relative).

### 3.3 `blocks` (Visual Blocks)

JSON array `BlockRow[]` (`pageStudio.ts:68`):

| `type` | Fields | Render |
|---|---|---|
| `heading` | `value`, `level` 1-3, `align` | `h1/h2/h3` |
| `text` | `value`, `align` | `p` |
| `image` | `value` URL, `align` | `img` (via `safeImgSrc`) |
| `button` | `value` label, `href`, `align` | `a.ks-primary-btn` (via `safeUrl`) |
| `code` | `value` | `pre` |
| `stat` | `value`, `label`, `unit`, `tone` | `glass-card` |
| `table` | `value` JSON `string[][]` | `table` (cells now component-resolved) |
| `list` | `value` JSON `string[]` or newline lines | `ul` (items component-resolved) |
| `html` | `value` raw | `HtmlBlockFrame` sandboxed iframe (component-resolved) |
| `action` | `action` (name), `label`, `confirmText` | `button` that calls `runSavedAction` → `KSPageSDK.runAction` |
| `spacer`/`divider` | — | spacing |

Editor: `PageStudioBlocksEditor` (`PageStudioBlocksEditor.tsx:19`) visual mode + JSON fallback, move-up/down, `action` block picks from `actionNames`. Every textual field runs `resolveComponentTokens` so `{{component:header}}` works like React composition (nested up to 5 passes). `HtmlBlockFrame` (`CustomPageView.tsx:355`) renders each `html` block in its own sandbox, height auto-reported.

Components of type `block` are JSON blocks string; `componentToHtml` → `blocksToHtml` produces HTML for substitution into HTML pages.

---

## 4) Components — React-like Reusability

**Goal:** Define a UI fragment once and load it on **main page *or* any sub-page** of the same family.

- Authoring: Studio → **Components** tab (`PageStudioComponentsSection.tsx:15`, `pageStudio.ts:50` `ComponentRow`). Add → name (`^[A-Za-z0-9_][A-Za-z0-9_-]*$`, first char alnum/underscore), type (`html`/`markdown`/`block`), optional description, content (6-row textarea).
- Reference: In **any** content field (main `content_html`/`content_markdown`/`content_blocks` values **or** any `sub_pages[].content_*`) write `{{component:my_header}}` (whitespace tolerant, `COMPONENT_TOKEN_RE` `CustomPageView.tsx:71`). Multiple tokens per file; unknown names stay literal.
- Persistence: `InstancePageStudio.tsx:308` `compDefs = parsePageComponents(compsToJSON(components))` → `payload.components = compsToJSON(components)` (`pageStudioUtils.ts:178`). Then:
  - Library row `instance_pages.components` JSON string
  - Template `spec.pages[].components` inline array
  - Instance `config` snapshot (same)
  - Resolver `getPageContent` (`instancePages.ts:279`) maps top-level via `pagePayloadFromRow` → `parseSpecComponents(p.components)` and sub-page via `pagePayloadFromSub(sub, parentComps)` where `parentComps = parseSpecComponents(parent.components)` – i.e. sub-pages **inherit** the parent's components. A sub-page cannot define its own components (by design: one family, one component set).
- Rendering:
  - HTML pages: `CustomPageView.tsx:936` `resolveComponentTokens(html, components)` before iframe `srcDoc`
  - Markdown: `renderMarkdown` → `resolveComponentTokens` before line split
  - Blocks: `renderBlocks` per-block `resolveInString` (heading/text/image/button/stat/table/list/html/action) + recursive
  - Static Studio preview (no instance bound): `pageStudioUtils.ts:243` `renderPreview(..., components)` and `PageStudioPreviewSection.tsx:42` `staticSrcDoc` now use `previewContent.components` so authors see composition without binding an instance.

Example:

```html
<!-- Instance Page Studio → Components tab -->
name: site_header  type: html
content: <header class="ks-card"><h2>{{component:logo}} KS Demo</h2></header>
---
name: logo  type: html
content: <span style="color:var(--ks-info)">◆</span>

<!-- Main page (html) -->
{{component:site_header}}
<div class="ks-card"><p>Welcome to {{instance.name}}</p></div>
<button onclick="KSPageSDK.runAction('restart')">Restart</button>

<!-- Sub-page files/edit (html) will also resolve {{component:site_header}} because it inherits parent components -->
```

Nested `site_header → logo` resolves in 2 passes (bounded to 5 to prevent cycles).

> **File map for components:** Studio state `InstancePageStudio.tsx:104`, helpers `pageStudioUtils.ts:160` (`blankComponent`, `compRowsFromJSON`, `compsToJSON`, `validateCompRows`), types `instancePage.ts:55`, validation `instance_page_handler.go:257`, repo `instance_page_repo.go:109`, resolver `instancePages.ts:215`, renderer `CustomPageView.tsx:79`.

---

## 5) Sub-pages (Multi-page Families)

A page can ship extra routes (e.g. Files manager with `/files` and `/files/edit`):

- Storage: `instance_pages.sub_pages` JSON string (`instancePage.ts:73` `parseSubPages`) → template `spec.pages[].sub_pages` inline array → instance `config`.
- UI: Studio → **Sub-pages** tab (`PageStudioSubPagesSection.tsx:23`). Each row: `path` (single lowercase `a-z0-9_-`, becomes `/<slug>/<path>`), `name`, `content_type` selector, textarea (or JSON for blocks). Reorderable, collapsible.
- Routing: instance panel mounts a single catch-all `path="/instances/:id/*"` → `InstanceDynamicPage` (`InstanceDetail.tsx:95`) reads `wildcard` (`useParams()['*']`), `effectiveSlug = wildcard || '.'`. Gate: `isPageAllowed(effectiveSlug, spec)` (`instancePages.ts:141`) checks exact `slug`, `original_slug`, nested `findSubPageEntry`, and fallback “any `<parent>/<path>` under enabled parent”.
- Nav: `resolveInstanceNav` (`instancePages.ts:104`) emits only top-level slugs; `InstanceNavContext` (`InstanceNavContext.tsx`) syncs per-instance nav from `instance.config` (`InstancePanel` `InstanceDetail.tsx:51` `useInstanceNavSync`). `InstanceTabs` / `Sidebar` consume it.
- Content: `getPageContent(slug, spec)` (`instancePages.ts:306`) prefers `findPageRow(slug)` (top-level) else `findSubPageEntry`. Sub-page payload type inferred (`html`/`markdown`/`blocks`), `components` inherited as above, `actions` **not** inherited (only parent’s `actions` are used; page-bound SDK checks family via `findSpecPageRow`).
- Preview: Studio `Preview` tab select `previewTarget` (`main` or `sub.id`); `previewContent` (`InstancePageStudio.tsx:310`) now shares `actionDefs`/`compDefs` for sub-pages. `PageStudioPreviewSection.tsx:127` mounts `CustomPageView` with `pageSlug = slug` or `slug/path`.

Limits: max 20 sub-pages, 512 KiB JSON.

---

## 6) Actions (Executable Page Actions)

Actions are **not** free-form exec. The author declares them in Studio → **Actions** tab (`PageStudioActionsSection.tsx`); the runtime only runs a payload that **exactly** matches a stored definition.

- Shape: `PageActionDef` (§2.5). Studio row: `ActionRow` (`pageStudio.ts:36` `id/name/type/command/path/content/args/env/timeout/description/open_args`). `actionsToDefs`/`defsToActions` (`pageStudioUtils.ts:44`, `74`) handle `env` JSON, `args` space-split, `open_args` boolean.
- Persistence: same path as components: `instance_pages.actions` JSON string → `spec.pages[].actions` inline array → `instance.config` snapshot. Import modals copy them (`TemplateForm.tsx:129` `parsePageActions`, `instanceFormUtils.ts:139`).
- Execution paths:
  1. **Studio Test** (`InstancePageStudio.tsx:332` `testExecute`) → `POST /api/instance-pages/:id/actions` (`ExecutePageActionHandler` `instance_page_handler.go:774`, `VIEW_INSTANCES?` actually `MANAGE_INSTANCE_PAGES` edit, checks `getEnabledPages` for instance).
  2. **Live page SDK** (`CustomPageView` iframe bridge or `createCustomPageSDK` `customPageSdk.ts:277` `executeAction` → `POST /api/instance-pages/execute-action` (`ExecuteCustomPageActionHandler` `instance_page_handler.go:1151`, gated by `VIEW_INSTANCES`, page-bound via `pageSlug` → `findSpecPageRow`, allow-list via `savedActionMatches` `instance_page_handler.go:951` + `resolveExecPayload` `instance_page_handler.go:1085`, clamped timeout `clampActionTimeout` 1-600s).
- Edge proxy: panel → `edge.New(node, token)` → `POST <edge>/api/edge/page-action` (`edge/internal/pageaction` – shell/read_file/write_file/list_files/docker/kvm/lxd). Client timeout `reqTimeout+5s`.

`savedActionMatches` compares `type/command/path/content/args/env` exactly; `open_args` allows extra `args` (≤4, `validActionArg` charset `a-zA-Z0-9 ._/ :@+=,-`, shell-quoted). `shell` with `open_args` requires `{{args}}` in stored command.

Studio preview when no instance bound uses `STATIC_SDK_STUB` (`pageStudioUtils.ts:212`) that rejects every `executeAction`/`runAction` with “Static preview — bind an instance”.

---

## 7) CustomPageView & SDK

### 7.1 Rendering Modes

| `content.type` | Host vs iframe | SDK |
|---|---|---|
| `html` | **iframe** `srcDoc` (`CustomPageView.tsx:1086`) opaque origin, `buildIframeDocument` includes `KSPageSDK` stub via `postMessage` | Bridged via `ks-sdk-call`/`ks-sdk-response` (whitelisted `BRIDGE_METHODS` `CustomPageView.tsx:493`) |
| `markdown`/`blocks` | **Host React** (`renderMarkdown`/`renderBlocks`) | `window.KSPageSDK = createCustomPageSDK(...)` directly (`CustomPageView.tsx:910`) |

Both share `instanceContext` (`InstanceContext` `customPageSdk.ts:7` – `id/name/kind/status/template_id/node_id/config/...` plus `install_*`).

### 7.2 Theme

Iframes can’t inherit CSS variables. `customPageThemeCss(activeTheme)` (`CustomPageView.tsx:803`) bakes concrete `--ks-*` values (font, heading/body/muted, accent success/warning/danger/info, card/form) into iframe `<style>`. Also used for `HtmlBlockFrame` (`CustomPageView.tsx:380` `activePageThemeCss()`) and Studio static preview (`pageStudioUtils.ts:248`).

### 7.3 KSPageSDK Surface

`createCustomPageSDK(instanceContext, savedActions, pageSlug)` (`customPageSdk.ts:216`):

```ts
sdk.instance: InstanceContext
sdk.actions: PageActionDef[]; sdk.runAction(name, overrides?) // saved allow-list
sdk.executeAction(action: PageAction) // generic, but still page-bound on /execute-action
sdk.fetchPanel(path, init?) // prefix-validated to /api/instances/:id/… (pageNavigateTarget  `customPageSdk.ts:182`)
sdk.shell/readFile/writeFile/listFiles/deleteFile/createDirectory/docker/kvm/lxd
sdk.subscribe(action, cb, intervalMs) // polling
sdk.navigate(to) // validated to /instances/:id/** (fails outside)
sdk.toast/confirm/prompt/modal
sdk.on/once/emit (page-local) + parent relay ks-page-event
sdk.storage.{get,set,delete,clear,keys} // localStorage per instance/page (ks_page_<id>_)
sdk.connectWS(protocols?) // host: direct WebSocket to /api/instances/:id/terminal; iframe: parent proxies ks-ws-* messages
window.KS_PAGE_QUERY // parent’s location.search injected as safeInlineJson (sub-page param e.g. ?path=/etc/app.conf)
```

`fetchPanel` and `navigate` fail closed on `//` or `.`/`..` segments or oversized (>2048).

HTML pages receive SDK via `buildIframeDocument` boot (`CustomPageView.tsx:517` `bootstrapSrc`): `rpc` over `postMessage`, `sdk.subscribe`, `sdk.on/once/emit`, `sdk.connectWS` shim. Auto-resize interval reports `ks-iframe-resize`.

Host pages get SDK on `window` for `renderBlocks` `action` buttons (`CustomPageView.tsx:195` `runSavedAction`) and markdown code can call `KSPageSDK.runAction`.

Bridge parent handler (`CustomPageView.tsx:947`) validates source === iframe, method ∈ `BRIDGE_METHODS`, `sdkRef` existence, then dispatches to `sdkRef.current` (confirm → `confirmDialog`, navigate → `pageNavigateTarget` then `navigate()`).

### 7.4 Safety in Rendering

- `safeUrl` (`CustomPageView.tsx:54`) only `https:|http:|mailto:` or relative; else `#`
- `safeImgSrc` (`CustomPageView.tsx:64`) adds `data:image/` allowance
- `safeInlineJson` (`CustomPageView.tsx:509`) escapes `<` and U2028/2029 for `<script>` embed
- `cssConst` (`CustomPageView.tsx:789`) strips `{}<>\\;` and controls before injecting theme values

---

## 8) Studio (Instance Page Studio)

Route: `/instance-pages/studio` (create) and `/instance-pages/:id/studio` (edit) (`router.tsx:507`, gated `MANAGE_INSTANCE_PAGES`).

Layout: `FormPage` + left `PageStudioTabs` (`pageStudio.ts:17` Templates/General/Main page/Sub-pages/Components/Actions/Preview) → one visible `Section` on right (`InstancePageStudio.tsx:528` grid 220px+1fr).

- **Templates** (`PageStudioTemplatesSection.tsx`): filterable `PAGE_STARTERS` (`pageStarters.ts`) — each starter provides `name/slug/category/description/iconSvg/contentType/html/markdown/blocks/actions/subPages`. `applyStarter` (`InstancePageStudio.tsx:207`) replaces draft after confirm, loads `sub_pages` and `actions`.
- **General** (`PageStudioSettingsSection.tsx`): `name`, `slug` (live validation), `category`/`type` (suggest lists `CATEGORY_OPTIONS`/`TYPE_OPTIONS` `pageStudio.ts:29`), `description`, `icon_svg` sanitized.
- **Main page** (`PageStudioContentSection.tsx:32`): `content_type` switch, textarea (html/md) or `PageStudioBlocksEditor` (`PageStudioBlocksEditor.tsx:19`) visual/JSON toggle, copy/export/import.
- **Sub-pages** (`PageStudioSubPagesSection.tsx:23`): collapsible cards, move up/down, `path` sanitized `toLowerCase().replace(/[^a-z0-9_-]/g,'')`, `validateSubRows` (`pageStudioUtils.ts:142`).
- **Components** (`PageStudioComponentsSection.tsx:15`): collapsible cards, `validateCompRows` (`pageStudioUtils.ts:191` name `^[A-Za-z0-9_][A-Za-z0-9_-]*$` unique, type `html/markdown/block`).
- **Actions** (`PageStudioActionsSection.tsx`): per-row fields, `open_args` toggle, test-execute against selected instance (requires saved page + `previewInstanceId`).
- **Preview** (`PageStudioPreviewSection.tsx:42`): selector for test instance + target page (main or sub), live `CustomPageView` when `previewInstance && previewContext` else static iframe `renderPreview(...,components)`. Full-screen overlay over `<main>` (`InstancePageStudio.tsx:118` measure + Esc handling).

State: `page` partial `InstancePage`, `actions` `ActionRow[]`, `components` `ComponentRow[]`, `subs` `SubPageRow[]`, `blocksMode` visual/json, `previewInstanceId`, `previewTarget`, `fullPreview`.

Save: `handleSave` (`InstancePageStudio.tsx:350`) validates builtin guard, required `name`/`slug`, slug regex `^[a-z0-9][a-z0-9-._]*$` no `..` length≤64, `validateSubRows`/`validateCompRows`, then `payload = {name,description,slug,kind,category,type,content_type,content_html,content_markdown,content_blocks,icon_svg,actions: JSON string, sub_pages: JSON string, components: JSON string}` → `createInstancePage`/`updateInstancePage` (`shared/api/admin.ts`). Navigate to `/instance-pages`.

Import/Export: `exportJson` (`InstancePageStudio.tsx:395`) emits `{name,slug,kind,category,type,description,content_type,content_html,content_markdown,content_blocks,icon_svg,actions: [] , pages: subPages, components: [] }` (typed arrays form). `importJson` (`InstancePageStudio.tsx:424`) merges `name/slug/kind→custom/category/type/description/content_type/*_html/*_markdown/*_blocks/icon_svg/actions` and replaces `subs`/`components`.

---

## 9) Linking to Templates & Instance Deploy

### 9.1 Instance Pages Library

List page `InstancePages.tsx` (table, search, `SkeletonGrid`, `CardMenu`), detail `InstancePageDetail.tsx`, stats `InstancePageStats.tsx`. API `shared/api/admin.ts` (`listInstancePages`, `getInstancePage`, `createInstancePage`, `updateInstancePage`, `deleteInstancePage`, `linkInstancePage`, `importInstancePage`, `listInstances`).

### 9.2 Link Handler

`POST /api/instance-pages/:id/link` (`LinkInstancePageHandler` `instance_page_handler.go:586`, body `{template_ids:number[], label?:string, icon_svg?:string, enabled?:boolean}`) for each `tid` loads `template.spec`, builds `pageEntry` map (`slug,original_slug="",kind=custom,label,enabled,content_type,content_html,content_markdown,content_blocks,actions:subPages:components` inline arrays, icons sanitized), merges into `spec.pages[]` replacing existing slug or dropping legacy `slug+"/..."` flattened rows, `json.Marshal` → `templateRepo.Update`. Activity `RecordActivity`.

### 9.3 Template Editor

`TemplateForm.tsx:338` → import modal `TemplatePagesImportModal` (`TemplateForm.tsx:66`) lists `instancePages.filter(kind!=='builtin')` (`listInstancePages`), picks slugs → `PageOverride[]` with `parsePageActions`/`parseSubPages`/`parsePageComponents` (`TemplateForm.tsx:129`). `form.pages` (`PageOverride[]` `templateForm.ts:136` now includes `components`) is edited (label/path/icon, reorder, `CustomPageStudio` for content, remove). Save → `serializeSpec` (`templateFormUtils.ts:18`/`instanceFormUtils.ts:240` for deploy) writes `pages: []` with `components` when non-empty.

`parseSpec` (`templateFormUtils.ts:232` `instanceFormUtils.ts:113`) restores `pages` handling both string-encoded `actions` and inline arrays, and now also `components` (string `parsePageComponents` or array). `resolveInstanceNav`-style deduplication by slug.

### 9.4 Deploy / Instance Advanced

`DeployFormShell.tsx`, `InstanceAdvancedOptionsFullScreen.tsx:336` (`PageOverride` state, `addPages` via `listInstancePages`/`parsePageComponents`), `instanceFormUtils.ts:320` `specToEditor`/`serializeEditor` (includes `components`), `buildOverrides` diff vs baseline, then `instance.config` snapshot.

Instance route: `/instances/:id/*` (`router.tsx:109`, umbrella `VIEW_INSTANCES`) shell `InstancePanel` (`InstanceDetail.tsx:24`) syncs `spec = parseConfig(instance.config)` into `InstanceNavContext` (`useInstanceNavSync`), `Outlet` renders `InstanceDynamicPage`.

---

## 10) Frontend Routing & Instance Panel

`app/router.tsx:109` (instance panel under `Layout`):

```tsx
<Route path="/instances/:id/*" element={<RequireAuth><RequirePermission VIEW_INSTANCES><InstancePanel/></RequirePermission></RequireAuth>}>
  <Route index element={<InstanceDynamicPage/>}/>
  <Route path="*" element={<InstanceDynamicPage/>}/>
</Route>
```

`InstanceDynamicPage` (`InstanceDetail.tsx:95`):
- `wildcard = useParams()['*']` → `effectiveSlug = wildcard.replace(/\/+$/,'') || '.'`
- `isPageAllowed(effectiveSlug, spec)` else render “not part of template” or `NoPagesState` guidance
- `label = getPageLabel(effectiveSlug,spec) ?? (effectiveSlug==='.'?'Home':effectiveSlug)`
- `content = getPageContent(effectiveSlug,spec)` → if empty → “no content” card
- `instanceContext = {id,name,kind,status,template_id,node_id,owner_id,config,external_id,created_at,install_* ...}` → `<CustomPageView content={content} title={label} instanceContext={instanceContext} pageSlug={effectiveSlug}/>`

Navigation bridge: host-origin pages dispatch `ks-navigate` custom event (`InstancePanel` `InstanceDetail.tsx:34` → `pageNavigateTarget(instanceId,to)` then `navigate(target)`); iframe pages go via bridge `navigate` method.

---

## 11) Permissions & Gates

- `panel/backend/internal/permissions/keys.go` Area `instancePagesG = AreaGroups[8]`
- Umbrella `MANAGE_INSTANCE_PAGES` plus verbs `INSTANCE_PAGES_VIEW|CREATE|EDIT|DELETE` (`instance_page_handler.go` via `server.go:467` `requireUmbrellaOrAction(instancePagesG, ...)`). Library CRUD gated there; `execute-action`/`execute-module-action` gated `VIEW_INSTANCES` (`server.go:488`) because page runs inside instance panel.
- Existing instance-pages docs: `server.go:469` comment: “reusable page definitions (HTML/markdown/visual blocks)”.
- `RequirePermission` wrapper in router (`router.tsx:503` `InstancePages`, `InstancePageStudio`, `InstancePageDetail`, `InstancePageStats` → `MANAGE_INSTANCE_PAGES`).

---

## 12) Validation & Limits (server-side, all fail closed)

`validateInstancePage` (`instance_page_handler.go:306`):
- `name` required, ≤200; `description`/`category`/`type` ≤500
- `slug` required `validSlug`; `.` allowed; no `..`
- `content_*` ≤1 MiB each; `content_blocks` when non-empty must be JSON array
- `icon_svg` ≤16 KiB, `sanitizeIconSVG`
- `kind` default `custom`, only `custom` accepted (builtin rejected `kind must be "custom"`)
- `content_type` ∈ `html|markdown|blocks` when set (empty → default `markdown` on create)
- `actions` ≤64 KiB, JSON array
- `sub_pages` ≤512 KiB, JSON array ≤20, each `path` `validSubPagePath`, `name` required, `content_type` ∈ set
- `components` (`validateComponentsJSON` `instance_page_handler.go:257`): ≤512 KiB, JSON array ≤50, each `name` `validComponentName` (`^[A-Za-z0-9_][A-Za-z0-9_-]*$` max64) unique, `type` ∈ `html|markdown|block`, `content` ≤1 MiB
- Handler returns 400 with string error; frontend `getErrorMessage` (`pageStudioUtils.ts:19`) surfaces it.

---

## 13) Theme Integration

Pages follow the active panel theme like host UI, despite iframe opacity. `customPageThemeCss(activeTheme)` (`CustomPageView.tsx:803`) re-emits tokens `--ks-*` (font, heading/body/muted/link, ok/warn/bad/info washes, card/input/button) from `themeStore.active()` (`shared/stores/themeStore.ts:413`). Used in:
- HTML iframe `srcDoc` (`CustomPageView.tsx:942`)
- `HtmlBlockFrame` (`CustomPageView.tsx:380`)
- Studio static `renderPreview` (`pageStudioUtils.ts:248`)

`ThemeAssignMenu` / `PageRegistry` (`pageregistry.ts:14`) groups pages into areas `auth|admin|instance` for per-page theme assignment.

---

## 14) API Reference

| Method | Path | Gate | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/instance-pages/` | `VIEW` | — | `InstancePage[]` ordered by `name` (`instance_page_repo.go:32`) |
| `GET` | `/api/instance-pages/:id` | `VIEW` | — | `InstancePage` or 404 |
| `POST` | `/api/instance-pages/` | `CREATE` | `instancePageDTO` JSON | `{id}` 200 or 409 slug exists |
| `PUT` | `/api/instance-pages/:id` | `EDIT` | `instancePageDTO` | 204 |
| `DELETE` | `/api/instance-pages/:id` | `DELETE` | — | 204 |
| `POST` | `/api/instance-pages/:id/link` | `EDIT` | `{template_ids:number[], label?, icon_svg?, enabled?}` | `{linked:number[], skipped:number[]}` |
| `POST` | `/api/instance-pages/:id/actions` | `EDIT` | `{instance_id,type,command,path,content,args,env,timeout}` | proxied edge response (`instance_page_handler.go:774`) `getEnabledPages` guard |
| `POST` | `/api/instance-pages/execute-action` | `VIEW_INSTANCES` | `{instance_id, page_slug, type,command,path,content,args,env,timeout}` | `ExecuteCustomPageActionHandler` (`instance_page_handler.go:1151`): validates `pageSlug` via `findSpecPageRow` + allow-list `savedActionMatches` + `resolveExecPayload` → edge `page-action` |
| `POST` | `/api/instance-pages/execute-module-action` | `VIEW_INSTANCES` | `{instance_id, module_id, type,...}` | `ExecuteModulePageActionHandler` (module `getEnabledModules` check) |
| `POST` | `/api/instance-pages/import` | `CREATE` | multipart `file` JSON | `ImportInstancePageHandler` (`instance_page_handler.go:1501`) |
| `POST` | `/api/instance-pages/import/url` | `CREATE` | `{url}` | `ImportInstancePageFromURLHandler` (10s fetch) |
| `GET` | `/api/instance-pages/marketplace` | `VIEW` | — | `MarketplaceCatalog` via `pagelib.ReadCatalog()` |
| `POST` | `/api/instance-pages/import/marketplace` | `CREATE` | `{page_id}` | marketplace import |
| `GET` | `/api/instance-pages/local` / `POST /import/local` | `VIEW`/`CREATE` | — | local files |
| `GET` | `/api/instance-page-modules/` etc | `VIEW`/`CREATE`/`DELETE` | — | `.kspm` upload/install/uninstall/asset serve (`unzip` hardened `instance_page_handler.go:1966`) |

Client: `shared/api/admin.ts` exports `listInstancePages`, `getInstancePage`, `createInstancePage`, `updateInstancePage`, `deleteInstancePage`, `linkInstancePage`, `executePageAction`, `listInstances`, `InstancePageAction` type.

---

## 15) Safety & Security

- **HTML sandbox:** `CustomPageView` HTML `iframe` has `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"` **no** `allow-same-origin` → opaque origin, cannot touch parent DOM/cookies/storage or fetch panel APIs except via gated `postMessage` bridge (`BRIDGE_METHODS` allowlist, source check `event.source===iframe`, method check `CustomPageView.tsx:959`). `HtmlBlockFrame` same sandbox without downloads.
- **Icon SVG:** stripped to fixpoint 10 iterations (`sanitizeIconSVG` removes `script/foreignObject/iframe/object/embed/animate/set/handler`, `on*=` handlers, `javascript:/vbscript:/data:text/html` URLs, external `href` → `#`).
- **Pages payload validation:** server trims + validates all fields; corrupt `sub_pages`/`components`/`actions` in DB degrade to `[]` on parse (`parseSubPages/parsePageActions/parsePageComponents` `instancePage.ts:74`, `parseSpecComponents` `instancePages.ts:215` double-parse guard) – never blocks UI.
- **Action allow-list:** Browser **never** chooses command; server checks `savedActionMatches` exact (`type/command/path/content/args/env`) and `savedActionExecFields` malformed fail-closed; `open_args` extras ≤4, charset `validActionArg`, shell-quoted (`shellQuoteArg`), `{{args}}` placeholder required for `shell`.
- **Page-bound execution:** `pageSlug` required; `findSpecPageRow(parseSpecRows(config), pageSlug)` must exist, else 403. `pageSlug` is the **effective** slug (`slug` or `slug/path`), so sub-page inherits parent allow-list but cannot run arbitrary pages.
- **FetchPanel / navigate:** `fetchPanel` (`customPageSdk.ts:307`) only `/api/instances/:id/...` with `?` allowed; `pageNavigateTarget` (`customPageSdk.ts:182`) rejects schemes, `//`, `.`/`..`, oversize 2048, and paths outside `/instances/:id`.
- **Uploads:** `.kspm` unzip hardened (`instance_page_handler.go:1966` entry count≤2000, per-entry≤64M, total≤256M, `filepath.Clean` + `HasPrefix(destAbs)`, skip non-regular, 0o644/0o755). Instance page imports via multipart 10 MiB, marketplace fetch validated via `sanitizeHttpError` to avoid HTML error page paste.
- **Component token:** max 50, name strict, iterative bounded 5 passes to prevent cycle loop; unknown tokens left literal.
- **Theme injection:** `cssConst` strips `{}<>\\;` + controls, cap 256 before embedding into iframe stylesheet, fallback to defaults.
- **Permissions:** `MANAGE_INSTANCE_PAGES` for library, `VIEW_INSTANCES` for live execute (instance panel). `ACCESS_ADMIN_PANEL` not required for instance panel pages.

---

## 16) Limits & Error Handling

| Field | Cap | Error |
|---|---|---|
| `name` | 200 | `name is required/too long` |
| `description/category/type` | 500 | `... too long` |
| `slug` | 64, `^...$`, no `..` | `slug must start ...` |
| `subPage.path` | 64 `^[a-z0-9_-]+$` | `sub-page path must be ...` |
| `component.name` | 64 `^[A-Za-z0-9_][A-Za-z0-9_-]*$` | `component name must start ...` |
| `icon_svg` | 16 KiB | `icon_svg too large` |
| `content_*` per field | 1 MiB | `content_html too large` |
| `component.content` | 1 MiB | `component content too large` |
| `actions` JSON | 64 KiB | `actions must be a JSON array/too large` |
| `sub_pages` JSON | 512 KiB, ≤20 | `sub_pages must be .../too many` |
| `components` JSON | 512 KiB, ≤50 | `components must be .../too many` |
| `content_blocks` | JSON array | `content_blocks must be ...` |
| `open_args` extras | ≤4, ≤200 chars, charset | `action accepts at most 4 / unsupported characters / does not accept runtime arguments` |
| `page` query `location.search` | baked via `safeInlineJson` | `<` escaped to `\u003c` |

Frontend surfaces errors via `getErrorMessage` (parses `error/message` string vs object) in Studio banner.

---

## 17) Imports / Exports & Marketplace

- **Export** (Studio General/Preview): `exportJson` (`InstancePageStudio.tsx:395`) downloads `name/slug/kind/category/type/description/content_type/content_html/content_markdown/content_blocks/icon_svg/actions:[]` + `pages: subPages` + `components: []` (typed arrays, not JSON strings). Filename `<slug>.json`.
- **Import** (Studio hidden file input): `importJson` (`InstancePageStudio.tsx:424`) merges `name/slug/kind→custom/category/type/description/content_type/*_html/icon_svg/actions` (array) → replaces `subs`/`components` if `pages`/`components` present. Coerces `kind` to `custom`.
- **File import** (API): `POST /api/instance-pages/import` multipart `file` → `ImportInstancePageHandler` (validates via `validateInstancePage`, forces `kind=custom`, `content_type` default `markdown`).
- **URL import:** `POST /api/instance-pages/import/url` `{url}` → 10s fetch → same validation (uses `subPagesJSON()` helper that prefers `sub_pages` string else `pages` array).
- **Marketplace:** `GetMarketplacePagesHandler` (`instance_page_handler.go:2216`) reads `pagelib.ReadCatalog()` (`panel/backend/internal/pagelib/pagelib.go` embeds `instance_pages/marketplace.json`); frontend `InstancePageDetail` / `InstancePages` can import via `ImportInstancePageFromMarketplaceHandler`.
- **Linking:** `LinkInstancePageHandler` (see §9.2) copies `actions/sub_pages/components` as inline arrays; hero for template/instance snapshot.

---

## 18) Theme & Page Registry

`pageregistry.ts:40` `AREAS` (`auth`/`instance`/`admin` + `STANDALONE_PAGES` `instancePages.ts:177` for `/account`): each `PageEntry` has `match(pathname,search)` predicate. `ThemeAssignMenu.tsx` uses it, but instance-panel dynamic pages (`/instances/:id/*`) resolve via `areaFor` → `auth|instance|admin` prefix match, not registry.

---

## 19) File Map (authoritative)

```
panel/backend/
  internal/api/handlers/instance_page_handler.go  # DTO, validation, CRUD, link, execute, import, modules
  internal/api/handlers/instance_page_guard.go    # findSpecPageRow, parseSpecRows, action guard helpers
  internal/repository/instance_page_repo.go       # List/Get/Create/Update/Delete
  internal/models/instance.go                     # InstancePage struct
  internal/db/migrations/{mysql,postgres,sqlite}/032_…049_… # schema evolution
  internal/api/server.go:467                      # route mounts
  internal/pagelib/{pagelib.go,pagelib_test.go}   # marketplace catalog embed

panel/frontend/src/
  features/instance-pages/
    pages/{InstancePages.tsx,InstancePageDetail.tsx,InstancePageStats.tsx,InstancePageStudio.tsx}
    components/PageStudio/{PageStudioTabs.tsx,PageStudioTemplatesSection.tsx,PageStudioContentSection.tsx,
                          PageStudioSubPagesSection.tsx,PageStudioComponentsSection.tsx,
                          PageStudioActionsSection.tsx,PageStudioPreviewSection.tsx,PageStudioBlocksEditor.tsx,
                          PageStudioSettingsSection.tsx,index.ts}
    templates/pageStarters.ts                     # PageStarter[] templates
    types/{instancePage.ts,pageStudio.ts,pageregistry.ts}
    utils/pageStudioUtils.ts                      # blankAction/blankSub/blankComponent, validators, renderPreview
  shared/
    utils/instancePages.ts                        # resolver single source (resolveInstanceNav, isPageAllowed, getPageContent)
    components/ui/CustomPageView.tsx              # renderer (iframe/markdown/blocks, SDK bridge, tokens, theme)
    lib/customPageSdk.ts                          # KSPageSDK factory
    api/admin.ts                                  # REST client
    types/instancePage.ts                         # re-export canonical
    components/layout/{InstanceNavContext.tsx,Sidebar.tsx,Header.tsx}
  features/templates/{types/templateForm.ts,utils/templateFormUtils.ts,pages/TemplateForm.tsx}
  features/instances/{types/instanceForm.ts,utils/instanceFormUtils.ts,pages/InstanceDetail.tsx,...}
```

---

## 20) Quick Start (author → deploy → use)

1. **Create page** – `/instance-pages` → *New Page* → **Templates** tab pick starter (e.g. Dashboard) → **General** set `name=My Dashboard`, `slug=dashboard` (`.` for Home), `category=monitoring` → **Main page** pick `HTML`, paste:

   ```html
   {{component:page_header}}
   <div class="ks-card"><h2>Status</h2><p>Instance {{instance.name}} on {{instance.node_name}}</p>
   <button class="ks-btn-blue" onclick="KSPageSDK.runAction('get_status')">Refresh</button></div>
   ```

2. **Add component** – **Components** tab → *Add component* → `name=page_header`, `type=html`, `content=<header class="ks-card"><h1>KS Demo — {{component:logo}}</h1></header>`, add `logo` component similarly. Reference works on sub-pages too.

3. **Add sub-page** – **Sub-pages** → *Add* → `path=edit`, `name=Editor`, `html` `<div>{{component:page_header}}<textarea id=ed></textarea></div>`

4. **Add action** – **Actions** → `name=get_status`, `type=shell`, `command=cat /etc/os-release` → Test by binding instance in **Preview** → *Test*.

5. **Save** – *Create* → row appears in library.

6. **Link to template** – `/templates` → edit template → **Pages** → *Add pages* → select `My Dashboard` → Save. Or call `POST /api/instance-pages/:id/link {template_ids:[1]}`.

7. **Deploy instance** – Create instance from that template; or edit existing → *Advanced* → confirm `pages` includes entry. `instance.config` now contains snapshot.

8. **Use** – Visit `/instances/<id>/dashboard` (main) and `/instances/<id>/dashboard/edit` (sub). Sidebar shows `My Dashboard` tab. HTML runs sandboxed with `KSPageSDK`:

   ```js
   // inside html content
   const res = await KSPageSDK.runAction('get_status');
   KSPageSDK.toast(res.ok ? res.stdout : res.error, res.ok?'success':'error');
   KSPageSDK.navigate('/instances/12/dashboard/edit?path=/etc/app.conf');
   const files = await KSPageSDK.listFiles('/etc');
   ```

9. **Iterate** – Edit page in Studio → save → re-link to template (link copies latest), then update instance (or new deploy) to pick up.

---

## 21) Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar shows no tabs | `spec.pages` empty (empty-by-default) | Import pages in template/instance editor |
| “not part of this instance's template” | `isPageAllowed` false → slug not in `instance.config.pages` | Link page to template, redeploy |
| “has no content” | Row found but all `content_*` empty | Re-import from library |
| Component token stays `{{component:x}}` | `name` mismatch (case/prefix) or page family has no `components` | Check Components tab name regex `^[A-Za-z0-9_][A-Za-z0-9_-]*$`, ensure saved+linked; sub-pages inherit parent only |
| Action button `403 action is not defined` | Payload not byte-for-byte stored `PageActionDef` (env/args mismatch) or `pageSlug` not enabled | Ensure action saved, page linked, instance has that slug, `open_args` + `{{args}}` if using extras |
| Static preview rejects `runAction` | `STATIC_SDK_STUB` intentionally | Bind instance in Preview |
| HTML not themed | Theme CSS not baked? | `customPageThemeCss` pulls `themeStore.active()`; check `RouteThemeSync` + `activePageThemeCss` |
| Icon not showing | SVG sanitized away | Use inner markup only, no `<script>`/`on*=`/`javascript:` |
| Save 409 `slug already exists` | Unique slug | Change slug |

---

## 22) Future / Differences from `docs/instance-pages.md`

The `.kspm` module system (manifest, `instance_pages/modules/`, marketplace catalog versions, `create-kspanel-page-module`) remains implemented (`UploadInstancePageModuleHandler` `instance_page_handler.go:1716`, `ServeInstancePageModuleAssetHandler`) but is **orthogonal**: library custom pages are the default authoring surface; modules are an optional heavier extension for full React components with dedicated bundling. This doc focuses on the default path.

---

*Last verified against:* `instancePage.ts:25`, `instancePages.ts:104`, `CustomPageView.tsx:79`, `customPageSdk.ts:216`, `instance_page_handler.go:40`, `instance_page_repo.go:32`, `TemplateForm.tsx:147`, `InstancePageStudio.tsx:67`, `router.tsx:109`, `server.go:467`, migrations `032-049`, `pageStudioUtils.ts:19` (build `index-C-6mEd_3.js` 2026-08-29).
