-- 073_automation_job_types.sql: typed automation jobs (shell / power / action).
--
-- Automation jobs used to be shell-only (one command run via /bin/sh -c).
-- Two new kinds join it:
--
--   kind          VARCHAR(16) NOT NULL DEFAULT 'shell'  -- 'shell' | 'power' | 'action'
--   payload       VARCHAR(128) NOT NULL DEFAULT ''      -- power op
--                                                      -- (start|stop|restart|kill)
--                                                      -- or template action ID
--                                                      -- ('' for shell jobs,
--                                                      -- whose command column
--                                                      -- keeps the script).
--
-- Existing rows keep kind='shell' so behaviour is backward compatible.
-- VARCHAR (not TEXT) with string DEFAULTs keeps the file MySQL-safe up
-- front (regen.sh check: no TEXT DEFAULT, no TEXT UNIQUE). Per-kind shape
-- (power op allow-list, action-ID presence) is enforced in the repo/handler
-- layer, not here.
--
-- The Go runner in db.go guards each ALTER individually — SQLite/MySQL have
-- no ADD COLUMN IF NOT EXISTS — so one ALTER per column keeps a
-- partially-applied migration convergent (mirrors 072_stack_proxy).

ALTER TABLE instance_automation ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'shell';
ALTER TABLE instance_automation ADD COLUMN IF NOT EXISTS payload VARCHAR(128) NOT NULL DEFAULT '';
