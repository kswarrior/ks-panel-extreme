# Instance Pages — Complete Guide to Building Full Working Pages

> How to author, test, ship and deploy a fully working instance page for KS Panel.
> Covers every field, content type, action, component, sub-page, SDK, theme
> and validation rule you need. Verified against the live codebase.

**Scope:** `instance_pages/pages/*.json` + `marketplace.json` → embedded via `panel/backend/internal/pagelib` → stored in `instance_pages` DB → copied to `template.spec.pages[]` → snapshotted into `instance.config` → rendered by `panel/frontend/src/shared/components/ui/CustomPageView.tsx:11` + `panel/frontend/src/shared/lib/customPageSdk.ts:216`.

Legacy `kind: "builtin"` was removed in migration `046_instance_pages_drop_builtin.sql` — only `kind: "custom"` is accepted (`panel/backend/internal/api/handlers/instance_page_handler.go:75`).

For deep internals see `docs/instance-page.md:1` (598 lines) and `panel/frontend/src/shared/utils/instancePages.ts:104`.

---

## Table of Contents

1. [Mental Model & Directory Layout](#1-mental-model--directory-layout)
2. [File Format & Minimal Templates](#2-file-format--minimal-templates)
3. [Full Field Reference](#3-full-field-reference)
4. [Slug, Category, Icon](#4-slug-category-icon)
5. [Content Types](#5-content-types)
6. [Visual Blocks Catalog](#6-visual-blocks-catalog)
7. [Actions — Executable Allow-List](#7-actions--executable-allow-list)
8. [Components — Reusable Fragments](#8-components--reusable-fragments)
9. [Sub-Pages — Multi-Page Families](#9-sub-pages--multi-page-families)
10. [Marketplace Catalog](#10-marketplace-catalog)
11. [KSPageSDK — Runtime API](#11-kspagesdk--runtime-api)
12. [Theme System — Making Pages Follow the Active Theme](#12-theme-system--making-pages-follow-the-active-theme)
13. [Lifecycle: Studio → Template → Instance → Render](#13-lifecycle-studio--template--instance--render)
14. [Validation & Limits (Server-Side, Fail-Closed)](#14-validation--limits-server-side-fail-closed)
15. [Backend Embedding & Resolution Order](#15-backend-embedding--resolution-order)
16. [REST API Reference](#16-rest-api-reference)
17. [Security Model](#17-security-model)
18. [Complete Working Examples (Copy-Paste Ready)](#18-complete-working-examples-copy-paste-ready)
19. [Author Checklist for a Shippable Page](#19-author-checklist-for-a-shippable-page)
20. [Troubleshooting](#20-troubleshooting)
21. [File Map](#21-file-map)

---

## 1) Mental Model & Directory Layout

```
repo/
  instance_pages/
    README.md          ← quick format ref (this GUIDE.md is the exhaustive manual)
    GUIDE.md           ← this file
    marketplace.json   ← catalog whose download_url points at raw GitHub
    pages/
      *.json           ← ONE JSON file per page (canonical library)
      home.json        ← reserved "." slug → instance index route
      files.json       ← example with sub_pages
      docker-manager.json, metrics.json, terminal.json, ... (30 starters)
    *.json (top-level) ← legacy override — still read but new pages belong in pages/

Build: rebuild.sh → sync_pagelib() copies marketplace.json + pages/*.json
       into panel/backend/internal/pagelib/library/ → go:embed all:library
       → kspanel binary carries pages even when instance_pages/ is absent on disk.

Runtime read order (panel/backend/internal/pagelib/pagelib.go:98):
  1. instance_pages/pages/<name>   (disk canonical)
  2. instance_pages/<name>         (disk legacy)
  3. embedded library/pages/<name> (binary fallback)
  name is bare basename, no "/" or ".." allowed.
```

Empty-by-default: a template exposes **no** sidebar tabs until you link pages. An instance's `config` is a deploy-time snapshot — editing the library later does not affect already-deployed instances until you re-link.

---

## 2) File Format & Minimal Templates

Every page is a single JSON object. Only `name`, `slug` and `content_type` + one `content_*` are strictly required; everything else is optional but should be set for production pages.

### 2.1 Raw JSON shape (stored on disk / in DB)

```json
{
  "name": "My Dashboard",
  "slug": "dashboard",
  "kind": "custom",
  "category": "monitoring",
  "type": "dashboard",
  "description": "Live status for this instance",
  "content_type": "html",
  "content_html": "<div class=\"ks-page\">...</div>",
  "content_markdown": "",
  "content_blocks": "",
  "icon_svg": "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/>",
  "actions": "[{\"name\":\"get_status\",\"type\":\"shell\",\"command\":\"cat /etc/os-release\",\"timeout\":10}]",
  "sub_pages": "[{\"path\":\"edit\",\"name\":\"Editor\",\"content_type\":\"html\",\"content_html\":\"<div>…</div>\"}]",
  "components": "[{\"name\":\"site_header\",\"type\":\"html\",\"content\":\"<header>…</header>\"}]"
}
```

Note: `actions` / `sub_pages` / `components` are **JSON-encoded strings** on disk and in the `instance_pages` DB (`panel/backend/internal/models/instance.go:56`). When copied into `template.spec.pages[]` they become inline arrays (`panel/frontend/src/features/templates/types/templateForm.ts:136`).

### 2.2 Minimal working examples per content_type

**HTML (full control, sandboxed iframe):**

```json
{
  "name": "Hello HTML",
  "slug": "hello-html",
  "kind": "custom",
  "category": "documentation",
  "description": "Minimal HTML page",
  "content_type": "html",
  "content_html": "<div class=\"ks-page\"><div class=\"ks-card\"><h2>Hello</h2><p>Instance {{instance.name}} — use KSPageSDK.runAction.</p><button class=\"ks-btn-blue\" onclick=\"KSPageSDK.runAction('ping')\">Ping</button></div></div>",
  "icon_svg": "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/>",
  "actions": "[{\"name\":\"ping\",\"type\":\"shell\",\"command\":\"echo pong\",\"timeout\":10}]"
}
```

**Markdown (fast docs):**

```json
{
  "name": "Hello Markdown",
  "slug": "hello-md",
  "kind": "custom",
  "category": "documentation",
  "description": "Minimal markdown page",
  "content_type": "markdown",
  "content_markdown": "# Hello Markdown\n\nWelcome to **{{instance.name}}**.\n\n- Item 1\n- Item 2\n\n```bash\necho hello\n```\n",
  "icon_svg": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/>"
}
```

**Blocks (visual, no HTML needed):**

```json
{
  "name": "Hello Blocks",
  "slug": "hello-blocks",
  "kind": "custom",
  "category": "documentation",
  "description": "Minimal blocks page",
  "content_type": "blocks",
  "content_blocks": "[{\"type\":\"heading\",\"value\":\"Hello Blocks\",\"level\":1,\"align\":\"center\"},{\"type\":\"text\",\"value\":\"Welcome to this instance.\"},{\"type\":\"button\",\"value\":\"Open Docs\",\"href\":\"https://example.com\"},{\"type\":\"action\",\"action\":\"ping\",\"label\":\"Ping\"}]",
  "content_html": "",
  "content_markdown": "",
  "icon_svg": "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/>",
  "actions": "[{\"name\":\"ping\",\"type\":\"shell\",\"command\":\"echo pong\"}]"
}
```

Save any of these as `instance_pages/pages/<slug>.json` and run `rebuild.sh` to embed, or import via Studio / API (see §13).

---

## 3) Full Field Reference

| Field | JSON key | Type | Required | Limits | Notes | Source |
|---|---|---|---|---|---|---|
| **name** | `name` | string | **yes** | ≤200 | Sidebar label. Trimmed. | `instance_page_handler.go:342` |
| **slug** | `slug` | string | **yes** | ≤64, `^[A-Za-z0-9][A-Za-z0-9._-]*$` or `"."` | URL segment `/instances/:id/<slug>`. Bare `"."` = Home page at index route. No `/`, no `..`. UNIQUE. | `instance_page_handler.go:126` `validSlug` |
| **kind** | `kind` | string | no (→ `"custom"`) | enum `custom` only | `builtin` rejected. | `instance_page_handler.go:75` `validInstancePageKinds` |
| **category** | `category` | string | no | ≤500 | Free tag: `documentation` `monitoring` `management` `security` `minecraft` `containers` `dashboards` etc. | `instance_page_handler.go:345` |
| **type** | `type` | string | no | ≤500 | Flavor tag persisted as `page_type`: `dashboard` `status` `docs` `admin-panel` `widget` `generic`. Empty = unset. | `instance_page_handler.go:50` |
| **description** | `description` | string | no | ≤500 | Shown in library / marketplace. | `instance_page_handler.go:345` |
| **content_type** | `content_type` | string | **yes** | `html` \| `markdown` \| `blocks` | Empty on create → defaults to `markdown`. | `instance_page_handler.go:83` `validContentTypes` |
| **content_html** | `content_html` | string | if `html` | ≤1 MiB | Raw HTML for `html` type. Ignored for other types but still capped. Supports `{{component:name}}` and `KSPageSDK`. | `instance_page_handler.go:360` |
| **content_markdown** | `content_markdown` | string | if `markdown` | ≤1 MiB | Markdown source. Supports `{{component:name}}`. | `instance_page_handler.go:363` |
| **content_blocks** | `content_blocks` | string | if `blocks` | ≤1 MiB, must be JSON array when non-empty | Array of `BlockRow` (see §6). | `instance_page_handler.go:369` `validateBlocksJSON:176` |
| **icon_svg** | `icon_svg` | string | no | ≤16 KiB, sanitized | Raw SVG **inner** markup (children of `<svg>`). Server sanitizes via `sanitizeIconSVG` 10-pass. | `instance_page_handler.go:159` |
| **actions** | `actions` | string (JSON array) | no | ≤64 KiB, JSON array | `PageActionDef[]` as JSON string. See §7. In `spec.pages[]` stored as inline array. | `instance_page_handler.go:112` |
| **sub_pages** | `sub_pages` | string (JSON array) | no | ≤512 KiB, ≤20 entries | `InstancePageSubPage[]` as JSON string. Effective slug `<slug>/<path>`. In spec also `pages` key accepted on import. | `instance_page_handler.go:189` `validateSubPages:240` |
| **components** | `components` | string (JSON array) | no | ≤512 KiB, ≤50 entries | `PageComponentDef[]` as JSON string. Referenced as `{{component:name}}`. In spec inline array. | `instance_page_handler.go:197` `validateComponentsJSON:283` |

All `_svg` / `content_*` / `actions` / `components` fields are stored as `TEXT` in `instance_pages` (`panel/backend/internal/models/instance.go:56`, migrations `032`, `041`, `047`, `048`, `049`).

---

## 4) Slug, Category, Icon

### 4.1 Slug

Validated by `validSlug` (`instance_page_handler.go:126`):

```go
func validSlug(s string) bool {
  if s == "." { return true }
  if len(s)==0 || len(s)>64 || strings.Contains(s,"/") || strings.Contains(s,"..") { return false }
  if !slugStartRe.MatchString(s[:1]) || !slugBodyRe.MatchString(s) { return false }
  return true
}
var slugStartRe = regexp.MustCompile(`^[A-Za-z0-9]$`)
var slugBodyRe  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
```

* `"."` — reserved Home page (`instance_pages/pages/home.json:1` renders at `/instances/:id`, not `/instances/:id/.`).
* Sub-page `path` is stricter: `validSubPagePath` (`instance_page_handler.go:318`) → `^[a-z0-9_-]+$`, lowercase only, ≤64.
* Component `name`: `validComponentName` (`instance_page_handler.go:212`) → `^[A-Za-z0-9_][A-Za-z0-9_-]*$`, must start alnum/underscore, ≤64, unique per page.

### 4.2 Category & Type suggestions

Studio shows `CATEGORY_OPTIONS` + `TYPE_OPTIONS` (`panel/frontend/src/features/instance-pages/types/pageStudio.ts:29`):

* Categories: `documentation` `dashboards` `monitoring` `management` `security` `automation` `storage` `networking` `containers` `services` `system` `minecraft` `overview` `console` `configuration` …
* Types: `dashboard` `status` `docs` `admin-panel` `widget` `generic` …

Values are free-form — any `≤500` string passes validation — but staying within these keeps filtering consistent (`PageStudioTemplatesSection.tsx`).

### 4.3 Icon SVG

* Provide **inner markup only** (no outer `<svg>` needed). Example: `<path d="M12 2L2 7l10 5 10-5-10-5z"/>`.
* Server runs `sanitizeIconSVG` (`instance_page_handler.go:159`) 10-pass fixpoint stripping:
  * `<script>/<foreignObject>/<iframe>/<object>/<embed>/<animate>/<set>/<handler>`
  * `on*=` handlers, `javascript:`/`vbscript:`/`data:text/html` URLs, external `href` → `#`.
* Also sanitized when linking to `template.spec.pages[].icon_svg` (`instance_page_handler.go:909`).
* Real examples across the library:
  * `getting-started.json:11` docs icon `<path d="M12 2L2 7l10 5 10-5-10-5z"/>`
  * `home.json` house `<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>`
  * `terminal.json:11` `<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>`

---

## 5) Content Types

### 5.1 `content_type: "html"` — Full Control (Sandboxed Iframe)

Rendered in an **opaque-origin sandboxed iframe** (`panel/frontend/src/shared/components/ui/CustomPageView.tsx:1086`):

```html
<iframe sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc="…">
<!-- NOTE: no allow-same-origin → cannot touch parent DOM/cookies/storage -->
```

* `buildIframeDocument` (`CustomPageView.tsx:531`) injects:
  * baked `customPageThemeCss(activeTheme)` so `var(--ks-*)` matches panel theme (§12)
  * `window.KSPageSDK` bridge via `postMessage` (`ks-sdk-call` / `ks-sdk-response`, whitelist `BRIDGE_METHODS` `CustomPageView.tsx:508`)
  * `window.KS_PAGE_QUERY = location.search` (sub-pages read `?path=` via it)
  * auto-resize `ks-iframe-resize` + skeleton fallback 3.5 s
  * global `ksPatch`/`el()` helpers that patch `document.getElementById().innerHTML` to keyed diff so checkbox/focus/scroll survive (`CustomPageView.tsx:718`)
* `{{component:name}}` resolved before `srcDoc` (`CustomPageView.tsx:936`).
* Use panel-native classes so theme applies 1:1 (see §12). Canonical starter header included in shipped pages:

```css
/* baked per-mount — every shipped html page prefixes this */
#ks-instance-theme-support
.ks-page { color: var(--ks-body,#e5e7eb); font-family: var(--ks-font-family); line-height:1.6 }
.ks-card { background: var(--ks-card-bg); border:1px solid var(--ks-card-border); border-radius:.75rem; padding:1rem }
.ks-btn-blue { background:#0284c7; color:#fff } /* + ks-btn, ks-badge, ks-bar, ks-ok/bad/warn, etc. */
```

* HTML pages can call all SDK methods. Show loading skeletons then replace on `ks-page-sdk-ready`:

```html
<div class="ks-page">
  <div id="root"><div class="ks-card ks-skeleton">Loading…</div></div>
  <script>
    async function load(){
      const r = await KSPageSDK.runAction('list_containers');
      const rows = r.stdout.trim().split('\n');
      document.getElementById('root').innerHTML = rows.map(c=>`<div class="ks-card">${c}</div>`).join('');
    }
    window.addEventListener('ks-page-sdk-ready', load);
    if(window.KSPageSDK) load();
  </script>
</div>
```

* For best results copy the theme header from any shipped `pages/*.json` `content_html` (e.g. `instance_pages/pages/docker-manager.json:8`, `html-dashboard.json:8`).

### 5.2 `content_type: "markdown"` — Host-Rendered Docs

Rendered **host-side** as React nodes (`renderMarkdown` `CustomPageView.tsx:414`), no iframe. `window.KSPageSDK` is set directly (`CustomPageView.tsx:910`).

Supported subset:

* Headings `# ## ###` → `h1/h2` (level 3 → `h2` visually)
* Inline: `**bold**` `*italic*` `` `code` `` `[text](url)`
* Lists: `-`/`*` unordered, `1.` ordered
* Paragraphs, `---` dividers
* `{{component:name}}` resolved first (`resolveComponentTokens`)
* Links sanitized via `safeUrl` (`CustomPageView.tsx:58`): only `https:` `http:` `mailto:` or relative → else `#`. Images need `html` type (use `data:` URI there via `safeImgSrc`).

Full example shipped as `instance_pages/pages/markdown-docs.json:8` — includes headings, lists, tables, code fences, blockquotes. Minimal:

```markdown
# My Service

## Status
Run **KSPageSDK.runAction('get_status')** from the console.

### Links
- [Panel](https://github.com/kswarrior/ks-panel-extreme)
- `code` & *italic* & **bold**
```

Markdown pages can run JS via Studio's rendered view? No — markdown is static. To add interactivity use `html` or `blocks` with `action` blocks.

### 5.3 `content_type: "blocks"` — Visual Editor (No HTML)

JSON array of `BlockRow` (`panel/frontend/src/shared/components/ui/CustomPageView.tsx:11` + `panel/frontend/src/features/instance-pages/types/pageStudio.ts:68`):

```ts
interface BlockRow {
  type: 'heading'|'text'|'image'|'button'|'spacer'|'code'|'divider'
     | 'stat'|'table'|'list'|'html'|'action';
  value: string; href?: string; level?: 1|2|3; align?: 'left'|'center'|'right';
  label?: string; unit?: string; tone?: 'default'|'good'|'warn'|'bad';
  action?: string; confirmText?: string;
}
```

Edit visually in Studio → **Main page** → Visual/JSON toggle (`PageStudioBlocksEditor.tsx:19`). See §6 for full catalog. Shipped as `instance_pages/pages/complete-example.json:10`.

---

## 6) Visual Blocks Catalog

Every `value` (and `label`/`unit`/`href`) runs `resolveComponentTokens` so `{{component:name}}` composes inside blocks.

| Type | Fields | Render | Notes |
|---|---|---|---|
| `heading` | `value`, `level` 1-3, `align` | `h1/h2/h3` | `level` defaults 2 |
| `text` | `value`, `align` | `p` `whitespace-pre-wrap` | `value` may be multiline |
| `image` | `value` URL, `align` | `img` | via `safeImgSrc` → allows `data:image/*` + `https/http` |
| `button` | `value` label, `href`, `align` | `a.ks-primary-btn` | via `safeUrl` |
| `code` | `value` | `pre > code` | monospace, theme border |
| `stat` | `value`, `label`, `unit`, `tone` `default|good|warn|bad` | glass-card with big number | `TONE_STYLE` `CustomPageView.tsx:47` maps to `--ks-accent-*` |
| `table` | `value` = JSON `string[][]` (first row = header) | `table` with header + body | cells component-resolved; empty → hint text |
| `list` | `value` = JSON `string[]` **or** newline-separated lines | `ul.list-disc` | fallback split on `\n` if not JSON |
| `html` | `value` raw HTML | `HtmlBlockFrame` sandboxed iframe, auto-height (`ks-block-resize`) | **does NOT get SDK bridge** — purely presentational; same sandbox without `allow-downloads` |
| `action` | `action` (saved `PageActionDef.name`), `label`, `confirmText`, `value` fallback | `button.ks-primary-btn` → `runSavedAction` → `KSPageSDK.runAction` | `confirmText` → `confirmDialog` themed modal; disabled when no action |
| `spacer` | — | `div.h-6` | vertical gap |
| `divider` | — | `hr` | theme border |

Example `content_blocks` JSON string (pretty-printed, then minified for storage):

```json
[
  {"type":"heading","value":"Welcome","level":1,"align":"center"},
  {"type":"text","value":"This demonstrates every block type.","align":"center"},
  {"type":"divider"},
  {"type":"stat","value":"42","label":"Containers","unit":"up","tone":"good"},
  {"type":"table","value":"[[\"Name\",\"Status\"],[\"web\",\"Running\"]]"},
  {"type":"list","value":"[\"one\",\"two\",\"three\"]"},
  {"type":"code","value":"docker ps\necho hi"},
  {"type":"button","value":"Docs","href":"https://example.com","align":"center"},
  {"type":"action","action":"restart","label":"Restart","confirmText":"Restart now?"},
  {"type":"html","value":"<div class=\"ks-card\">Raw html block</div>"},
  {"type":"spacer"}
]
```

Stored as a single-line JSON string: replace newlines with `\n` and wrap in quotes for the `content_blocks` field (see `instance_pages/pages/complete-example.json:10`).

---

## 7) Actions — Executable Allow-List

Actions are **not** free-form exec. You declare them in Studio → **Actions** tab (`PageStudioActionsSection.tsx`); at runtime the browser may **only** call `KSPageSDK.runAction(name)` and the server verifies the payload matches the stored definition byte-for-byte.

### 7.1 Shape `PageActionDef` (`instancePage.ts:9` / `customPageSdk.ts:66`)

```ts
interface PageActionDef {
  name: string;        // unique per page, run via KSPageSDK.runAction(name)
  type: 'shell'|'read_file'|'write_file'|'list_files'|'docker'|'kvm'|'lxd';
  command?: string;    // shell/docker/kvm/lxd — the program line
  path?: string;       // read_file/write_file/list_files
  content?: string;    // write_file — file content to write
  args?: string[];     // shell/docker/kvm/lxd — extra argv
  open_args?: boolean; // opt-in to caller-supplied runtime args (≤4, see §7.3)
  env?: Record<string,string>;
  timeout?: number;    // seconds, clamped 1–600 (default 30)
  description?: string;
}
```

Studio row (`pageStudio.ts:36` `ActionRow`) persists via `actionsToDefs`/`defsToActions` (`pageStudioUtils.ts:44`, `74`) handling `env` JSON + `args` space-split + `open_args` boolean.

Limits: persisted JSON ≤64 KiB (`instance_page_handler.go:112` `maxInstancePageActionsBytes`).

### 7.2 Type details

| `type` | Required fields | Edge effect | Example stored definition |
|---|---|---|---|
| `shell` | `command` | `sh -lc "<command>"` inside container | `{"name":"cron_overview","type":"shell","command":"{ echo '# crontab'; crontab -l; } 2>&1","timeout":20}` (`cron-scheduler.json:12`) |
| `read_file` | `path` | read file bytes | `{"name":"read_props","type":"read_file","path":"server.properties"}` |
| `write_file` | `path`, `content` | write file (fails if `isDangerousPath` `edge/backend/internal/files/handler.go:1` for `write_file` guards) | `{"name":"save_props","type":"write_file","path":"server.properties","content":"motd=Hello"}` |
| `list_files` | `path` | directory listing (`FileEntry[]`) | `{"name":"ls_plugins","type":"list_files","path":"plugins/"}` |
| `docker` | `command` (+ `args`) | `docker <command> <args…>` inside container | `{"name":"prune_dangling","type":"docker","command":"image","args":["prune","--force"],"timeout":120}` (`docker-manager.json:12`) |
| `kvm` | `command` (+ `args`) | KVM driver exec | `{"name":"virsh_list","type":"kvm","command":"virsh list --all"}` |
| `lxd` | `command` (+ `args`) | LXD driver exec | `{"name":"lxc_list","type":"lxd","command":"lxc list"}` |

All go through `edge.New(node, token).PageAction` (`instance_page_handler.go:1137` `edge/internal/pageaction`).

### 7.3 `open_args` — Caller-Supplied Runtime Arguments

By default `args` is fixed. Set `open_args: true` to allow the caller to append **≤4** extra values (`maxOpenActionArgs` `instance_page_handler.go:1293`).

* Values are validated `validActionArg` (`instance_page_handler.go:1306`): charset `a-zA-Z0-9 ._/ :@+=,-`, length ≤200, non-empty.
* For `shell`, the stored `command` **must contain `{{args}}`** — extras are shell-quoted (`shellQuoteArg` `'` + `'\''`) and substituted there. Without the placeholder extra args are rejected.
* For `docker/kvm/lxd`, quoted extras are appended to `args` (edge joins with space into its `sh -lc` line).
* `read_file`/`write_file`/`list_files` never accept extras.
* Validation: `savedActionMatches` (`instance_page_handler.go:1217`) + `resolveExecPayload` (`instance_page_handler.go:1340`).

**Examples from shipped pages:**

```json
// docker container ops — runtime container name
{"name":"container_start","type":"shell","command":"docker start {{args}}","open_args":true,"timeout":60}
{"name":"container_logs","type":"shell","command":"docker logs --tail 200 {{args}}","open_args":true,"timeout":30}

// minecraft player ops
{"name":"whitelist_add","type":"shell","command":"whitelist add {{args}}","open_args":true}
{"name":"plugin_get","type":"shell","command":"wget {{args}} -P plugins/","open_args":true}
{"name":"plugin_rm","type":"shell","command":"rm plugins/{{args}}.jar","open_args":true}
```

Call site:

```js
// JS: extras become additional args — shell version substitutes {{args}}
await KSPageSDK.runAction('container_start', { args: ['my-web'] });
// payload: type=shell command="docker start 'my-web'" args=[]

// Or via convenience helper (still allow-list checked)
await KSPageSDK.shell('docker logs --tail 200 '+quotedName) // NOT allow-listed — will 403
```

For ad-hoc callers `executeAction({type:'shell', command:'docker start …'})` **must exactly equal** a stored def to pass `savedActionMatches`.

### 7.4 Persistence & Execution Paths

* **Persist:** `instance_pages.actions` JSON string → `template.spec.pages[].actions` inline array → `instance.config` snapshot.
* **Studio Test** (needs `MANAGE_INSTANCE_PAGES`): `InstancePageStudio.tsx:332` `testExecute` → `POST /api/instance-pages/:id/actions` (`ExecutePageActionHandler` `instance_page_handler.go:774`, checks `getEnabledPages`).
* **Live SDK** (needs `VIEW_INSTANCES`): `customPageSdk.ts:281` `executeAction` → `POST /api/instance-pages/execute-action` (`ExecuteCustomPageActionHandler` `instance_page_handler.go:1391`, gated by `findSpecPageRow(parseSpecRows(instance.Config), pageSlug)` + `savedActionMatches` + `resolveExecPayload`). Page slug is the **effective** slug (`slug` or `slug/path`) so sub-pages share parent's allow-list.
* **No-instance static preview** uses `STATIC_SDK_STUB` (`pageStudioUtils.ts:212`) — every `runAction` rejects with “Static preview — bind an instance”.

---

## 8) Components — Reusable Fragments

Define a fragment once, reference it from **main page *or* any sub-page** of the same family via `{{component:name}}`.

### 8.1 Authoring

* Studio → **Components** tab (`PageStudioComponentsSection.tsx:15`, `pageStudio.ts:50` `ComponentRow`).
* Each row: `name` (`^[A-Za-z0-9_][A-Za-z0-9_-]*$` `instance_page_handler.go:212`, unique, ≤64), `type` (`html|markdown|block`), optional `description`, `content` (≤1 MiB).
* `validateCompRows` (`pageStudioUtils.ts:191`).

### 8.2 Referencing

In **any** content field (main `content_html` / `content_markdown` / `content_blocks[].value|label|unit|href` **and** any `sub_pages[].content_*`):

```html
{{component:site_header}}
{{ component:logo }}   <!-- whitespace tolerant, COMPONENT_TOKEN_RE CustomPageView.tsx:75 -->
```

* Up to 5 iterative passes resolve nested references (`site_header` contains `{{component:logo}}`) — bounded to avoid cycles (`resolveComponentTokens` `CustomPageView.tsx:83`).
* Unknown names stay literal `{{component:missing}}`.
* Components of type `block` are JSON blocks array serialized as string; `componentToHtml` → `blocksToHtml` (`CustomPageView.tsx:104`) produces HTML for substitution.
* Table/list cells also resolved.

### 8.3 Persistence & Inheritance

* Library: `instance_pages.components` JSON string → Template: `spec.pages[].components` inline array → Instance: `config` snapshot.
* `getPageContent` (`instancePages.ts:279`): top-level via `pagePayloadFromRow` → `parseSpecComponents(p.components)`, sub-page via `pagePayloadFromSub(sub, parentComps)` where `parentComps` comes from the **parent**. Sub-pages **cannot** define their own components (by design: one family, one set).
* Static Studio preview shares `previewContent.components` (`InstancePageStudio.tsx:310`, `PageStudioPreviewSection.tsx:42`) so composition works without binding instance.

### 8.4 Example

```json
"components": "[{\"name\":\"logo\",\"type\":\"html\",\"content\":\"<span style=\\\"color:var(--ks-info)\\\">◆</span>\"},{\"name\":\"site_header\",\"type\":\"html\",\"content\":\"<header class=\\\"ks-card\\\"><h2>{{component:logo}} KS Demo</h2></header>\"}]"
```
Main `content_html`:
```html
{{component:site_header}}
<div class="ks-card"><p>Welcome to {{instance.name}}</p></div>
```
Sub-page `files/edit` will also resolve `{{component:site_header}}` via parent inheritance.

---

## 9) Sub-Pages — Multi-Page Families

Ship extra routes inside one library page (e.g. Files has `/files` + `/files/edit`).

### 9.1 Shape `InstancePageSubPage` (`instancePage.ts:82`)

```ts
interface InstancePageSubPage {
  path: string;               // single segment → <slug>/<path> (e.g. "edit")
  name: string;               // display label
  content_type: 'html'|'markdown'|'blocks';
  content_html?: string;
  content_markdown?: string;
  content_blocks?: string;
}
```

* `path` is validated `validSubPagePath` `^[a-z0-9_-]+$` (`instance_page_handler.go:318`), lowercase, ≤64.
* Effective slug = `<parentSlug>/<path>` (`instancePages.ts:40`).
* Limits: ≤20 sub-pages, ≤512 KiB JSON (`instance_page_handler.go:189`).

### 9.2 Studio UI

Studio → **Sub-pages** tab (`PageStudioSubPagesSection.tsx:23`): collapsible cards, move up/down, `path` sanitized `toLowerCase().replace(/[^a-z0-9_-]/g,'')`, `validateSubRows` (`pageStudioUtils.ts:142`).

### 9.3 Routing & Nav

* Frontend route: catch-all `path="/instances/:id/*"` → `InstanceDynamicPage` (`InstanceDetail.tsx:95`) reads `wildcard = useParams()['*']`, `effectiveSlug = wildcard.replace(/\/+$/,'') || '.'`.
* Gate: `isPageAllowed(effectiveSlug, spec)` (`instancePages.ts:141`) checks exact `slug`, `original_slug`, nested `findSubPageEntry`, and fallback “any `<parent>/<path>` under enabled parent”.
* `resolveInstanceNav` (`instancePages.ts:104`) emits **only top-level slugs** — sub-pages are not sidebar tabs; they are reachable via URL and keep parent tab highlighted (NavLink prefix match). Synced via `InstanceNavContext` (`InstanceNavContext.tsx`, `InstanceDetail.tsx:51` `useInstanceNavSync`).
* `getPageContent(slug, spec)` (`instancePages.ts:306`) prefers `findPageRow(slug)` (top-level) else `findSubPageEntry`. `components` inherited as above, `actions` **not** inherited (only parent's `actions` used; execution gate uses `findSpecPageRow` family).
* Preview: Studio Preview tab selector `previewTarget` (`main` or `sub.id`); `previewContent` (`InstancePageStudio.tsx:310`) shares `actionDefs`/`compDefs` for sub-pages.

### 9.4 Persistence

`instance_pages.sub_pages` JSON string (`parseSubPages`) → template `spec.pages[].sub_pages` inline array → instance `config`. Import key also accepts `pages` alias (`subPagesJSON()` helper). Export (`InstancePageStudio.tsx:395`) emits `pages: subPages` + `components: []` (typed arrays).

### 9.5 Real example — Files with Editor sub-page

`instance_pages/pages/files.json:12` `sub_pages` carries `path: "edit"` with its own `content_html` (full editor UI that `fetchPanel` + `writeFile` via `KSPageSDK`). Navigation:

```js
KSPageSDK.navigate(`/instances/${KSPageSDK.instance.id}/files/edit?path=/etc/app.conf`)
// edit page reads KS_PAGE_QUERY to preload ?path=
```

---

## 10) Marketplace Catalog

`instance_pages/marketplace.json:1` (and embedded `panel/backend/internal/pagelib/library/marketplace.json`):

```json
{
  "version": "1.0",
  "updated": "2026-09-03",
  "pages": [
    {
      "id": "api-reference",
      "name": "API Reference",
      "description": "Complete API reference documentation",
      "category": "documentation",
      "author": "kswarrior",
      "version": "1.0",
      "tags": ["documentation"],
      "download_url": "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/instance_pages/pages/api-reference.json",
      "icon_svg": "<path d=\"...\"/>",
      "preview_image": ""
    }
  ]
}
```

* `download_url` must point at `https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/instance_pages/pages/<file>.json`.
* Adding a new page: create `pages/<id>.json`, add entry to `marketplace.json` with matching `id`, run `rebuild.sh` (which embeds it), commit + push so raw URL serves it.
* Read via `pagelib.ReadCatalog()` (`pagelib.go:117` disk first, embedded fallback). Frontend imports via `POST /api/instance-pages/import/marketplace {page_id}`.

Shipped catalog currently lists 30 entries incl. `home` (`.` slug) `docker-manager` `files` `terminal` `metrics` `minecraft-*` etc. (`marketplace.json:1`).

---

## 11) KSPageSDK — Runtime API

Factory `createCustomPageSDK(instanceContext, savedActions, pageSlug)` (`customPageSdk.ts:220`). Host pages get `window.KSPageSDK = createCustomPageSDK(...)` directly; HTML iframes get a `postMessage` stub bridging to the same (`CustomPageView.tsx:947`). Both share `InstanceContext` (`customPageSdk.ts:7`) and `PageActionDef[]`.

### 11.1 Instance context

```ts
sdk.instance: {
  id, name, kind, status, template_id, template_name,
  node_id, node_name, owner_id, owner_name,
  config, external_id, created_at, updated_at,
  install_state, install_kind, install_step, install_error, install_steps_json, install_action_id,
  display_name, icon, color
}
```

### 11.2 Full method surface

```ts
// — Persisted allow-list —
sdk.actions: PageActionDef[]
sdk.runAction(name: string, overrides?: Partial<PageAction>): Promise<ActionResult>
//   Finds savedActions.find(a=>a.name===name), merges overrides, calls executeAction.
//   Rejects with {ok:false, error:"No saved action named ..."} if not found.

// — Generic —
sdk.executeAction(action: PageAction): Promise<ActionResult>
//   POST /api/instance-pages/execute-action {instance_id, page_slug, ...action}
//   Server checks pageSlug enabled + payload equals a stored def.

// — Instance-scoped panel API —
//   Only /api/instances/<this id>/… paths allowed. Relative "/processes" auto-bound.
sdk.fetchPanel<T>(path: string, init?: RequestInit): Promise<T>

// — Convenience wrappers (all → executeAction) —
sdk.shell(command: string, args?: string[], env?: Record<string,string>, timeout?: number): Promise<ActionResult>
sdk.readFile(path: string): Promise<string>
sdk.writeFile(path: string, content: string): Promise<ActionResult>
sdk.listFiles(path: string): Promise<FileEntry[]>   // FileEntry {name,size,is_dir,mod_time,mode}
sdk.deleteFile(path: string): Promise<ActionResult> // shell rm -rf -- '<quoted>'
sdk.createDirectory(path: string): Promise<ActionResult> // shell mkdir -p
sdk.docker(command: string, args?: string[]): Promise<ActionResult>
sdk.kvm(command: string, args?: string[]): Promise<ActionResult>
sdk.lxd(command: string, args?: string[]): Promise<ActionResult>

// — Polling subscription —
sdk.subscribe(action: PageAction, cb: (r:ActionResult)=>void, intervalMs?: number): () => void
//   polls executeAction every intervalMs (≥1000, default 5000), cb each time; return unsub.

// — Navigation (fail-closed, only /instances/<this id>/** allowed) —
sdk.navigate(to: string): void // host: dispatch ks-navigate → router; iframe: parent via bridge
// pageNavigateTarget() rejects schemes, //, dot-segments, >2048 chars (customPageSdk.ts:182)

// — UI —
sdk.toast(message: string, type?: 'success'|'error'|'info'|'warning'): void
sdk.confirm(message: string): Promise<boolean> // themed ConfirmDialog, not browser confirm()
sdk.prompt(message: string, defaultValue?: string): Promise<string|null>
sdk.modal({title, content, buttons?: {label, action, variant}[]}): void

// — Events (page-local pub/sub + parent relay ks-page-event) —
sdk.on(event: string, cb: (data:any)=>void): () => void
sdk.emit(event: string, data: any): void
sdk.once(event: string, cb: (data:any)=>void): () => void

// — Persistent storage (localStorage, per instance+page key prefix ks_page_<id>_) —
sdk.storage.get(key: string): Promise<string|null>
sdk.storage.set(key: string, value: string): Promise<void>
sdk.storage.delete(key: string): Promise<void>
sdk.storage.clear(): Promise<void>
sdk.storage.keys(): Promise<string[]>

// — WebSocket (raw terminal PTY) —
sdk.connectWS(protocols?: string[]): WebSocket
//   host: direct wss://host/api/instances/<id>/terminal ; iframe: parent proxies ks-ws-* frames

// — Injected globals (iframe only) —
window.KS_PAGE_QUERY: string  // parent's location.search, safeInlineJson-escaped, for sub-page params
window.KSPageSDK: CustomPageAPI
```

### 11.3 Typical patterns

```js
// 1) Saved action (recommended — validated allow-list)
const r = await KSPageSDK.runAction('cron_overview');
if(!r.ok) KSPageSDK.toast(r.error,'error'); else el('out').textContent = r.stdout;

// 2) With runtime args (needs open_args + {{args}})
await KSPageSDK.runAction('container_restart', { args: ['my-app'] });

// 3) Fetch panel API scoped to this instance
const procs = await KSPageSDK.fetchPanel('/processes'); // → GET /api/instances/12/processes

// 4) Navigate to sub-page with param
KSPageSDK.navigate(`/instances/${KSPageSDK.instance.id}/files/edit?path=/etc/hosts`);
// sub-page reads: new URLSearchParams(KS_PAGE_QUERY).get('path')

// 5) Polling subscription
const stop = KSPageSDK.subscribe({type:'shell', command:'cat /proc/loadavg'}, res=>{
  document.getElementById('load').textContent = res.stdout;
}, 5000);

// 6) Storage
await KSPageSDK.storage.set('theme','dark');
const v = await KSPageSDK.storage.get('theme');

// 7) WebSocket terminal (xterm.js wiring like terminal.json)
const ws = KSPageSDK.connectWS();
ws.onopen = ()=> ws.send('ls\n');
ws.onmessage = e=> term.write(e.data);
```

---

## 12) Theme System — Making Pages Follow the Active Theme

HTML pages are opaque-origin iframes and **do not inherit** parent CSS. `customPageThemeCss(activeTheme, pageSlugOrPath?)` (`CustomPageView.tsx:922` `theme/colorUtils.ts:2`) bakes concrete `--ks-*` values per mount:

* Stock defaults (when Default theme active) → still looks correct.
* Active overrides cover **every** token family: card, button, forms, typography, accent, dropdown, tabs, modal, utilities, background, shape. Includes Theme Studio `Custom CSS` (global + instance area/page scopes).

**Use `var(--ks-*)` in all HTML** to follow theme automatically:

```css
:root {
  /* defaults — themeCss after overrides (see CustomPageView.tsx:790) */
  --ks-heading:#ffffff; --ks-body:#e5e7eb; --ks-muted:#9ca3af; --ks-link:#7dd3fc;
  --ks-ok:#34d399; --ks-warn:#fcd34d; --ks-bad:#fca5a5; --ks-info:#38bdf8;
  --ks-card-bg:rgba(255,255,255,0.04); --ks-card-border:rgba(255,255,255,0.10);
  --ks-input-bg:rgba(0,0,0,0.4); --ks-input-border:rgba(255,255,255,0.15);
  --ks-card-bg-layer:none; --ks-btn-bg:var(--ks-accent-primary); /* + many more */
}
.ks-page{color:var(--ks-body); font-family:var(--ks-font-family); line-height:1.6}
.ks-card{background:var(--ks-card-bg); background-image:var(--ks-card-bg-layer); border:1px solid var(--ks-card-border); border-radius:.75rem; padding:1rem}
```

**Panel class aliases that are theme-aware** (copy header from `instance_pages/pages/html-dashboard.json:8` or any `docker-manager.json:8`):

`.ks-page` `.ks-card` `.glass` `.glass-strong` `.ks-row` `.ks-muted` `.ks-mono` `.ks-ok/.ks-bad/.ks-warn` `.ks-badge` `.ks-bar` `.ks-btn` `.ks-btn-blue/.ks-btn-red/.ks-btn-green` plus Tailwind-compatible tokens.

Also used for `HtmlBlockFrame` (`CustomPageView.tsx:380` `activePageThemeCss()`) and Studio static preview (`pageStudioUtils.ts:248`).

> **Rule:** always start `content_html` with the `<style id="ks-instance-theme-support">…</style>` header copied from a shipped page. Without it the page will still render but will ignore the admin's chosen theme.

---

## 13) Lifecycle: Studio → Template → Instance → Render

```
1) Studio (/instance-pages/studio, gated MANAGE_INSTANCE_PAGES) — required
     Forms in panel/frontend/src/features/instance-pages/pages/InstancePageStudio.tsx:67
     Tabs: Templates | General | Main page | Sub-pages | Components | Actions | Preview
     applyStarter() (InstancePageStudio.tsx:207) loads PAGE_STARTERS
     handleSave() validates slug, icons, actions, sub_pages, components
       → POST /api/instance-pages (or PUT /:id) with JSON-string fields
     Export: exportJson() downloads {name,slug,kind,…, actions:[], pages:[], components:[]} typed arrays
     Import: importJson() merges file → replaces subs/components

2) Library (instance_pages table)
     Row fields as above. Source badge: studio | market | edited (pageSource Studio/Market/Edited).
     Special case: fresh market import → source=market; edit flips market→edited (instance_page_handler.go:576).

3) Link to templates (POST /api/instance-pages/:id/link, instance_page_handler.go:586, server.go:478)
     Body: {template_ids: number[], label?, icon_svg?, enabled?: boolean}
     For each tid: loads template.spec JSON, builds pageEntry map
       {slug, original_slug:"", kind:"custom", label, enabled, icon_svg, content_type,
        content_html, content_markdown, content_blocks, actions:[], sub_pages:[], components:[]}
     Merges into spec.pages[] replacing existing slug or dropping legacy slug+"/..." flattened rows,
     json.Marshal → templateRepo.Update.  Frontend helper: templateFormUtils.ts:121 serializeSpec +
     instanceFormUtils.ts:320 serializeEditor include components when non-empty.

4) Instance deploy (InstanceDetail / DeployFormShell)
     template.spec (+ per-instance overrides) → instance.config snapshot (JSON string)
     Existing instances are snapshots — template edits do not retroactively change them.
     Advanced editor: InstanceAdvancedOptionsFullScreen.tsx:336 lets you add/remove pages inline.

5) Render (panel/frontend/src/shared/utils/instancePages.ts:104)
     InstanceDetail.tsx:95 InstanceDynamicPage:
       wildcard = useParams()['*']; effectiveSlug = wildcard.replace(/\/+$/,'') || '.'
       if !isPageAllowed(effectiveSlug, spec) → "not part of template" or NoPagesState
       content = getPageContent(effectiveSlug, spec) // prefers findPageRow else findSubPageEntry
       instanceContext = {id, name, kind, status, template_id, node_id, owner_id, config, ...}
       <CustomPageView content={content} title={getPageLabel()} instanceContext={instanceContext} pageSlug={effectiveSlug} />

   Rendering branches (CustomPageView.tsx:1090 handling):
     html → sandboxed iframe srcDoc (buildIframeDocument, postMessage SDK)
     markdown/blocks → host React (window.KSPageSDK = createCustomPageSDK direct)

6) Re-link on edits
     Edit page in Studio → re-POST /link to copy latest content into template.spec.
     Existing instance needs re-deploy or config update to pick up.
```

**Four import methods** (all validated via `validateInstancePage`):

* Studio file input (hidden) — `InstancePageStudio.tsx:424` merges arrays
* Template form import modal — `TemplateForm.tsx:147` `parsePageActions`/`parseSubPages`/`parsePageComponents`
* API: `POST /api/instance-pages/import` (multipart `file` 10 MiB) and `POST /api/instance-pages/import/url {url}` (10 s fetch) (`instance_page_handler.go:1501`)
* Marketplace: `GET /api/instance-pages/marketplace` (via `pagelib.ReadCatalog()`) + `POST /import/marketplace {page_id}`

---

## 14) Validation & Limits (Server-Side, Fail-Closed)

`validateInstancePage` (`instance_page_handler.go:338`) + `validateSubPages` `validateComponentsJSON` `validateBlocksJSON`:

| Field | Cap | Error |
|---|---|---|
| `name` | ≤200, required | `name is required / too long` |
| `description/category/type` | ≤500 | `… too long` |
| `slug` | ≤64, `^…$`, no `/` or `..` | `slug must start with a letter or number and contain only …` |
| `subPage.path` | ≤64, `^[a-z0-9_-]+$` | `sub-page path must be a single lowercase segment …` |
| `component.name` | ≤64, `^[A-Za-z0-9_][A-Za-z0-9_-]*$`, unique | `component name must start …` |
| `content_html/markdown/blocks` each | ≤1 MiB | `content_… too large (max 1MB)` |
| `content_blocks` when non-empty | JSON array | `content_blocks must be a JSON array of block objects` |
| `component.content` | ≤1 MiB | `component content too large` |
| `icon_svg` | ≤16 KiB | `icon_svg too large` |
| `actions` JSON | ≤64 KiB, JSON array | `actions must be a JSON array / too large` |
| `sub_pages` JSON | ≤512 KiB, ≤20 entries | `sub_pages must be … / too many sub-pages (max 20)` |
| `components` JSON | ≤512 KiB, ≤50 entries | `components must be … / too many components (max 50)` |
| `open_args` extras | ≤4, per-value ≤200, charset `a-zA-Z0-9 ._/ :@+=,-` | `action accepts at most 4 / unsupported characters / does not accept runtime arguments` |
| `kind` | must `custom` (builtin rejected) | `kind must be "custom"` |
| `content_type` | `html`\|`markdown`\|`blocks` when set | `content_type must be one of …` |
| Bulk create | ≤100 per request | `too many pages (max 100 per request)` |

Frontend surfaces via `getErrorMessage` (`pageStudioUtils.ts:19`) parsing `error/message` string vs object.

Corrupt `sub_pages`/`components`/`actions` in DB **degrade to `[]` on parse** (`parseSubPages` `instancePage.ts:93` etc. double-parse guard `instancePages.ts:215` `parseSpecComponents`) — never blocks UI.

---

## 15) Backend Embedding & Resolution Order

* `rebuild.sh:1078` `sync_pagelib()`:
  ```bash
  rm -rf panel/backend/internal/pagelib/library
  mkdir -p panel/backend/internal/pagelib/library/pages
  cp instance_pages/marketplace.json panel/backend/internal/pagelib/library/
  cp instance_pages/pages/*.json      panel/backend/internal/pagelib/library/pages/
  # top-level *.json fill gaps only (legacy)
  ```
* `panel/backend/internal/pagelib/pagelib.go:23` `//go:embed all:library` → `embedded embed.FS`.
* `pagelib.ListNames()` merges disk entries first then embedded. `pagelib.Read(name)` tries disk canonical → disk legacy → embedded with basename traversal guard.
* `pagelib.ReadCatalog()` same priority.

---

## 16) REST API Reference

Mounted at `panel/backend/internal/api/server.go:467`.

| Method | Path | Gate | Body / Query | Response | Handler |
|---|---|---|---|---|---|
| `GET` | `/api/instance-pages/` | `VIEW` | — | `InstancePage[]` ordered by `name` | `instance_page_repo.go:32` |
| `GET` | `/api/instance-pages/:id` | `VIEW` | — | `InstancePage` or 404 | `GetInstancePageHandler:440` |
| `POST` | `/api/instance-pages/` | `CREATE` | `instancePageDTO` JSON | `{id}` 200 or 409 slug exists | `CreateInstancePageHandler:469` |
| `PUT` | `/api/instance-pages/:id` | `EDIT` | `instancePageDTO` | 204 | `UpdateInstancePageHandler:532` |
| `DELETE` | `/api/instance-pages/:id` | `DELETE` | — | 204 | `DeleteInstancePageHandler:618` |
| `POST` | `/api/instance-pages/bulk` | `CREATE` | `{pages: instancePageDTO[]}` | `{imported, skipped, errors:[], ids:[]}` | `BulkCreateInstancePagesHandler:676` |
| `POST` | `/api/instance-pages/:id/link` | `EDIT` | `{template_ids:number[], label?, icon_svg?, enabled?}` | `{linked:number[], skipped:number[]}` | `LinkInstancePageHandler:822` |
| `POST` | `/api/instance-pages/:id/actions` | `EDIT` | `{instance_id,type,command,path,content,args,env,timeout}` | proxied edge response | `ExecutePageActionHandler:1013` (`getEnabledPages` guard) |
| `POST` | `/api/instance-pages/execute-action` | `VIEW_INSTANCES` | `{instance_id, page_slug, type,command,path,content,args,env,timeout}` | proxied edge response | `ExecuteCustomPageActionHandler:1406` (allow-list + `findSpecPageRow`) |
| `POST` | `/api/instance-pages/execute-module-action` | `VIEW_INSTANCES` | `{instance_id, module_id, type,…}` | proxied | `ExecuteModulePageActionHandler` (module `getEnabledModules` check) |
| `POST` | `/api/instance-pages/import` | `CREATE` | multipart `file` (10 MiB) | `InstancePage` | `ImportInstancePageHandler:1501` |
| `POST` | `/api/instance-pages/import/url` | `CREATE` | `{url}` | `InstancePage` | `ImportInstancePageFromURLHandler` (10 s fetch) |
| `GET` | `/api/instance-pages/marketplace` | `VIEW` | — | `MarketplaceCatalog` via `pagelib.ReadCatalog()` | `GetMarketplacePagesHandler:2216` |
| `POST` | `/api/instance-pages/import/marketplace` | `CREATE` | `{page_id}` | `InstancePage` | `ImportInstancePageFromMarketplaceHandler` |
| `GET` | `/api/instance-pages/local` | `VIEW` | — | local `ListNames` | `GetLocalPagesHandler` |
| `POST` | `/api/instance-pages/import/local` | `CREATE` | `{filename}` | `InstancePage` | `ImportInstancePageFromLocalHandler` |
| — | `/api/instance-page-modules/` etc | … | `.kspm` upload/install/uninstall/asset | unzip hardened `instance_page_handler.go:1966` (≤2000 entries, ≤64M per entry, ≤256M total) | `UploadInstancePageModuleHandler:1716` |

Client helpers: `panel/frontend/src/shared/api/admin.ts` exports `listInstancePages`, `getInstancePage`, `createInstancePage`, `updateInstancePage`, `deleteInstancePage`, `linkInstancePage`, `executePageAction`, `bulkCreateInstancePages`, `importInstancePage`, `InstancePageAction` type.

---

## 17) Security Model

* **HTML sandbox** — `CustomPageView` iframe `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"` **no** `allow-same-origin` → opaque origin, cannot touch parent DOM/cookies/storage. `HtmlBlockFrame` same minus downloads. Only `postMessage` bridge escapes, gated by `event.source===iframe` + allowlisted `BRIDGE_METHODS` (`CustomPageView.tsx:959`).
* **Icon SVG** — 10-pass strip (`sanitizeIconSVG` `instance_page_handler.go:159`).
* **Pages payload validation** — all fields trimmed + validated; corrupt `sub_pages`/`components`/`actions` degrade to `[]` on parse, never block.
* **Action allow-list** — `savedActionMatches` (`instance_page_handler.go:1217`) compares `type/command/path/content/args/env` exactly; extras only via `open_args` + `{{args}}` placeholder + `validActionArg` + `shellQuoteArg`. Everything executed comes from the **stored** definition, never the request body.
* **Page-bound execution** — `pageSlug` required; `findSpecPageRow(parseSpecRows(config), pageSlug)` (`instance_page_guard.go`) must succeed else 403. Sub-pages share parent family but cannot run arbitrary slugs.
* **fetchPanel / navigate** — `fetchPanel` only `/api/instances/<this id>/…` (`customPageSdk.ts:311`), `pageNavigateTarget` (`customPageSdk.ts:182`) rejects schemes, `//`, dot-segments, >2048 chars, and outside `/instances/<id>`. Fail-closed.
* **Uploads** — `.kspm` unzip hardened (`instance_page_handler.go:1966` traversal `filepath.Clean` + `HasPrefix(destAbs)`). Instance page imports via multipart 10 MiB (`DynamicMaxBodySize`). Marketplace fetch sanitized via `sanitizeHttpError` (HTML error pages collapse to `HTTP <status>`).
* **Component tokens** — ≤50, bounded 5 passes to avoid cycle, unknown stays literal.
* **Theme injection** — `cssConst` (`CustomPageView.tsx:903`) strips `{}<>\;` + controls, capped 256 before embedding.
* **Permissions** — `MANAGE_INSTANCE_PAGES` umbrella + `INSTANCE_PAGES_VIEW|CREATE|EDIT|DELETE` for library; `VIEW_INSTANCES` for live `execute-action`/`execute-module-action` (instance panel). Guarded in `server.go:467` `requireUmbrellaOrAction(instancePagesG, ...)`.

---

## 18) Complete Working Examples (Copy-Paste Ready)

### 18.1 Minimal Hello (Markdown) → `pages/hello.json`

```json
{
  "name": "Hello",
  "slug": "hello",
  "kind": "custom",
  "category": "documentation",
  "type": "docs",
  "description": "Minimal working page",
  "content_type": "markdown",
  "content_markdown": "# Hello\n\nThis is a **working** page for instance `{{instance.name}}`.\n\n- Uses `markdown` content_type\n- Add actions + SDK later\n",
  "icon_svg": "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/>"
}
```

Deploy: upload via Studio → link to template → deploy instance → visit `/instances/<id>/hello`.

### 18.2 Interactive HTML Dashboard with Actions & `{{component:…}}`

```json
{
  "name": "My Dashboard",
  "slug": "dashboard",
  "kind": "custom",
  "category": "monitoring",
  "type": "dashboard",
  "description": "Status + action buttons",
  "content_type": "html",
  "content_html": "<style id=\"ks-instance-theme-support\">.ks-page{color:var(--ks-body,#e5e7eb);font-family:var(--ks-font-family,-apple-system,sans-serif);line-height:1.6}.ks-card{background:var(--ks-card-bg,rgba(255,255,255,0.04));border:1px solid var(--ks-card-border,rgba(255,255,255,0.10));border-radius:.75rem;padding:1rem;margin-bottom:.75rem}.ks-btn-blue{background:#0284c7;color:#fff;border:none;padding:.5rem 1rem;border-radius:.375rem;cursor:pointer}.ks-muted{color:var(--ks-muted,#9ca3af)}</style>\n<div class=\"ks-page\">\n{{component:site_header}}\n<div class=\"ks-card\"><h2>Status</h2><p class=\"ks-muted\" id=\"out\">Loading…</p><div style=\"display:flex;gap:.5rem;margin-top:.75rem\"><button class=\"ks-btn-blue\" onclick=\"load()\">Refresh</button><button class=\"ks-btn-blue\" onclick=\"KSPageSDK.runAction('restart_app')\">Restart app</button></div></div>\n<div class=\"ks-card\"><h3>Sub-page</h3><a href=\"#\" onclick=\"KSPageSDK.navigate('/instances/'+KSPageSDK.instance.id+'/dashboard/edit');return false\">Open Editor sub-page →</a></div>\n</div>\n<script>\nasync function load(){\n  try{\n    const r = await KSPageSDK.runAction('get_status');\n    document.getElementById('out').textContent = r.ok ? (r.stdout||'ok') : (r.error||r.stderr||'failed');\n  }catch(e){ document.getElementById('out').textContent = String(e.message||e); }\n}\nwindow.addEventListener('ks-page-sdk-ready', load);\nif(window.KSPageSDK) load();\n</script>",
  "icon_svg": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
  "actions": "[{\"name\":\"get_status\",\"type\":\"shell\",\"command\":\"cat /etc/os-release 2>&1; echo ---; uptime 2>&1; echo ---; systemctl status myapp 2>&1 | head -n 20\",\"timeout\":15,\"description\":\"OS + uptime + service\"},{\"name\":\"restart_app\",\"type\":\"shell\",\"command\":\"systemctl restart myapp 2>&1 && echo restarted\",\"timeout\":30}]",
  "components": "[{\"name\":\"site_header\",\"type\":\"html\",\"content\":\"<header class=\\\"ks-card\\\"><h2>◆ KS Demo — {{instance.name}}</h2><p class=\\\"ks-muted\\\">Node {{instance.node_name}} · kind {{instance.kind}}</p></header>\"}]",
  "sub_pages": "[{\"path\":\"edit\",\"name\":\"Editor\",\"content_type\":\"html\",\"content_html\":\"<style id=\\\"ks-instance-theme-support\\\">.ks-page{color:var(--ks-body,#e5e7eb);font-family:var(--ks-font-family,sans-serif)} .ks-card{background:var(--ks-card-bg,rgba(255,255,255,0.04));border:1px solid var(--ks-card-border,rgba(255,255,255,0.10));border-radius:.75rem;padding:1rem}</style><div class=\\\"ks-page\\\">{{component:site_header}}<div class=\\\"ks-card\\\"><h2>Editor sub-page</h2><p>Query: <code id=\\\"q\\\"></code></p><button class=\\\"ks-btn-blue\\\" onclick=\\\"history.back()\\\">Back</button></div></div><script>document.getElementById('q').textContent = KS_PAGE_QUERY||'(none)';<\\/script>\"}]"
}
```

* Main route `/dashboard`, sub-page `/dashboard/edit` (inherits `{{component:site_header}}`).
* Two actions tested in Studio Preview as well (bind instance → *Test*).

### 18.3 File Operations + Docker + Runtime Args (like `docker-manager.json` / `minecraft-plugins.json`)

```json
{
  "name": "Ops Panel",
  "slug": "ops",
  "kind": "custom",
  "category": "management",
  "description": "Plugins-style ops: list files, wget + rm, logs via {{args}}",
  "content_type": "html",
  "content_html": "<style id=\"ks-instance-theme-support\">.ks-page{color:var(--ks-body,#e5e7eb);font-family:var(--ks-font-family,sans-serif)}.ks-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,.1);border-radius:.75rem;padding:1rem;margin-bottom:.75rem} table{border-collapse:collapse;width:100%}</style><div class=\"ks-page\"><div class=\"ks-card\"><h2>Ops</h2><div style=\"display:flex;gap:.5rem\"><input id=\"url\" placeholder=\"https://.../plugin.jar\" style=\"flex:1\"><button onclick=\"get()\">Install</button></div><div id=\"list\">Loading…</div></div></div><script>async function refresh(){const files=await KSPageSDK.listFiles('plugins/'); el('list').innerHTML=files.map(f=>`<div>${f.name} ${f.is_dir?'(dir)':''} <button onclick=\"rm('${f.name}')\">rm</button></div>`).join('');} async function get(){ await KSPageSDK.runAction('plugin_get',{args:[el('url').value]}); await refresh(); } async function rm(n){ await KSPageSDK.runAction('plugin_rm',{args:[n]}); await refresh(); } function el(id){return document.getElementById(id)} refresh();</script>",
  "icon_svg": "<path d=\"M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z\"/>",
  "actions": "[{\"name\":\"ls_plugins\",\"type\":\"list_files\",\"path\":\"plugins/\"},{\"name\":\"plugin_get\",\"type\":\"shell\",\"command\":\"wget {{args}} -P plugins/\",\"open_args\":true,\"timeout\":60},{\"name\":\"plugin_rm\",\"type\":\"shell\",\"command\":\"rm plugins/{{args}}.jar\",\"open_args\":true,\"timeout\":15},{\"name\":\"logs\",\"type\":\"shell\",\"command\":\"docker logs --tail 100 {{args}}\",\"open_args\":true,\"timeout\":20},{\"name\":\"prune\",\"type\":\"docker\",\"command\":\"image\",\"args\":[\"prune\",\"--force\"],\"timeout\":120}]"
}
```

### 18.4 Visual Blocks Page with `action` Blocks (like `complete-example.json`)

```json
{
  "name": "Blocks Demo",
  "slug": "blocks-demo",
  "kind": "custom",
  "category": "documentation",
  "description": "Every block type",
  "content_type": "blocks",
  "content_blocks": "[{\"type\":\"heading\",\"value\":\"Blocks Demo\",\"level\":1,\"align\":\"center\"},{\"type\":\"text\",\"value\":\"Host-rendered — window.KSPageSDK available.\",\"align\":\"center\"},{\"type\":\"divider\"},{\"type\":\"stat\",\"value\":\"12\",\"label\":\"Running\",\"unit\":\"svc\",\"tone\":\"good\"},{\"type\":\"table\",\"value\":\"[[\\\"Svc\\\",\\\"State\\\"],[\\\"web\\\",\\\"up\\\"],[\\\"db\\\",\\\"up\\\"]]\"},{\"type\":\"list\",\"value\":\"[\\\"step 1\\\",\\\"step 2\\\"]\"},{\"type\":\"code\",\"value\":\"echo hello\"},{\"type\":\"button\",\"value\":\"External docs\",\"href\":\"https://example.com\"},{\"type\":\"action\",\"action\":\"ping\",\"label\":\"Ping\",\"confirmText\":\"Run ping?\"},{\"type\":\"html\",\"value\":\"<div class=\\\"ks-card\\\">Html block (no SDK, presentational only)</div>\"},{\"type\":\"spacer\"}]",
  "icon_svg": "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/><path d=\"M2 17l10 5 10-5\"/><path d=\"M2 12l10 5 10-5\"/>",
  "actions": "[{\"name\":\"ping\",\"type\":\"shell\",\"command\":\"echo pong; date\",\"timeout\":10}]"
}
```

---

## 19) Author Checklist for a Shippable Page

- [ ] `name` ≤200, `slug` unique (`^[A-Za-z0-9][A-Za-z0-9._-]*$` or `.` ≤64), `kind: "custom"` (`instance_page_handler.go:99`).
- [ ] `content_type` matches exactly one `content_*` with non-empty content (otherwise "has no content" card).
- [ ] For `html`: lead with `<style id="ks-instance-theme-support">` header from a shipped page so theme follows (`CustomPageView.tsx:790`).
- [ ] For `blocks`: `content_blocks` is a JSON array (not object), tested in Studio Visual + JSON toggle (`validateBlocksJSON`).
- [ ] `icon_svg` inner markup only, no `on*=` / `javascript:`.
- [ ] `actions` each has `name` + `type`; `open_args` only when `{{args}}` present in `shell` command; tested via Preview → *Test* (`InstancePageStudio.tsx:332`).
- [ ] `sub_pages` paths `^[a-z0-9_-]+$` and `components` names `^[A-Za-z0-9_][A-Za-z0-9_-]*$` unique.
- [ ] `{{component:name}}` names match exactly (case-sensitive) and referenced page family defines them (sub-pages inherit parent).
- [ ] File lives at `instance_pages/pages/<slug>.json` (canonical) and entry added to `marketplace.json` if it should appear in marketplace.
- [ ] `rebuild.sh` run locally: `sync_pagelib` must see `<count> file(s)` (`rebuild.sh:1127`).
- [ ] Import tested: Studio import, template link (`POST /:id/link`), instance deploy, `/instances/<id>/<slug>` + `isPageAllowed` + `KSPageSDK.runAction` live round-trip.
- [ ] Limits respected: `actions` 64 KiB, `sub_pages`/`components` 512 KiB each, `content_*` 1 MiB each.

---

## 20) Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar has no tabs | `spec.pages` empty (empty-by-default) | Link pages to template: Template → Pages → *Add pages* or `POST /api/instance-pages/:id/link {template_ids:[…]}` |
| "not part of this instance's template" | `isPageAllowed` false → slug not in `instance.config.pages` (`instancePages.ts:141`) | Re-link page, redeploy instance, verify `slug` matches library `slug` |
| "has no content" | Row found but all `content_*` empty | Re-import; `content_type` must match filled `content_*` |
| Component stays `{{component:x}}` | `name` mismatch or family has no `components` | Check Components tab name regex, ensure saved + re-linked; sub-pages inherit parent only |
| Action `403 action is not defined` | Payload not byte-for-byte stored `PageActionDef` or `pageSlug` not enabled (`savedActionMatches` `instance_page_handler.go:1217`) | Ensure action saved, page linked, instance carries slug, `open_args` + `{{args}}` if using extras |
| Static preview rejects `runAction` | `STATIC_SDK_STUB` intentionally | Bind instance in Preview (select instance → Preview) |
| HTML not themed | Theme CSS not baked | Ensure `customPageThemeCss` reachable — page must go through `CustomPageView`; copy header from shipped page |
| Icon missing | SVG inner sanitized away | Use inner markup only, no `<script>`/`on*=`/`javascript:` (`sanitizeIconSVG`) |
| Save `409 slug already exists` | Unique slug | Change `slug` |
| `sub_pages too large` / `too many` | 512 KiB / 20 cap | Split into separate pages |
| `open_args` extras rejected | Charset `validActionArg` or missing `{{args}}` | Values must match `[a-zA-Z0-9 ._/ :@+=,-]` ≤200; for `shell` the stored `command` must contain `{{args}}` |

---

## 21) File Map

```
instance_pages/
  README.md           # quick format reference
  GUIDE.md            # this file — exhaustive manual
  marketplace.json    # catalog (pagelib.ReadCatalog) → version 1.0, pages[].download_url raw GitHub
  pages/
    *.json            # library: home (slug "."), docker-manager, files, metrics, terminal, etc. (30 files)

panel/backend/
  internal/api/handlers/instance_page_handler.go  # DTO, validation, CRUD, link, execute, import, modules
  internal/api/handlers/instance_page_guard.go    # findSpecPageRow, parseSpecRows, action guard helpers
  internal/repository/instance_page_repo.go       # List/Get/Create/Update/Delete
  internal/models/instance.go                     # InstancePage struct (Components string)
  internal/db/migrations/{mysql,postgres,sqlite}/032_…049_… # schema
  internal/api/server.go:467                      # route mounts + permission gates
  internal/pagelib/{pagelib.go,pagelib_test.go,library/} # embed + disk→embed resolution
  internal/pagelib/library/marketplace.json       # embedded copy (rebuild.sh syncs)
  internal/pagelib/library/pages/*.json           # embedded copy (rebuild.sh syncs)

panel/frontend/src/
  features/instance-pages/
    pages/{InstancePages.tsx,InstancePageDetail.tsx,InstancePageStats.tsx,InstancePageStudio.tsx}
    components/PageStudio/{PageStudioTabs.tsx,PageStudioTemplatesSection.tsx,PageStudioContentSection.tsx,
                          PageStudioSubPagesSection.tsx,PageStudioComponentsSection.tsx,
                          PageStudioActionsSection.tsx,PageStudioPreviewSection.tsx,PageStudioBlocksEditor.tsx,
                          PageStudioSettingsSection.tsx}
    templates/pageStarters.ts                     # PageStarter[] (CATEGORY minecraft filter etc.)
    types/{instancePage.ts,pageStudio.ts,pageregistry.ts}
    utils/pageStudioUtils.ts                      # blankAction/blankSub/blankComponent, validators, renderPreview
  shared/
    utils/instancePages.ts                        # resolver single source (resolveInstanceNav, isPageAllowed, getPageContent:104)
    components/ui/CustomPageView.tsx              # renderer (iframe/markdown/blocks, SDK bridge, tokens, theme:11)
    lib/customPageSdk.ts                          # KSPageSDK factory (createCustomPageSDK:220, pageNavigateTarget:182)
    api/admin.ts                                  # REST client exports
    types/instancePage.ts                         # re-export canonical
    components/layout/{InstanceNavContext.tsx,Sidebar.tsx,Header.tsx}
  features/templates/{types/templateForm.ts,utils/templateFormUtils.ts,pages/TemplateForm.tsx}
  features/instances/{types/instanceForm.ts,utils/instanceFormUtils.ts,pages/InstanceDetail.tsx}
  shared/stores/themeStore.ts:413                 # activeTheme for customPageThemeCss

docs/
  instance-page.md                                # exhaustive library+rendering doc (pinned to handler:40 etc.)
  vm.md                                           # fleet/VM doc referencing instance pages
  vs.md / futures.md                              # system overview mentions

rebuild.sh:1078 sync_pagelib() — embeds instance_pages → pagelib/library before kspanel compile
```

---

*Last verified against:* `instancePage.ts:25`, `instancePages.ts:104`, `CustomPageView.tsx:11`, `customPageSdk.ts:216`, `instance_page_handler.go:40`, `instance_page_repo.go:32`, `TemplateForm.tsx:147`, `InstancePageStudio.tsx:67`, `pagelib.go:98`, `router.tsx:109`, `server.go:467`, migrations `032–049`, `pageStudioUtils.ts:19` (build `index-C-6mEd_3.js` 2026-08-29).

