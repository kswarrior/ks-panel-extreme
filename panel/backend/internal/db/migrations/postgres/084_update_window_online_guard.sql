-- 084_update_window_online_guard.sql: gate scheduled updates on live panel
-- users, so a maintenance window can additionally require that nobody (or
-- fewer than N users) is currently online.
--
--   require_offline  0 = ignore live users, 1 = run only when zero distinct
--                    users have an active panel session (recently used).
--   max_online_users 0 = no limit, N > 0 = run only when fewer than N
--                    distinct users are online.
--
-- Both guards are evaluated by the scheduler at fire time; a skip is
-- audit-logged and the row is re-armed exactly like the maintenance-window
-- guard. The online count comes from the in-memory session manager.

ALTER TABLE update_windows ADD COLUMN IF NOT EXISTS require_offline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE update_windows ADD COLUMN IF NOT EXISTS max_online_users INTEGER NOT NULL DEFAULT 0;
