-- 031_instance_install_action_id.sql
-- Track WHICH template action is currently in flight on an instance, so the
-- instance home-page "Actions" card can morph only the matching action's
-- button to a "Stop" button. install_kind='action' already distinguishes
-- "an action is running" from "the template's install workflow is running";
-- install_action_id names the specific action (the spec.actions[].id the
-- panel stored against InvokeActionHandler). Empty for the template install
-- workflow and after the workflow resolves.

ALTER TABLE instances ADD COLUMN IF NOT EXISTS install_action_id TEXT NOT NULL DEFAULT '';
