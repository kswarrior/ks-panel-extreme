# Instance Pages Directory

This directory contains instance page definitions that can be imported into the panel.

Canonical layout:

- `pages/*.yaml` — the shipped page library (one YAML file per page).
- `marketplace.json` — the marketplace catalog whose `download_url` entries
  point at `https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/instance_pages/pages/<file>.yaml`.
- `README.md` — this file.

A legacy `pages/*.json` (or top-level `*.json`) file next to this README is
still accepted everywhere — library listing, file/URL/marketplace/local
import, and the embedded binary fallback — but new pages belong in `pages/`
as YAML. `rebuild.sh` embeds `marketplace.json` + `pages/*.yaml` (plus any
legacy JSON) into the panel binary, and the backend (`internal/pagelib`)
reads `instance_pages/pages/<name>` first, then the legacy top-level
`instance_pages/<name>`, then the embedded copy. When a `*.yaml` and a
`*.json` share a stem, the YAML wins.

## File Format (YAML, canonical)

Each instance page is one YAML document. Multiline content uses `|`
literal blocks (raw HTML/JS/markdown, no escaping) and
`actions`/`sub_pages`/`components`/`configure` are native YAML lists:

```yaml
name: Page Name
slug: page-slug
kind: custom
category: documentation
description: Page description
content_type: html # html|markdown|blocks|react
content_html: |
  <div>HTML content, verbatim — no \" escaping</div>
icon_svg: <path d="M12 2L2 7l10 5 10-5-10-5z"/>
actions:
  - name: list
    type: shell
    command: docker ps
sub_pages:
  - path: edit
    name: Editor
    content_type: html
    content_html: |
      <div>…</div>
```

Empty placeholders (`""`, `[]`) are omitted — the backend defaults them.
Comments (`# …`) are allowed. `tools/pages_json_to_yaml.py` converts legacy
JSON library files to this format and verifies a lossless round-trip.

## Fields

- `name` (required): Human-readable name for the sidebar
- `slug` (required): URL-safe path segment (e.g., "getting-started"); the bare "." slug is reserved for the Home page rendered at the instance index route
- `kind` (optional): Only "custom" is accepted — the legacy "builtin" kind was removed (migration 046)
- `category` (optional): Grouping tag (e.g., "docs", "reference", "guides")
- `description` (optional): Page description
- `content_type` (required): "html", "markdown", "blocks", or "react"
- `content_html` (required if content_type=html): HTML content
- `content_markdown` (required if content_type=markdown): Markdown content
- `content_blocks` (required if content_type=blocks): list of block objects (native YAML list, or a JSON array string)
- `source_tsx` (required if content_type=react): author React JS source (`function Page() { … }` + `return Page;`, `React.createElement`, no JSX in v1); click **Build** in the Studio to validate it into the executable bundle (`bundle_js`)
- `icon_svg` (optional): Raw SVG inner markup for custom icon
- `actions` (optional): saved executable actions (`{name, type, command/path/content, args, env, timeout, description}`). Pages execute ONLY these via `KSPageSDK.runAction(name)`; an action may opt in to caller-supplied arguments with `"open_args": true` — shell commands then substitute the validated runtime args into a `{{args}}` placeholder in the stored command.
- `sub_pages` / `pages` (optional): nested sub-page definitions (`{path, name, content_type, content_*, source_tsx, bundle_css}` — sub-pages support `react` too) reachable at `<slug>/<path>`

## Import Methods

1. **File Upload**: Upload a YAML (or legacy JSON) file directly
2. **URL**: Import from a remote URL
3. **Studio**: Create/edit using the built-in Instance Page Studio
4. **Marketplace**: Browse and import from the KS Panel marketplace
