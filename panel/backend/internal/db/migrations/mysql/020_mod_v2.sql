-- 020_mod_v2.sql: KS Panel Mod Engine v2 runtime tables.
--
-- v2 evolves the static v1 manifest mod system into an event-driven, sandboxed
-- plugin engine: active mods run an embedded JS backend script inside a Goja
-- VM, subscribe to a host event bus, and persist per-mod data in a namespaced
-- key-value store. See internal/modengine/*.
--
-- Migration notes:
--   * The v1 `mods` / `mod_permissions` tables (017_mods.sql) are NOT touched.
--     v1 manifests keep working unchanged; v2 fields are optional and live
--     inside the opaque `manifest` JSON blob, so no destructive ALTER is
--     needed on `mods` itself.
--   * We add an optional `engine_version` column on `mods` so the runtime can
--     cheaply know which engine a row is built for without re-parsing its
--     manifest JSON on every read. SQLite has no ADD COLUMN IF NOT EXISTS, so
--     the panel guards this ALTER at apply time (see internal/db/db.go).
--   * `mod_storage` is the namespaced key-value store each active mod reads /
--     writes through the Goja `ks.storage` binding. Scope is (mod_slug, key);
--     the mod's own slug namespaces its keys so one mod cannot touch another's
--     storage. FK ON DELETE CASCADE keeps the store tidy when a mod is removed.


CREATE TABLE IF NOT EXISTS mod_storage (
    mod_slug   VARCHAR(255) NOT NULL,
    `key`      TEXT    NOT NULL,
    value      TEXT    NOT NULL DEFAULT ('{}'),   -- JSON value blob
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mod_slug, `key`),
    FOREIGN KEY (mod_slug) REFERENCES mods(slug) ON DELETE CASCADE
);

CREATE INDEX mod_storage_mod_idx ON mod_storage(mod_slug);
