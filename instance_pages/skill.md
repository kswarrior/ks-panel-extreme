# Instance Pages — AI Builder Skill

> Read this file FIRST before creating or editing any instance page.
> Follow it exactly and you will produce a fully functional page on the first try.
> Deep manual: `instance_pages/GUIDE.md`. Quick ref: `instance_pages/README.md`.
> Live examples: `instance_pages/pages/*.yaml` (`ports.yaml` = best HTML template,
> `react-dashboard.yaml` = best React template, `files.yaml` = best sub-page + configure template).
> Shared theme CSS source: `instance_pages/shared/ks_theme_head.html`.

## 1. What you are building

An **instance page** is one YAML file at `instance_pages/pages/<slug>.yaml` that renders
as a sidebar tab at `/instances/:id/<slug>` inside a deployed instance.

Pipeline: YAML file → Studio import or `rebuild.sh` embed → library row (`instance_pages` table)
→ linked into `template.spec.pages[]` → snapshotted into `instance.config` → rendered by
`CustomPageView` with `window.KSPageSDK` injected.

Empty-by-default: nothing renders until the page is **linked to a template** and the
instance is (re)deployed.

## 2. Pick content_type first

| content_type | Use when | Rendered | SDK access |
|---|---|---|---|
| `html` | dashboards, file managers, forms, anything interactive (DEFAULT CHOICE) | Sandboxed opaque-origin iframe (`allow-scripts allow-forms allow-popups allow-modals`, NO `allow-same-origin`) | `window.KSPageSDK` via postMessage bridge, `window.KS_PAGE_QUERY`, `window.KS_PAGE_CONFIG` |
| `react` | stateful UI with hooks/tabs/charts, multi-file code | Host-side React (`ReactModuleView`), no iframe | `sdk` + `React` args in scope, `sdk.useHashRoute` for tabs |
| `blocks` | static info page, no HTML/JS wanted, Studio visual editor | Host-side React | Only via `action` blocks → `runAction` |
| `markdown` | docs/readme only, zero interactivity | Host-side React | None (static) |

Rule: if the page has buttons, inputs, polling, or fetches → use `html` (or `react` if you want hooks). Never use `markdown` for interactive pages.

## 3. Canonical YAML skeleton (copy this)

```yaml
name: My Page            # required, <=200 chars, sidebar label
slug: my-page            # required, <=64, ^[A-Za-z0-9][A-Za-z0-9._-]*$  ("." = Home page only)
kind: custom             # MUST be "custom" ("builtin" is rejected)
category: management     # free tag, prefer: documentation|dashboards|monitoring|management|security|automation|storage|networking|containers|services|system|minecraft|overview|console|configuration
type: dashboard          # optional flavor: dashboard|status|docs|admin-panel|widget|generic
description: What this page does in one sentence.
content_type: html       # required: html|markdown|blocks|react
content_html: |
  {{component:ks_theme_head}}<div class="ks-page">
    <div id="root"><div class="ks-card"><div class="ks-skeleton-bar" style="height:12px;width:40%"></div></div></div>
  </div>
  <script>
  (function () {
    'use strict';
    function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function el(id){ return document.getElementById(id); }
    async function load(){
      var sdk = window.KSPageSDK;
      try {
        var r = await sdk.runAction('get_status');
        el('root').innerHTML = '<div class="ks-card"><pre class="ks-mono">'+esc(r.ok ? (r.stdout||'ok') : (r.error||r.stderr||'failed'))+'</pre></div>';
      } catch(e){ el('root').innerHTML = '<div class="ks-card" style="color:var(--ks-bad)">'+esc(e.message||e)+'</div>'; }
    }
    if (window.KSPageSDK) load();
    else window.addEventListener('ks-page-sdk-ready', load, { once: true });
  })();
  </script>
icon_svg: <path d="M12 2L2 7l10 5 10-5-10-5z"/>   # optional, INNER svg markup only, <=16 KiB
actions:
  - name: get_status
    type: shell
    command: cat /etc/os-release 2>&1; uptime 2>&1
    timeout: 15
    description: OS + uptime
sub_pages:            # optional, <=20 entries, <=512 KiB JSON
  - path: edit        # MUST match ^[a-z0-9_-]+$ (lowercase), <=64
    name: Editor
    content_type: html
    content_html: |
      {{component:ks_theme_head}}<div class="ks-page"><div class="ks-card"><h2>Editor</h2><p id="q" class="ks-muted"></p></div></div>
      <script>
        document.getElementById('q').textContent = String(window.KS_PAGE_QUERY || '(none)');
      </script>
components:           # optional, <=50 entries, <=512 KiB JSON
  - name: site_header
    type: html
    content: <header class="ks-card"><h2>My app</h2></header>
configure:            # optional page settings (template-overridable vars)
  - name: read_only
    label: Read-only
    description: Hide editing controls.
    default: 'false'
    user_viewable: true
    user_editable: true
    required: false
    rule: ''
    display: toggle      # text|number|select|checkbox|toggle
    options: ''
    append: false
    prepend: ''
    append_value: ''
```

Content fields by type (fill EXACTLY the one matching `content_type`):

```yaml
content_type: html
content_html: |        # <=1 MiB, raw HTML+JS, literal block
  ...
---
content_type: markdown
content_markdown: |    # <=1 MiB
  # Title
  Hello **world**.
---
content_type: blocks
content_blocks:        # NATIVE yaml list (not a JSON string)
  - type: heading
    value: Welcome
    level: 1
    align: center
  - type: action
    action: ping
    label: Ping
---
content_type: react
source_tsx: |          # <=512 KiB entry + reachable modules, JSX + light TS only
  import { useState, useEffect } from 'react';
  function Page() {
    const [v, setV] = useState('hi');
    return <div className="ks-page"><div className="ks-card">{v}</div></div>;
  }
  return Page;
bundle_css: '.ks-react-page .ks-tab { margin-right: 6px; }'   # optional extra CSS
```

## 4. Hard rules (validation fails closed — memorize these)

1. `name`, `slug`, `content_type` + matching `content_*` are required. `kind` must be `custom` or omitted.
2. `slug`: `^[A-Za-z0-9][A-Za-z0-9._-]*$`, <=64, no `/`, no `..`, UNIQUE. `"."` is the reserved Home page.
3. `sub_pages[].path`: `^[a-z0-9_-]+$` lowercase only, <=64. Effective route = `<slug>/<path>`. Sub-pages are NOT sidebar tabs; open via `sdk.navigate()` or URL.
4. `components[].name`: `^[A-Za-z0-9_][A-Za-z0-9_-]*$`, <=64, unique per page. Reference as `{{component:name}}` (whitespace tolerant). Unknown names stay literal. 5 nested passes max.
5. `icon_svg`: inner markup ONLY (e.g. `<path .../>`), never `<svg>`, never `on*=` / `javascript:` / `<script>` — server strips them.
6. Sizes: each `content_*` <=1 MiB; `source_tsx` <=512 KiB; `actions` JSON <=64 KiB; `sub_pages`/`components`/`configure` JSON <=512 KiB each; `actions` any count that fits; `sub_pages` <=20; `components` <=50 rows; react modules <=20 files.
7. `content_blocks` must be a JSON array when non-empty (in YAML write a native list).
8. NEVER invent SDK methods, endpoints, or URL shapes. Only what §6 lists exists.

## 5. Theme — mandatory first line of every HTML page

Every `content_html` (main AND each sub-page) MUST start with:

```
{{component:ks_theme_head}}<div class="ks-page">
```

`ks_theme_head` is a **built-in shared component** — no `components:` row needed, it resolves automatically. Without it the page ignores the admin theme.

Then use ONLY these theme-aware classes/tokens (copy patterns from `ports.yaml` / `env.yaml`):

- Layout: `ks-page` (root wrapper, always), `ks-card`, `ks-row`, `ks-muted`, `ks-mono`, `ks-ok|ks-bad|ks-warn|ks-info`, `ks-badge`, `ks-bar`
- Buttons: `ks-btn` / `ks-btn-blue` / `ks-btn-green` / `ks-btn-red` / `ks-btn-icon` / `ks-tab` (+ `ks-tab-active`)
- Forms: `ks-input`, `ks-select`, `ks-textarea`, `ks-label`, `ks-checkbox`, `ks-toggle`
- Colors: `var(--ks-body)`, `var(--ks-heading)`, `var(--ks-muted)`, `var(--ks-card-bg)`, `var(--ks-card-border)`, `var(--ks-info)`, `var(--ks-ok)`, `var(--ks-bad)`, `var(--ks-warn)`
- Loading: `ks-skeleton`, `ks-skeleton-bar`

Do NOT hardcode dark colors (`#111`, `#fff` backgrounds). Do NOT add your own `<style>` that overrides `.ks-card`/`.ks-btn` — use the tokens.

## 6. KSPageSDK cookbook (HTML pages: `window.KSPageSDK`)

Boot pattern (use verbatim):

```js
if (window.KSPageSDK) start(window.KSPageSDK);
else window.addEventListener('ks-page-sdk-ready', function(){ start(window.KSPageSDK); }, { once: true });
```

Available globals in iframe: `window.KSPageSDK`, `window.KS_PAGE_QUERY` (parent query string, e.g. `?path=/x` → `new URLSearchParams(KS_PAGE_QUERY).get('path')`), `window.KS_PAGE_CONFIG` (merged configure values).

| Call | What it does | Notes |
|---|---|---|
| `await sdk.runAction('name')` | Run a SAVED action from `actions:` | PREFERRED for everything. Returns `{ok, stdout, stderr, exit_code, error, data}`. Missing name → `{ok:false}`. |
| `await sdk.runAction('n',{args:['a','b']})` | Saved action + runtime args | Action needs `open_args: true` + `{{args}}` in shell `command`. ≤4 args, each ≤200 chars, charset `a-zA-Z0-9 ._/ :@+=,-`. |
| `await sdk.fetchPanel('/processes')` | GET panel API for THIS instance | Only `/api/instances/<own-id>/…`; relative `/x` auto-bound. `sdk.fetchPanel('')` = instance object (has `.config.env`). POST with `{method:'POST', body, headers}`. 30 s timeout. |
| `sdk.listFiles('plugins/')` / `sdk.readFile(p)` / `sdk.writeFile(p,c)` / `sdk.createDirectory(p)` / `sdk.deleteFile(p)` | File ops | Thin wrappers over allow-listed actions. Prefer `fetchPanel('/files…')` for full explorer parity (stat/rename/copy/chmod/archive/extract/search/upload/download — see SDK source). |
| `sdk.listPorts()` / `sdk.savePorts([{host,container,protocol,ip}])` | Ports parity | `savePorts` replaces the whole table — read first, then write. |
| `sdk.saveEnv({KEY:'v'})` | Replace instance env | RECREATES workload — always `await sdk.confirm(...)` first. |
| `sdk.power('restart')` / `sdk.reinstall()` | Power | `start|stop|restart|kill`. Confirm first. |
| `sdk.getMetrics()` / `sdk.listProcesses()` / `sdk.killProcess(pid)` / `sdk.listAudit(n)` | Monitoring | Poll with `setInterval` 5 s+. |
| `sdk.listSecrets()` / `sdk.setSecret(k,v)` / `sdk.deleteSecret(k)` / `sdk.revealSecret(k)` | Secrets vault | NEVER put secrets in `sdk.kv`/`sdk.storage`. |
| `sdk.getSftp()/enableSftp()/rotateSftp()/disableSftp()/revealSftp()` | SFTP | As named. |
| `sdk.uploadFile(path, base64)` / `sdk.downloadFile(path)` | Binary-safe transfer | base64 rides the JSON bridge. `downloadText(name,text,mime)` saves client-side. |
| `sdk.navigate('/instances/'+sdk.instance.id+'/files/edit?path=/x')` | SPA navigation | ONLY `/instances/<own-id>/**` allowed; schemes/`//`/`..`/over-2048 rejected. NEVER hardcode slug — derive siblings from `sdk.pageSlug`. |
| `sdk.toast(msg,'success'|'error'|'info'|'warning')` | Toast | Always give feedback after actions. |
| `await sdk.confirm(msg)` / `await sdk.prompt(msg,def)` | Themed dialogs | Use instead of `window.confirm`. |
| `sdk.chart(elm, [1,2,3], {kind:'bars'|'line'})` | Canvas chart | Returns cleanup fn. Max 120 points. |
| `sdk.markdown(md)` | Safe markdown → HTML string | Assign via `innerHTML` (already escaped). |
| `sdk.formatBytes(n)` / `sdk.timeAgo(ts)` / `sdk.copyText(s)` / `sdk.downloadText(f,t,m)` / `sdk.debounce(fn,ms)` | Pure helpers | Use instead of hand-rolling. |
| `sdk.on(ev,cb)` / `sdk.emit(ev,d)` / `sdk.once(ev,cb)` | Page-local pub/sub | — |
| `await sdk.storage.get/set/delete/keys()` | Browser localStorage | Per `ks_page_<id>_` prefix, current browser only. |
| `await sdk.kv.get/set/delete/keys()` | Server KV (shared) | Per `(instance, page-family)`, ≤100 keys, key `^[A-Za-z0-9_.-]{1,128}$`, value ≤64 KiB string. Sub-pages share parent family. NOT for secrets. |
| `sdk.connectWS([], 'terminal'|'workflow'|'startup', {terminal, timeout})` | Terminal WS | Same JSON wire as panel Terminal. |
| `sdk.subscribe({type:'shell',command:'…'}, cb, 5000)` | Polling | interval ≥1000 ms, returns unsub. Prefer plain `setInterval` + `runAction` for readability. |
| `sdk.instance` | `{id,name,kind,status,template_id,node_id,owner_id,config,…}` | Read-only context. |
| `sdk.pageSlug` | e.g. `files` or `files/edit` | Use to build sibling URLs. |
| `sdk.config.NAME` / `{{config:NAME}}` | Configure values | `configure:` defaults merged with per-template overrides. |
| `sdk.docker/kvm/lxd(cmd,args)` / `sdk.shell(cmd)` / `sdk.executeAction({...})` | Raw exec | FAILS with 403 unless payload byte-matches a SAVED action. Always prefer `runAction`. |

`fetchPanel` full explorer examples (used by `files.yaml`):

```js
// read:  GET /api/instances/<id>/files/read?path=<p>  → text
// write: POST /api/instances/<id>/files?op=write&path=<p>  body=text/plain
// via sdk.fetchPanel('/files/read?path='+encodeURIComponent(p))
// via sdk.fetchPanel('/files?op=write&path='+encodeURIComponent(p), {method:'POST', body: text, headers:{'Content-Type':'text/plain'}})
```

## 7. Actions cookbook (the allow-list)

The browser can ONLY execute what you declare in `actions:`. Server checks the payload byte-for-byte against the stored def (`savedActionMatches`) AND that `page_slug` is enabled on the instance. Anything else → `403 action is not defined`.

```yaml
actions:
  - name: get_status        # unique per page, called via runAction('get_status')
    type: shell             # shell|read_file|write_file|list_files|docker|kvm|lxd (+ stat|chmod|archive|extract)
    command: cat /etc/os-release 2>&1; uptime 2>&1
    timeout: 15             # seconds, 1-600, default 30
    description: OS + uptime
  - name: read_props
    type: read_file
    path: server.properties
  - name: save_props
    type: write_file
    path: server.properties
    content: motd=Hello
  - name: ls_plugins
    type: list_files
    path: plugins/
  - name: prune
    type: docker
    command: image
    args: [prune, --force]
    timeout: 120
  # runtime-arg actions (the ONLY way to take user input into a command):
  - name: container_logs
    type: shell
    command: docker logs --tail 200 {{args}}   # {{args}} placeholder REQUIRED for shell
    open_args: true
    timeout: 30
```

Rules:

- `shell|docker|kvm|lxd` need `command` (+ optional `args`, `env`). File types need `path` (+ `content` for `write_file`).
- `open_args: true` + `{{args}}` is the ONLY way to pass user input. Call as `runAction('container_logs',{args:[name]})`. Values are shell-quoted server-side.
- `read_file|write_file|list_files` NEVER take runtime args.
- Keep commands non-interactive, `2>&1` merged, bounded (`--tail`, `head -n`), with `timeout`.
- JS: ALWAYS `esc()` action output into HTML; check `r.ok` before using `r.stdout`; toast on error.

## 8. Components, configure, sub-pages

**Components** — one fragment, reused on main + all sub-pages:

```yaml
components:
  - name: site_header
    type: html        # html|markdown|block (+ shared import-by-ref, + module react files)
    content: <header class="ks-card"><h2>My app</h2></header>
```

```html
{{component:site_header}}
```

Sub-pages inherit the PARENT's components (they cannot define their own). `ks_theme_head` needs no row (panel-shared).

**Configure** — template-tunable settings:

```yaml
configure:
  - name: files_home
    label: Home folder
    description: Folder the page opens by default.
    default: ''
    display: text
    user_viewable: true
    user_editable: true
```

Use as `{{config:files_home}}` in HTML, `sdk.config.files_home` / `window.KS_PAGE_CONFIG.files_home` in JS. `display:` is `text|number|select|checkbox|toggle`. Name must match `^[A-Za-z_][A-Za-z0-9_]*$`, <=64.

**Sub-pages** — extra routes in one family (`/files` + `/files/edit`):

```yaml
sub_pages:
  - path: edit
    name: Editor
    content_type: html   # html|markdown|blocks|react each supported
    content_html: |
      {{component:ks_theme_head}}<div class="ks-page">…</div>
```

Link between them WITHOUT hardcoding slugs where possible:

```js
sdk.navigate('/instances/'+sdk.instance.id+'/files/edit?path='+encodeURIComponent(p));
// sub-page reads: new URLSearchParams(window.KS_PAGE_QUERY||'').get('path')
```

## 9. Blocks catalog (content_type: blocks)

Each row: `{type, value, href?, level?, align?, label?, unit?, tone?, action?, confirmText?}`.

`heading(value,level 1-3,align)` `text(value,align)` `image(value URL)` `button(value label,href)` `code(value)` `stat(value,label,unit,tone default|good|warn|bad)` `table(value = JSON string[][])` `list(value = JSON string[] or newline lines)` `html(value raw HTML, NO SDK)` `action(action=saved name,label,confirmText)` `spacer` `divider`.

```yaml
content_blocks:
  - {type: heading, value: Welcome, level: 1, align: center}
  - {type: text, value: Host-rendered page., align: center}
  - {type: stat, value: '12', label: Running, unit: svc, tone: good}
  - {type: action, action: ping, label: Ping, confirmText: Run ping?}
```

Needs a matching `actions: [{name: ping, …}]`. `html` blocks are presentational only (no SDK bridge).

## 10. React pages (content_type: react)

```yaml
content_type: react
source_tsx: |
  import { useState, useEffect } from 'react';
  function Page() {
    const [tab, setTab] = sdk.useHashRoute(['overview','system'], 'overview');
    const [out, setOut] = useState('loading…');
    useEffect(() => { sdk.runAction('get_status').then(r => setOut(r.stdout || 'ok')); }, []);
    return (
      <div className="ks-page">
        <div className="ks-card"><pre className="ks-mono">{out}</pre></div>
      </div>
    );
  }
  return Page;
actions:
  - {name: get_status, type: shell, command: uname -a; cat /etc/os-release 2>&1, timeout: 20}
```

Rules: entry + `return Page;` at end. Only `import ... from 'react'` allowed (+ relative `./x` multi-file modules stored as `components: [{type: module}]`). No other packages. Light TS ok (`interface/type/enum`, `: T`, `as T`, `<T>`). No `export ... from`. Use `sdk.*` directly (in scope), `className` not `class`. Tabs via `sdk.useHashRoute(tabs, fallback)` — tab ids `[a-z0-9_-]` <=64. Full example: `react-dashboard.yaml`.

## 11. Ship checklist (do all of these)

1. File at `instance_pages/pages/<slug>.yaml` (ONE page per file). Filename stem SHOULD equal `slug` (or `minecraft-properties.yaml` → slug `mc-properties` style exception documented in marketplace).
2. Starts HTML with `{{component:ks_theme_head}}<div class="ks-page">`, root `id="root"` + skeleton, `esc()` all outputs, `ks-page-sdk-ready` boot, toasts on success/error, `sdk.confirm` before destructive ops.
3. Actions declared + tested: every `runAction('x')`/`fetchPanel` target has a matching saved action or instance endpoint; `open_args` only with `{{args}}`.
4. Limits respected (§4.6). `icon_svg` inner-only.
5. Import test: Studio → Preview (bind instance → Test actions) → link to template (`POST /:id/link {template_ids}`) → deploy → visit `/instances/<id>/<slug>` + sub-routes.
6. Embed: run `rebuild.sh` (`sync_pagelib` copies `marketplace.json` + `pages/*.yaml` into `panel/backend/internal/pagelib/library/` → `go:embed`).
7. Marketplace (if public): add entry to `instance_pages/marketplace.json` with `id`, `name`, `description`, `category`, `download_url: https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/instance_pages/pages/<file>.yaml`.

```json
{"id":"my-page","name":"My Page","description":"…","category":"management","author":"kswarrior","version":"1.0","tags":["…"],"download_url":"https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/instance_pages/pages/my-page.yaml","icon_svg":"<path d=\"…\"/>","preview_image":""}
```

## 12. DO / DO NOT

DO: single `<script>` IIFE + `'use strict'`; `esc()`; skeleton → content; empty-state cards; `sdk.confirm` for destructive; `savePorts` read-modify-write; `saveEnv` confirm; derive URLs from `sdk.instance.id` + `sdk.pageSlug`; poll ≤ every 5 s with cleanup.

DO NOT: `fetch()` arbitrary URLs (use `sdk.fetchPanel`); touch `parent/dom/cookie/localStorage` directly (opaque origin — use `sdk.storage/kv`); `eval`/`innerHTML` with unescaped action output; hardcoded `/instances/5/…` ids; `allow-same-origin`; outer `<svg>` in `icon_svg`; secrets in `kv`; interactive/long-running commands without timeout.

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| No sidebar tabs | Page not linked: link to template, redeploy (empty-by-default). |
| `not part of this instance's template` | `slug` mismatch / not in `instance.config` — re-link + redeploy. |
| `has no content` | `content_type` doesn't match the filled `content_*`. |
| `{{component:x}}` stays literal | Name typo or sub-page defining own components (inherit parent only). |
| `403 action is not defined` | Payload ≠ stored def, or `page_slug` not enabled, or missing `{{args}}`+`open_args` for extras. |
| Static preview `runAction` rejects | Expected — bind an instance in Preview. |
| Page ignores theme | Missing `{{component:ks_theme_head}}` first line. |
| `409 slug already exists` | Rename `slug`. |
| `open_args` rejected | Charset/length (`[a-zA-Z0-9 ._/ :@+=,-]`, ≤200, ≤4) or `shell` missing `{{args}}`. |

## 14. Minimal full examples

**HTML + action + navigate** — save as `instance_pages/pages/ops-demo.yaml`:

```yaml
name: Ops Demo
slug: ops-demo
kind: custom
category: management
description: Minimal interactive page.
content_type: html
content_html: |
  {{component:ks_theme_head}}<div class="ks-page">
    <div class="ks-card"><h2>Status</h2><p id="out" class="ks-muted">Loading…</p>
      <div class="ks-row"><button class="ks-btn-blue" onclick="load()">Refresh</button></div>
    </div>
  </div>
  <script>
  (function(){
    'use strict';
    function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    async function load(){
      try{
        var r = await window.KSPageSDK.runAction('get_status');
        document.getElementById('out').textContent = r.ok ? (r.stdout||'ok') : (r.error||r.stderr||'failed');
      }catch(e){ document.getElementById('out').textContent = String(e.message||e); }
    }
    window.load = load;
    if(window.KSPageSDK) load();
    else window.addEventListener('ks-page-sdk-ready', load, {once:true});
  })();
  </script>
icon_svg: <path d="M12 2L2 7l10 5 10-5-10-5z"/>
actions:
  - name: get_status
    type: shell
    command: uptime 2>&1; cat /etc/os-release 2>&1 | head -n 5
    timeout: 15
```

**Markdown** — save as `instance_pages/pages/hello.yaml`:

```yaml
name: Hello
slug: hello
kind: custom
category: documentation
description: Minimal working page.
content_type: markdown
content_markdown: |
  # Hello

  This is a **working** page.
icon_svg: <path d="M12 2L2 7l10 5 10-5-10-5z"/>
```
