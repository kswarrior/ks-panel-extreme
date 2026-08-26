-- 027_mod_source.sql: track where a mod came from (file upload, URL fetch,
-- Studio authoring, etc.) so the Mods admin list + audit timeline can show
-- provenance without parsing the manifest JSON.
--
-- `source` is a short machine-readable tag ("file" | "url" | "studio" | "json");
-- `source_url` is only populated when source = 'url' and records the URL the
-- panel fetched the manifest from so a re-install (or audit drill-down) can
-- tie the row back to the origin. Both columns default to the legacy behaviour
-- (source='file', source_url='') so existing rows don't need to be touched.

ALTER TABLE mods ADD COLUMN source     TEXT    NOT NULL DEFAULT ('file');
ALTER TABLE mods ADD COLUMN source_url TEXT    NOT NULL DEFAULT ('');
