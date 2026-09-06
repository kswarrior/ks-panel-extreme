# Instance pages skill

Instance pages are reusable page definitions (docs, dashboards, config UIs) authored in the Instance Page Studio and linked into templates and instances. Only `kind: "custom"` exists (legacy builtins were purged). Each page has a name, a URL slug (auto-derived from the name when omitted), a description, and a body as markdown (preferred) or raw HTML. A full authoring manual with every field, action, component and validation rule lives in the repo at instance_pages/GUIDE.md.

## Playbooks

- Browse: `list_instance_pages` (id, name, slug), then `get_instance_page` for description and content type.
- Create: `create_instance_page` with name plus `content_markdown` or `content_html` (one is required). Needs INSTANCE_PAGES_CREATE.
- Edit: `edit_instance_page` with page_id plus any of name, description, content_markdown, content_html. The slug stays stable so linked instances don't break. Needs INSTANCE_PAGES_EDIT.
- Delete: `delete_instance_page` (irreversible). Needs INSTANCE_PAGES_DELETE.

Never invent page IDs — list first. Every write needs AI Chat Writes and returns a confirmation ticket: summarise and ask for approval.
