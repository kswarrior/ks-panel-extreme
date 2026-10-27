# Instance Pages

Deep authoring: `instance_pages/GUIDE.md`, `instance_pages/README.md`. Backend embed: `pagelib`.

## Concept
Per-instance custom tabs authored as YAML or Studio. Content types: html, markdown, blocks, react.
Actions allow-list; components `{{component:name}}`; sub-pages; KSPageSDK; theme vars.

## Backend
Handlers: `instance_page_handler.go`, `instance_page_kv.go`, `instance_page_react.go`, guard. Repos:
`instance_page_repo.go`, `page_kv_repo.go`. Models in models. Migrations: 032, 033, 041, 046, 047, 048,
049, 056, 057, 075, 078. Permission: MANAGE_INSTANCE_PAGES umbrella + CRUD + scope.

## Frontend
`features/instance-pages/`: InstancePages, InstancePageDetail, InstancePageStudio, InstancePageStats,
InstancePageSchedules. Sub-editors: main page, sub-pages, components, actions, preview.

## Render
`shared/components/ui/CustomPageView.tsx` (iframe for html; host React for markdown/blocks/react).
`shared/lib/customPageSdk.ts` (`window.KSPageSDK`). `shared/utils/instancePages.ts`.

## Edge
`edge/backend/internal/pageaction/` executes allow-listed actions via panel `internal/edge/`.

## Lifecycle
Studio/author YAML → library table → link to template → snapshot into instance.config → render →
actions on edge via allow-list.

## Library sync
`rebuild.sh:sync_pagelib()` copies `instance_pages/` into `internal/pagelib/library/` (embed).
Read order: disk `pages/*.yaml` → disk legacy → embedded fallback.
