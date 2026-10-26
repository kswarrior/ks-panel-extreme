# Mods skill

Mods are admin-uploaded add-ons that extend the panel (extra pages, tools, integrations). They install inactive and only activate after the admin approves every capability requested. Engine v2 runs them in a Goja VM (hooks, slots, settings). v3 adds `requires`/`provides`/`conflicts`, metadata, topo boot; upgrade inactive mods.

## Slot catalog (where mod UI can render)

Active mods that declare `slots[]` in their manifest render React components inside the admin shell. The panel mounts exactly these slot names — anything else stays dormant:

- `instance.detail.tabs` — top of an instance's panel (context `{instanceId}`)
- `instance.card.actions` — instance card action row (context `{instanceId}`)
- `dashboard.cards` — instances home page, above the grid
- `settings.general.below` — bottom of the Settings page
- `admin.mods.detail.after` — bottom of a mod's detail page (context `{modSlug}`)
- `mod.screen` — full-screen admin page at `/mods/view/<slug>/<path>`, context `{slug, path}`; declare `props.title` for a Sidebar entry under "Mods" (optional `icon`, `nav: false` to hide, `order` to sort)

A manifest slot is `{ "name": "<catalog name>", "component": "<registered name>", "props": { … } }`.

## Shipping a frontend bundle

Two ways: inline `uiBundleSource` (a JS string in the manifest — Studio/samples/JSON installs; capped at 1 MiB) or a file in the `.kspm` zip at `uiBundle` (default `frontend/bundle.js`); inline wins. The panel serves it at `/api/mods/v1/assets/<slug>/<uiBundle>?v=<version>` and injects it as an ES module while the mod is active.

Bundles are plain scripts — no bundler required. The host exposes React on `window.React`, `window.ReactDOM`, `window.ReactDOMClient` and `window.ReactJSXRuntime` (alias `window.jsxRuntime`). Register each component by name:

```
(function () {
  var h = window.React.createElement;
  function Banner(p) { return h('div', null, p && p.text); }
  window.KS.registerComponent('instance.detail.tabs', 'Banner', Banner);
})();
```

With a bundler, keep react/react-dom external and map them to those globals (esbuild: `--format=esm --external:react --external:react-dom`). Re-registering a name replaces the component; a crashing component is isolated per slot. A file-based dev example lives at `panel/backend/mod_samples/hello-slot/` — zip it and upload as a `.kspm`.

## Typed settings (ks.settings)

A mod declares `settings: [{key, type, label, options, default, description}]` in its manifest (`key` is `[a-z0-9_]{1,64}`; types `text|password|number|toggle|select`). The admin edits values on the mod's detail page; the script reads/writes them at runtime via `ks.settings.get(key)` and `ks.settings.set(key, value)` (string form, `""` clears, returns `true/false`). Password values are write-only: sealed AES-256-GCM at rest, never returned by the API (only `is_set`), revealed to the mod only.

Assistant coverage is read-only here: there are no mod tools, so answer from this guide and walk the admin through the Mods page (upload → review capabilities → approve → activate). Never claim to install or activate a mod.
