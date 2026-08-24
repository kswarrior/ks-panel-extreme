-- 047_instance_page_sub_pages.sql: instance pages gain a persisted
-- `sub_pages` column. Sub-pages are a JSON array of additional page
-- definitions ({path,name,content_type,content_html,content_markdown,
-- content_blocks}) that ship with the parent page: linking/importing the
-- parent expands each entry into a spec.pages row with slug
-- "<parent-slug>/<path>" (e.g. files/edit). Empty string == no sub-pages.
--
-- The ALTER is applied via the runtime-guarded path in internal/db/db.go
-- (mirrors 041_instance_page_actions.sql) so re-launches are idempotent on
-- every dialect.

ALTER TABLE instance_pages ADD COLUMN sub_pages TEXT NOT NULL DEFAULT '';
