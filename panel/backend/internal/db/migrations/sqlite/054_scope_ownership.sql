-- 054_scope_ownership.sql: add owner_id to every regulatable resource
-- table so the per-area <AREA>_OWN / <AREA>_ALL scope keys (defined in
-- internal/permissions/keys.go and seeded in db.go) become functional.
--
-- Before this migration the OWN/ALL toggles on the Roles form were
-- decorative: the route gates accepted the per-action key, the role
-- editor persisted the scope key, but no list/create/update/delete
-- handler actually filtered rows by owner. Every authenticated caller
-- with VIEW_INSTANCES_VIEW / NODES_VIEW / etc. could see every row
-- regardless of the Own/All scope on their role — and any caller with
-- an action key could mutate any row. This migration closes the gap.
--
-- Tables touched (one ALTER per table, idempotent via the Go runner's
-- hasColumn guard + the Postgres `IF NOT EXISTS` clause in
-- 054_scope_ownership.postgres.sql):
--
--   nodes, templates, mods, applications, instance_pages, themes, roles
--
-- Existing rows get NULL owner_id (= orphan / unattributed) so the
-- migration is safe on a live install. ON DELETE SET NULL keeps a row
-- after its owner is deleted (history matters more than referential
-- cleanliness; same trade-off the 013_instance_owner migration made).
--
-- The indexes match the (owner_id) lookup the scope-aware list
-- endpoints issue; without them an Own-restricted role would fall back
-- to a full-table scan as the fleet grows.

ALTER TABLE nodes         ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE templates     ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE mods          ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE applications  ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE instance_pages ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE themes        ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE roles         ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS nodes_owner_idx           ON nodes(owner_id);
CREATE INDEX IF NOT EXISTS templates_owner_idx       ON templates(owner_id);
CREATE INDEX IF NOT EXISTS mods_owner_idx            ON mods(owner_id);
CREATE INDEX IF NOT EXISTS applications_owner_idx    ON applications(owner_id);
CREATE INDEX IF NOT EXISTS instance_pages_owner_idx  ON instance_pages(owner_id);
CREATE INDEX IF NOT EXISTS themes_owner_idx          ON themes(owner_id);
CREATE INDEX IF NOT EXISTS roles_owner_idx           ON roles(owner_id);
