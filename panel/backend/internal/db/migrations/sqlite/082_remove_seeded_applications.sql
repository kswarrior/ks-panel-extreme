-- 082_remove_seeded_applications.sql: remove the pre-installed application
-- catalog shipped by older builds.
--
-- Older panels called db.go SeedDefaultApplications on every launch, seeding
-- five inactive catalog rows: discord-bot, whatsapp-bot, telegram-bot,
-- slack-bot, custom-bot. That seeder is gone; this statement deletes the
-- already-installed rows so an upgraded install also ends up with an empty
-- Applications catalog.
--
-- The `uploaded_by IS NULL AND owner_id IS NULL` guard is deliberate. The
-- runner replays every migration on each launch (there is no applied-
-- migrations ledger), so this DELETE must stay harmless on re-runs: seeded
-- rows were inserted without an uploader/owner, while any app created or
-- imported through the API/Studio carries uploaded_by/owner_id, so a
-- user-created application that happens to reuse one of those slugs is never
-- touched. Deleting a row cascades to application_permissions and
-- application_runs (FK ON DELETE CASCADE).

DELETE FROM applications
WHERE slug IN ('discord-bot', 'whatsapp-bot', 'telegram-bot', 'slack-bot', 'custom-bot')
  AND uploaded_by IS NULL
  AND owner_id IS NULL;
