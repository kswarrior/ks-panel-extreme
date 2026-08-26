-- 029_applications.sql: admin-curated bot / service templates (Discord,
-- WhatsApp, Telegram, Slack, custom) that users can install as their own
-- long-running workloads. Like Mods, an Application declares what it needs
-- (the list of "capability" rows the admin must explicitly approve), so
-- activation is refused until every grant is true. Unlike Mods — which run
-- inside the panel process as Goja scripts — Applications run as user-level
-- services, with the user's credentials / tokens stored as encrypted secrets
-- under each installation row.
--
-- The schema is intentionally close to mods/mod_permissions so the same
-- read-modify-write pattern (List/Get/SetGrants/Activate) drops in. A user
-- installation is its own row so revoking a user doesn't take their bots
-- with them; the application row is the catalog entry (admin-owned), the
-- installation row is the user-facing instance (user-owned).
--
--   applications
--     — catalog row (admin-authored). category is the well-known bot family
--       so the UI can render a default icon / colour; runtime hints the
--       panel which interpreter to launch on the edge (nodejs / python /
--       bash / custom). config_schema is the JSON list of fields the user
--       must fill in (label, type=text|secret|number|select, required,
--       default, options). PermissionsRequested is repeated on the JSON
--       spec for clients that only read catalog rows; the canonical
--       per-capability rows live in application_permissions (mirrors mods).
--
--   application_permissions
--     — the per-capability approval checklist the admin must tick before
--       activation. Each row is one requested capability at one access level;
--       granted=1 means admin approved it. Activation refuses to flip until
--       every row for the application has granted=1, identical to mods.
--
--   application_installations
--     — user-facing install. Each row is one bot one user has deployed:
--       owns a config_values blob (the secrets + non-secret settings the
--       user filled in) and a status field (running/stopped/error) the
--       runtime updates. owner_id is a panel user; on user delete the row
--       is removed (CASCADE) so we don't keep orphaned bots around.

CREATE TABLE IF NOT EXISTS applications (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name            TEXT    NOT NULL,
    slug VARCHAR(255)     NOT NULL  UNIQUE,
    category        TEXT    NOT NULL DEFAULT ('custom'),
    version         TEXT    NOT NULL DEFAULT ('1.0.0'),
    description     TEXT    NOT NULL DEFAULT (''),
    icon            TEXT    NOT NULL DEFAULT (''),
    runtime         TEXT    NOT NULL DEFAULT ('nodejs'),
    entrypoint      TEXT    NOT NULL DEFAULT (''),
    config_schema   TEXT    NOT NULL DEFAULT ('{}'),
    permissions     TEXT    NOT NULL DEFAULT ('[]'),
    env             TEXT    NOT NULL DEFAULT ('{}'),
    active          INTEGER NOT NULL DEFAULT 0,
    uploaded_by     BIGINT,
    source          TEXT    NOT NULL DEFAULT ('file'),
    source_url      TEXT    NOT NULL DEFAULT (''),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS application_permissions (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id  BIGINT NOT NULL,
    capability      TEXT    NOT NULL,
    access_level    TEXT    NOT NULL DEFAULT (''),
    granted         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_installations (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id  BIGINT NOT NULL,
    owner_id        BIGINT NOT NULL,
    name            TEXT    NOT NULL,
    config_values   TEXT    NOT NULL DEFAULT ('{}'),
    status          TEXT    NOT NULL DEFAULT ('stopped'),
    last_error      TEXT    NOT NULL DEFAULT (''),
    node_id         BIGINT NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id)       REFERENCES users(id)       ON DELETE CASCADE
);

CREATE INDEX idx_application_permissions_app   ON application_permissions(application_id);
CREATE INDEX idx_application_installations_app ON application_installations(application_id);
CREATE INDEX idx_application_installations_own ON application_installations(owner_id);

-- Seed the catalog permissions so the admin's role picks them up on launch.
INSERT IGNORE INTO permissions (`key`, description) VALUES
    ('MANAGE_APPLICATIONS', 'Manage the Applications catalog (upload, edit, activate/deactivate)'),
    ('APPLICATIONS_VIEW',   'View the Applications catalog'),
    ('APPLICATIONS_CREATE', 'Add a new Application to the catalog'),
    ('APPLICATIONS_EDIT',   'Edit an Application and approve its requested capabilities'),
    ('APPLICATIONS_DELETE', 'Remove an Application from the catalog'),
    ('USE_APPLICATIONS',    'Install and run user-level Applications (bots, services)');
