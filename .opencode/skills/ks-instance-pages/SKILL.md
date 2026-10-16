---
name: ks-instance-pages
description: Use when creating or editing instance pages - instance_pages/pages/*.yaml, marketplace.json, page actions, KSPageSDK usage, or the pagelib embed. Covers the mandatory authoring docs, content types, theme head, limits, lint, and rebuild sync.
---

# Instance Pages (YAML system)

One YAML file per page at `instance_pages/pages/<slug>.yaml`. Pipeline: YAML → Studio import or `rebuild.sh:sync_pagelib()` embed → library row → linked into `template.spec.pages[]` → snapshotted into `instance.config` → rendered by `CustomPageView` with `window.KSPageSDK`. Empty by default: nothing renders until linked to a template and redeployed.

## MANDATORY reads before authoring

1. `instance_pages/skill.md` — AI builder skill: skeleton, hard rules, SDK cookbook, actions cookbook, ship checklist.
2. `instance_pages/GUIDE.md` — exhaustive manual.
3. `instance_pages/README.md` — short format reference.
4. Examples: `pages/ports.yaml` (best HTML), `pages/react-dashboard.yaml` (best React), `pages/files.yaml` (sub-page + configure).

## Non-negotiables

- `kind: custom` (or omitted; `builtin` is rejected), `name`, `slug`, `content_type` + the matching `content_*` field are required.
- Every `content_html` (main AND sub-pages) starts with `{{component:ks_theme_head}}<div class="ks-page">`. Use `ks-*` classes and `var(--ks-*)` tokens only; no hardcoded dark colors.
- Interactive page (buttons/inputs/polling/fetches) → `html` or `react`; never `markdown`.
- Browser can only run actions declared in `actions:`; payload must match the stored definition. User input only via `open_args: true` + `{{args}}` (≤4 args, ≤200 chars, charset `a-zA-Z0-9 ._/ :@+=,-`).
- Never invent SDK methods, endpoints or URL shapes — only what `instance_pages/skill.md` §6 lists exists.
- Slugs unique; `sub_pages[].path` lowercase `^[a-z0-9_-]+$`; `components[].name` `^[A-Za-z0-9_][A-Za-z0-9_-]*$`; limits (1 MiB content, 64 KiB actions, 512 KiB sub_pages/components/source_tsx, 20 sub-pages, 50 components).

## Verify before shipping

```bash
python3 tools/pages_lint.py --strict    # repo root; parses YAML, checks caps, react denylist, slug/icon uniqueness, marketplace parity
bash rebuild.sh                          # syncs marketplace.json + pages/*.yaml into pagelib/library (go:embed)
```

Runtime: Studio → Preview (bind an instance → Test actions) → link to template (`POST /:id/link {template_ids}`) → deploy → visit `/instances/<id>/<slug>` and sub-routes.

Public pages: add a `marketplace.json` entry with `download_url` pointing at the raw GitHub URL of the YAML (see `instance_pages/skill.md` §11 for the exact JSON shape).
