-- 072_stack_proxy.sql: per-stack Go-app reverse proxy config.
--
-- Two admin-managed columns on the catalog row so the panel can serve an
-- externally-run stack app (a complete Go program the operator runs
-- separately, e.g. a dashboard on 127.0.0.1:6600) under a panel-owned path:
--
--   proxy_port      INTEGER NOT NULL DEFAULT 0  -- loopback TCP port of the
--                                              -- stack app (0 = proxy off).
--   proxy_root_url  VARCHAR(64) NOT NULL DEFAULT ''  -- first path segment
--                                              -- the panel serves the app
--                                              -- at, e.g. 'dash' floats the
--                                              -- app at /dash/* ("" = off).
--
-- The Go runner in db.go guards each ALTER individually — SQLite/MySQL have
-- no ADD COLUMN IF NOT EXISTS — so one ALTER per column keeps a
-- partially-applied migration convergent (mirrors 059_template_icon_color).
-- VARCHAR (not TEXT) with a string DEFAULT keeps the file MySQL-safe up
-- front (regen.sh check: no TEXT DEFAULT, no TEXT UNIQUE). Uniqueness of a
-- non-empty root is enforced in the repo/handler layer (409 on clash), not
-- here: a UNIQUE index would reject the shared '' default for
-- unconfigured stacks on MySQL.

ALTER TABLE stacks ADD COLUMN IF NOT EXISTS proxy_port INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS proxy_root_url VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_stacks_proxy_root ON stacks(proxy_root_url);
