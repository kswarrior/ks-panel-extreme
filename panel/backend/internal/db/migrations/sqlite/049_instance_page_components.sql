-- 049_instance_page_components.sql: instance pages gain a persisted
-- `components` column. Components are reusable UI blocks
-- ({name,type,description,content}) authored in the Instance Page Studio's
-- Components tab and referenced from page content with {{component:name}}.
-- Stored with the page definition so the Studio can save/reload them and so
-- linking a page to a template ships its components into spec.pages for the
-- runtime to substitute when rendering. Empty string == no components.
--
-- The ALTER is applied via the runtime-guarded path in internal/db/db.go
-- (mirrors 047_instance_page_sub_pages.sql) so re-launches are idempotent on
-- every dialect.

ALTER TABLE instance_pages ADD COLUMN components TEXT NOT NULL DEFAULT '';