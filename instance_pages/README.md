# Instance Pages Directory

This directory contains instance page definitions that can be imported into the panel.
The shipped page library that used to live in `pages/` was consolidated into the
panel's Instance Page Studio templates (`features/instance-pages/templates/pageStarters.ts`).
Files placed here (top level, or a `pages/` sub-directory) still override/add to the
library on the panel host.

## File Format

Each instance page is defined as a JSON file with the following structure:

```json
{
  "name": "Page Name",
  "slug": "page-slug",
  "kind": "custom",
  "category": "documentation",
  "description": "Page description",
  "content_type": "html|markdown|blocks",
  "content_html": "<div>HTML content</div>",
  "content_markdown": "# Markdown content",
  "content_blocks": "[{\"type\": \"heading\", \"value\": \"Title\"}]",
  "icon_svg": "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/>",
  "actions": "[{\"name\":\"list\",\"type\":\"shell\",\"command\":\"docker ps\"}]",
  "sub_pages": "[{\"path\":\"edit\",\"name\":\"Editor\",\"content_type\":\"html\"}]"
}
```

## Fields

- `name` (required): Human-readable name for the sidebar
- `slug` (required): URL-safe path segment (e.g., "getting-started"); the bare "." slug is reserved for the Home page rendered at the instance index route
- `kind` (optional): Only "custom" is accepted — the legacy "builtin" kind was removed (migration 046)
- `category` (optional): Grouping tag (e.g., "docs", "reference", "guides")
- `description` (optional): Page description
- `content_type` (required): "html", "markdown", or "blocks"
- `content_html` (required if content_type=html): HTML content
- `content_markdown` (required if content_type=markdown): Markdown content
- `content_blocks` (required if content_type=blocks): JSON array of block objects
- `icon_svg` (optional): Raw SVG inner markup for custom icon
- `actions` (optional): JSON array of saved executable actions (`{name, type, command/path/content, args, env, timeout, description}`). Pages execute ONLY these via `KSPageSDK.runAction(name)`; an action may opt in to caller-supplied arguments with `"open_args": true` — shell commands then substitute the validated runtime args into a `{{args}}` placeholder in the stored command.
- `sub_pages` / `pages` (optional): JSON array of nested sub-page definitions (`{path, name, content_type, content_*}`) reachable at `<slug>/<path>`

## Import Methods

1. **File Upload**: Upload a JSON file directly
2. **URL**: Import from a remote URL
3. **Studio**: Create/edit using the built-in Instance Page Studio
4. **Marketplace**: Browse and import from the KS Panel marketplace