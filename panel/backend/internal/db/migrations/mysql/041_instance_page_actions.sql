-- 041_instance_page_actions.sql: instance pages gain a persisted `actions`
-- column. Actions are a JSON array of executable page actions (shell, file
-- ops, docker/kvm/lxd) authored in the Instance Page Studio and stored with
-- the page definition so the Studio can save/reload them and so linking a
-- page to a template ships its actions into spec.pages for the runtime to
-- render/run. Empty string == no actions defined.
--
-- The ALTER is applied via the runtime-guarded path in internal/db/db.go
-- (mirrors 036_mod_package.sql) so re-launches are idempotent on every
-- dialect.

ALTER TABLE instance_pages ADD COLUMN actions TEXT NOT NULL DEFAULT '';
