-- 074_automation_steps.sql: multi-step automation plans + timeout ceiling notes.
--
-- Jobs gain an optional ordered plan:
--
--   steps         TEXT (nullable, JSON array, NULL/'' = legacy single-shot)
--
-- Each element is {name, kind, command, payload, if, timeout_sec} where kind
-- reuses shell|power|action, payload carries the power op or action ID, and
-- if is success|failure|always (GitHub-Actions style gating). The executor
-- (automation_exec.go) folds aliases on read; per-step shape is enforced in
-- the repo/handler layer, not here.
--
-- NULL (not '[]') keeps the file MySQL-safe up front (regen.sh check: no
-- TEXT DEFAULT) and preserves the legacy distinction: NULL = created
-- before steps existed = single-shot. The Go runner guards the ALTER
-- individually (see db.go 074 case) so reruns converge on every engine.
-- Postgres derives ADD COLUMN IF NOT EXISTS via regen.sh.

ALTER TABLE instance_automation ADD COLUMN IF NOT EXISTS steps TEXT;
