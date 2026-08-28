-- 036_mod_package.sql: KS Panel Mod packages (.kspm) are zip archives that
-- bundle a mod's manifest + frontend/backend/page code into a single
-- installable file. The panel stores the uploaded .kspm zip on disk under
-- <datadir>/mod-packages/<slug>.kspm and records its byte size on the mod row
-- so the admin UI can show "package: N KB" and so the download handler knows a
-- package file is present. Mods installed before this migration (Studio /
-- URL / JSON bodies that never carried a zip) keep package_size = 0; the
-- download handler synthesises a minimal .kspm from the stored manifest + spec
-- on demand, so every mod remains downloadable.
--
-- `package_size` is a plain INTEGER (bytes); 0 == no on-disk package zip
-- (synthesised on download). Adding the column is guarded at apply time by the
-- Go migration runner (see internal/db/db.go) so a re-launch is idempotent on
-- every dialect.

ALTER TABLE mods ADD COLUMN package_size INTEGER NOT NULL DEFAULT 0;
