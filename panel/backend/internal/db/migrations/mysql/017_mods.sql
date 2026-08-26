-- 017_mods.sql: Mods — admin-installed add-on packages that extend the panel.
--
-- A Mod is a self-contained customization bundle the admin uploads through the
-- admin panel: it can register new pages, ship tools, add integrations, etc. It
-- is fully customizable (the admin can edit its manifest / spec in place) while
-- staying SAFE: a mod never silently runs. Activation is gated by an explicit,
-- per-capability grant — the mod's manifest declares which sensitive resources
-- it wants (database access, shell/terminal access, container/VM control, …)
-- and with what level (read-only vs read+write). The panel refuses to activate
-- the mod until the admin has individually approved every requested capability.
-- This mirrors the "showing how many [permissions] need to activate this mod"
-- requirement: the activation endpoint returns a checklist of pending grants,
-- and only flips the mod to active once each one is explicitly approved.
--
-- `manifest` holds the opaque JSON the mod ships: { name, version, description,
-- pages[], permissionsRequested[], spec }. The backend inspects
-- permissionsRequested (a fixed, well-known set of capability codes so we can
-- validate them) but stores the rest verbatim — same pass-through philosophy as
-- the themes table, so the frontend can enrich the manifest later without a
-- schema change.
--
-- `active` is a single flag (0/1). Deactivating doesn't drop the mod; the
-- admin can re-grant + reactivate later. `uploaded_by` records the admin who
-- first uploaded it for audit (ON DELETE SET NULL so an admin-deleted user
-- doesn't orphan their mods).

CREATE TABLE IF NOT EXISTS mods (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name         TEXT    NOT NULL,                  -- display name (from manifest)
    slug VARCHAR(255)     NOT NULL  UNIQUE,           -- stable unique id used in routes
    version      TEXT    NOT NULL DEFAULT '',
    description  TEXT    NOT NULL DEFAULT '',
    manifest     TEXT    NOT NULL,                  -- full JSON manifest (opaque except permissionsRequested)
    spec         TEXT    NOT NULL DEFAULT '{}',     -- optional editable spec blob (e.g. page definitions)
    active       INTEGER NOT NULL DEFAULT 0,        -- 0 = inactive (installed only), 1 = active
    uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX mods_active_idx ON mods(active);
CREATE INDEX mods_uploaded_by_idx ON mods(uploaded_by);

-- mod_permissions is the REQUESTED capability set the manifest advertised, plus
-- the admin's APPROVAL state for each. A row exists for every capability a mod
-- requested; `granted = 1` means the admin has explicitly approved that
-- capability. Activation requires every row for the mod to be granted = 1.
--
-- `capability` is a fixed capability code (see model constants), e.g.
--   db.read_only     - database read access
--   db.read_write    - database read+write access
--   terminal         - shell / terminal access
--   vm.control       - start/stop KVM instances
--   container.control- start/stop docker/lxd/multipass
--   filesystem       - read panel/container files
-- `access_level` echoes the level the request asked for (read_only / read_write)
-- so the activation modal can show it next to the capability.
CREATE TABLE IF NOT EXISTS mod_permissions (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    mod_id       INTEGER NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
    capability   TEXT    NOT NULL,                  -- capability code
    access_level TEXT    NOT NULL DEFAULT '',        -- read_only / read_write / ''
    granted      INTEGER NOT NULL DEFAULT 0,         -- 0 = pending approval, 1 = approved
    UNIQUE (mod_id, capability)
);

CREATE INDEX mod_permissions_mod_idx ON mod_permissions(mod_id);
