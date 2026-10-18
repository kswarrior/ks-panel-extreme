# Mods skill

Mods are admin-uploaded add-on packages that extend the panel (extra pages, tools, integrations). They install inactive and only activate after the admin approves every capability the mod requested. The sandboxed mod engine v2 runs them in a Goja VM with pre/post event hooks and a slot registry. Applications are the user-facing sibling: admin-curated bot/service templates that users install under their own account with the same capability-approval gate.

## Slot catalog (where mod UI can render)

Active mods that declare `slots[]` in their manifest render React components inside the admin shell. The panel mounts exactly these slot names — anything else stays dormant:

- `instance.detail.tabs` — top of an instance's panel (context `{instanceId}`)
- `instance.card.actions` — instance card action row (context `{instanceId}`)
- `dashboard.cards` — instances home page, above the grid
- `settings.general.below` — bottom of the Settings page
- `admin.mods.detail.after` — bottom of a mod's detail page (context `{modSlug}`)

A manifest slot is `{ "name": "<catalog name>", "component": "<registered name>", "props": { … } }`.

## Shipping a frontend bundle

Two ways: inline `uiBundleSource` (a JS string in the manifest — the Studio, built-in samples and JSON installs use this; capped at 1 MiB) or a file inside the `.kspm` zip at `uiBundle` (zip-relative path, default `frontend/bundle.js`). Inline source wins when both exist. The panel serves the bundle at `/api/mods/v1/assets/<slug>/<uiBundle>?v=<version>`, injects it as an ES module when the mod activates, and removes it on deactivation.

Bundles are plain scripts — no bundler required. The host exposes React on `window.React`, `window.ReactDOM`, `window.ReactDOMClient` and `window.ReactJSXRuntime` (alias `window.jsxRuntime`). Register each component by name:

```
(function () {
  var h = window.React.createElement;
  function Banner(p) { return h('div', null, p && p.text); }
  window.KS.registerComponent('instance.detail.tabs', 'Banner', Banner);
})();
```

With a bundler, keep react/react-dom external and map them to those globals (esbuild: `--format=esm --external:react --external:react-dom`). Re-registering the same name replaces the previous component, and a crashing component is isolated per slot so it never takes the page down.

A file-based dev example (manifest + `frontend/bundle.js`) lives at `panel/backend/mod_samples/hello-slot/` — zip that folder and upload it as a `.kspm`.

Assistant coverage is read-only here: there are no mod tools, so answer from this guide and walk the admin through the Mods page (upload → review capabilities → approve → activate). Never claim to install or activate a mod.
