-- 039_ddos_security.sql: DDoS auto-stop configuration persisted
-- in the existing settings KV so the panel can react without a restart.
--
-- Keys:
--   security_ddos_auto_stop_enabled — "1" to enable auto-stop on DDoS detection.
--   security_ddos_stop_minutes      — how many minutes to stay stopped (default 5).
--   security_ddos_stop_count        — how many times auto-stop has triggered (runtime counter).
--   security_ddos_cooldown_until    — RFC3339 timestamp when cooldown expires (runtime).

INSERT INTO settings (key, value) VALUES ('security_ddos_auto_stop_enabled', '0') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('security_ddos_stop_minutes', '5') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('security_ddos_stop_count', '0') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('security_ddos_cooldown_until', '') ON CONFLICT DO NOTHING;