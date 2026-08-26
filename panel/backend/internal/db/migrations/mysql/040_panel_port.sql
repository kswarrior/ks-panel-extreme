-- 040_panel_port.sql: persist the last port the panel was launched on so a
-- fresh `./kspanel launch` (no --port flag) reuses the same port the operator
-- was already using. Without this, the reinstall script — which spawns the
-- new binary via `launch --port <n>` — could land on a different port than
-- what the admin dashboard expected after a binary swap.
--
-- Stored as a plain string in the existing settings KV (same shape as the
-- ddos settings in 039) so the migration is symmetric across all three
-- supported engines. The repo layer validates the value is an integer in
-- 1..65535 before accepting it; anything else is ignored and the launch
-- flag/env/defaults win.

INSERT IGNORE INTO settings (key, value) VALUES ('panel_port', '');
