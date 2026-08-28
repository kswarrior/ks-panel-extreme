-- 030_instance_install_kind.sql
-- Track whether the in-flight install workflow is the original template
-- "install" workflow or an "action" workflow (e.g. user-invoked "Start
-- Java" from the home-page Actions card), and whether the action's
-- container should be auto-stopped once the action's foreground process
-- exits.
--
-- The install sweep loop reads these two columns on every "done"
-- transition to decide what to do with the container:
--   install_kind = ''      and install_auto_stop = 0/1
--     → install workflow done; stop the container regardless of
--       install_auto_stop (install-workflow-done-always-stops is the
--       new contract the user asked for), then set status='stopped'.
--   install_kind = 'action' and install_auto_stop = 1
--     → action's foreground process exited; stop the container (the
--       action declared auto_stop_on_exit), set status='stopped'.
--   install_kind = 'action' and install_auto_stop = 0
--     → action's foreground process exited; leave the container
--       running (the action did NOT request auto-stop), set status
--       back to 'running'.

ALTER TABLE instances ADD COLUMN IF NOT EXISTS install_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE instances ADD COLUMN IF NOT EXISTS install_auto_stop INTEGER NOT NULL DEFAULT 0;
