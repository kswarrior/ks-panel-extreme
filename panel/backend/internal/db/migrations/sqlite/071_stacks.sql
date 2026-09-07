-- 071_stacks.sql: Stacks — full-stack isolated apps (dashboard OR tool).
-- One `stack` is one item like one `mod` is one item in Mods: own frontend
-- (spa dist | simple pages) + optional backend sidecar + own nav + own data.
-- Dashboard is only category='dashboard', not the system name.
--
--   stacks
--     — catalog row (admin-authored). frontend_theme_mode is panel|custom|none
--       and page_style is spa|simple (CHECK-gated at the DB layer so hostile
--       manifests fail even if Go validation is bypassed). manifest/spec are
--       opaque JSON pass-through (same contract as mods/themes).
--   stack_permissions — per-capability approval checklist, mirrors
--     mods/mod_permissions: granted=1 required on every row before activation.
--   stack_env — saved KEY rows (secret=1 encrypted via secretbox, masked on read).
--   stack_kv — namespaced key/value data (universal, all engines).
--   stack_tables — registry of shared-SQL tables (prefix st_<slug>_) for the
--     panel-native `shared` database mode + audit of what to dump on backup.
--   stack_ports — loopback port allocator (one row per active sidecar).
--
-- No TEXT DEFAULTs (MySQL rejects defaults on TEXT) and single-statement
-- lines only so regen.sh derives the postgres/mysql variants. TEXT timestamp
-- columns carry no default (the repo writes UTC strings, mirrors
-- 069_api_key_requests.sql); index lines are guarded at runtime in db.go via
-- the generic hasIndex path (mirrors 062/069).

CREATE TABLE IF NOT EXISTS stacks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    category        VARCHAR(32) NOT NULL DEFAULT 'dashboard',
    version         VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    description     TEXT NOT NULL,
    icon            VARCHAR(64) NOT NULL DEFAULT '',
    color           VARCHAR(16) NOT NULL DEFAULT '',
    runtime         VARCHAR(16) NOT NULL DEFAULT 'static',
    entrypoint      TEXT NOT NULL,
    manifest        TEXT NOT NULL,
    spec            TEXT NOT NULL,
    frontend_theme_mode VARCHAR(16) NOT NULL DEFAULT 'panel',
    page_style      VARCHAR(16) NOT NULL DEFAULT 'spa',
    active          INTEGER NOT NULL DEFAULT 0,
    uploaded_by     INTEGER,
    owner_id        INTEGER NOT NULL DEFAULT 0,
    source          VARCHAR(16) NOT NULL DEFAULT 'file',
    source_url      TEXT NOT NULL,
    package_size    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (runtime IN ('static','nodejs','python')),
    CHECK (frontend_theme_mode IN ('panel','custom','none')),
    CHECK (page_style IN ('spa','simple'))
);

CREATE TABLE IF NOT EXISTS stack_permissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    stack_id        INTEGER NOT NULL,
    capability      TEXT NOT NULL,
    access_level    TEXT NOT NULL,
    granted         INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stack_env (
    stack_id        INTEGER NOT NULL,
    env_key         TEXT NOT NULL,
    env_value       TEXT NOT NULL,
    secret          INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (stack_id, env_key),
    FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stack_kv (
    stack_slug      VARCHAR(64) NOT NULL,
    kv_key          TEXT NOT NULL,
    kv_value        TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (stack_slug, kv_key)
);

CREATE TABLE IF NOT EXISTS stack_tables (
    stack_slug      VARCHAR(64) NOT NULL,
    table_name      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    PRIMARY KEY (stack_slug, table_name)
);

CREATE TABLE IF NOT EXISTS stack_ports (
    stack_slug      VARCHAR(64) NOT NULL PRIMARY KEY,
    port            INTEGER NOT NULL UNIQUE,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stack_permissions_stack ON stack_permissions(stack_id);
CREATE INDEX IF NOT EXISTS idx_stack_env_stack ON stack_env(stack_id);
CREATE INDEX IF NOT EXISTS idx_stack_kv_slug ON stack_kv(stack_slug);
CREATE INDEX IF NOT EXISTS idx_stacks_slug ON stacks(slug);
CREATE INDEX IF NOT EXISTS idx_stacks_active ON stacks(active);

-- Seed the catalog permissions so the admin role picks them up on launch.
INSERT OR IGNORE INTO permissions (key, description) VALUES
    ('MANAGE_STACKS', 'Manage the Stacks catalog (upload, edit, activate/deactivate)'),
    ('STACKS_VIEW',   'View the Stacks catalog'),
    ('STACKS_CREATE', 'Upload a new Stack package'),
    ('STACKS_EDIT',   'Edit a Stack and approve its requested capabilities'),
    ('STACKS_DELETE', 'Remove a Stack package'),
    ('STACKS_OWN',    'Stacks — only own stacks (visibility scoped to owned)'),
    ('STACKS_ALL',    'Stacks — any stack (full admin over all stacks)');
