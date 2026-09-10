-- 077_stack_serve_port.sql: panel-opened per-stack serve port + toggles.
--
-- Besides the /<root> path mount (072), an active stack may now also be
-- served at the origin root of a dedicated port the PANEL opens itself:
-- e.g. serve_port 6901 renders the whole dash app at localhost:6901/.
-- The upstream is resolved exactly like the path mount (proxy_port for
-- loopback, remote_address + TLS flags for remote, migration 072/076).
--
--   serve_port   INTEGER NOT NULL DEFAULT 0 — panel listener port
--                                           (0 = port serving off).
--   serve_auth   0/1 — gate the port behind the panel login (default ON:
--                      unauthenticated browsers bounce to the panel login
--                      page, then land on the dash).
--   serve_theme  0/1 — share the panel theme with the dash, read-only
--                      (default ON): the proxy stamps X-Panel-Theme(-Name)
--                      and the dash applies it only when its own config
--                      enables theme support.
--
-- INTEGER-only columns keep the file MySQL-safe up front (mirrors
-- 072_stack_proxy.sql). Uniqueness of a non-zero serve port is enforced
-- in the repo/handler layer (409 on clash), not here: a UNIQUE index
-- would reject the shared 0 default for unconfigured stacks on MySQL.

ALTER TABLE stacks ADD COLUMN serve_port INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stacks ADD COLUMN serve_auth INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stacks ADD COLUMN serve_theme INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_stacks_serve_port ON stacks(serve_port);
