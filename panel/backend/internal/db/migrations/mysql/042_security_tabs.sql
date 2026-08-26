-- 042_security_tabs.sql: Security page tab reorganisation. Seeds the new
-- settings-KV keys for the Sessions and Firewall tabs with safe defaults
-- that mirror the previous hardcoded behaviour, so a fresh install behaves
-- exactly like the pre-reorganisation builds:
--
-- Firewall / WAF (Firewall tab):
--   security_ip_allowlist            — CSV of IPs/CIDRs bypassing per-IP rate limit.
--   security_ip_denylist             — CSV of IPs/CIDRs hard-rejected with 403.
--   security_max_body_size_mb        — request body cap (was hardcoded 10 MB).
--   security_allowed_http_methods    — CSV method allowlist ("" = all allowed).
--   security_block_suspicious_paths  — block scanner/probe paths (off by default).
--
-- Sessions (Sessions tab):
--   security_session_lifetime_minutes     — absolute session lifetime (was 8h).
--   security_session_idle_timeout_minutes — idle eviction window (was 24h).
--   security_session_max_per_user         — concurrent sessions per user (0 = unlimited).

INSERT IGNORE INTO settings (key, value) VALUES ('security_ip_allowlist', '');
INSERT IGNORE INTO settings (key, value) VALUES ('security_ip_denylist', '');
INSERT IGNORE INTO settings (key, value) VALUES ('security_max_body_size_mb', '10');
INSERT IGNORE INTO settings (key, value) VALUES ('security_allowed_http_methods', '');
INSERT IGNORE INTO settings (key, value) VALUES ('security_block_suspicious_paths', '0');
INSERT IGNORE INTO settings (key, value) VALUES ('security_session_lifetime_minutes', '480');
INSERT IGNORE INTO settings (key, value) VALUES ('security_session_idle_timeout_minutes', '1440');
INSERT IGNORE INTO settings (key, value) VALUES ('security_session_max_per_user', '0');
