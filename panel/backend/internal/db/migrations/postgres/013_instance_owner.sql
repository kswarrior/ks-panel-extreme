-- 013_instance_owner.sql: tie every instance to the user that owns it.
--
-- Existing rows get NULL owner_id (= orphan / unattributed). The admin
-- deploy form now picks the owner explicitly from a dropdown so future
-- deploys always carry a real user id. The user-facing Instances page
-- (/api/me/instances) filters by owner_id = callerID; admins keep using
-- /api/instances which returns every row across all owners.
--
-- ON DELETE SET NULL keeps the row even after the user is deleted
-- (history matters more than referential cleanliness for instances).

ALTER TABLE instances ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS instances_owner_idx ON instances(owner_id);
