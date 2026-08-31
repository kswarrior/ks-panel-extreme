-- 048_instance_page_type.sql: instance pages gain a persisted `page_type`
-- column (API/JSON key: "type"). It classifies the page flavor — dashboard,
-- status, docs, admin-panel, widget, … — mirroring the Category/Type tag
-- pickers the template editor offers. Free-form string; empty == unset.
--
-- The ALTER is applied via the runtime-guarded path in internal/db/db.go
-- (mirrors 047_instance_page_sub_pages.sql) so re-launches are idempotent on
-- every dialect.

ALTER TABLE instance_pages ADD COLUMN IF NOT EXISTS page_type TEXT NOT NULL DEFAULT '';
