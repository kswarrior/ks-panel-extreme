-- 057_instance_page_configure.sql: instance pages gain a persisted
-- `configure` column. Configure vars are a JSON array of page-level
-- env-style variables ({name,label,description,default,user_viewable,
-- user_editable,required,rule,display,options,append,prepend,append_value})
-- authored in the Instance Page Studio's Configure tab (like the template
-- editor's Env Variables). Stored with the page definition so the Studio
-- can save/reload them and so linking a page to a template ships its
-- configure definitions into spec.pages for the runtime and for the
-- template editor to collect per-page values (Configure button).
-- Empty string == no configure vars.
--
-- The ALTER is applied via the runtime-guarded path in internal/db/db.go
-- (mirrors 049_instance_page_components.sql) so re-launches are idempotent
-- on every dialect.

ALTER TABLE instance_pages ADD COLUMN IF NOT EXISTS configure TEXT NOT NULL DEFAULT '';
