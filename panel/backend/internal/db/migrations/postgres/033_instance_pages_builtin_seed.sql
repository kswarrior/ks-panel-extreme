-- 033_instance_pages_builtin_seed.sql: preload the instance_pages table with
-- the twelve built-in sidebar pages an instance panel always exposes. These
-- rows satisfy the Instance Pages admin list's "kind=builtin" filter and let
-- template authors import / browse the canonical built-in pages alongside any
-- custom ones they create.
--
-- Slug ↔ default label mapping mirrors web/src/lib/instancePages.ts
-- BUILTIN_PAGES:
--   .              -> Home
--   files          -> Files
--   network        -> Network
--   terminal       -> Terminal
--   env            -> Env
--   automation     -> Automation
--   processes      -> Processes
--   metrics        -> Metrics
--   ports          -> Ports
--   backups        -> Backups
--   audit          -> Audit
--   settings       -> Settings
--
-- kind='builtin' tells the Instance router (resolveInstanceNav /
-- slugToComponent) to render the matching built-in component; content_* stays
-- empty because the panel renders built-ins from React, not from this table.
-- INSERT ... ON CONFLICT DO NOTHING keeps an idempotent re-seed safe: if an
-- admin previously renamed one of these rows the existing record wins.
-- (PostgreSQL has no INSERT OR IGNORE; this is the equivalent form.)

INSERT INTO instance_pages (name, slug, kind, category, description, content_type, icon_svg)
VALUES
    ('Home',        '.',          'builtin', 'builtin', 'Home dashboard of the instance.',                    'markdown', ''),
    ('Files',       'files',      'builtin', 'builtin', 'File manager and editor.',                          'markdown', ''),
    ('Network',     'network',    'builtin', 'builtin', 'Network allocation and bindings.',                  'markdown', ''),
    ('Terminal',    'terminal',   'builtin', 'builtin', 'Interactive console / console_session.',             'markdown', ''),
    ('Env',         'env',        'builtin', 'builtin', 'Environment variables and startup configuration.', 'markdown', ''),
    ('Automation',  'automation', 'builtin', 'builtin', 'Scheduled tasks and automation rules.',             'markdown', ''),
    ('Processes',   'processes',  'builtin', 'builtin', 'Running processes inside the instance.',            'markdown', ''),
    ('Metrics',     'metrics',    'builtin', 'builtin', 'Resource usage metrics.',                            'markdown', ''),
    ('Ports',       'ports',      'builtin', 'builtin', 'Port allocations.',                                 'markdown', ''),
    ('Backups',     'backups',    'builtin', 'builtin', 'Backup snapshots.',                                 'markdown', ''),
    ('Audit',       'audit',      'builtin', 'builtin', 'Audit log of instance actions.',                    'markdown', ''),
    ('Settings',    'settings',   'builtin', 'builtin', 'Instance settings.',                                'markdown', '')
ON CONFLICT DO NOTHING;
