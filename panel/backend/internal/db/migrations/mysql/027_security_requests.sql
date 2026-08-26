-- 027_security_requests.sql: Per-request security telemetry.
--
-- One row per HTTP request the panel serves (writes are async + best-effort
-- so a logging failure never blocks the response). This is the raw feed the
-- Security admin page (admin/security) aggregates into the metrics an
-- operator needs to monitor the panel under attack: total requests, RPS/RPM,
-- top IPs, blocked vs challenged, 4xx/5xx, login attempts, bandwidth, etc.
--
-- The dashboard / Security page never reads this table directly; it goes
-- through SecurityRepository.Snapshot() which folds the rows into the
-- headline counters + top-N lists in one pass.
--
-- `client_ip`      — best-effort originating IP (X-Forwarded-For first hop
--                     preferred, falling back to RemoteAddr). TEXT so IPv6
--                     isn't truncated.
-- `method`         — HTTP verb (GET/POST/...).
-- `path`           — request path (no query string). We intentionally do NOT
--                     log the query string to avoid leaking tokens / secrets
--                     that callers sometimes pass inline.
-- `status`         — HTTP response status code written by chi/handler.
-- `user_id`        — the authenticated user's id (NULL for anonymous
--                     requests, e.g. login probes).
-- `user_agent`     — raw User-Agent header, truncated at write-side so the
--                     column can't grow unbounded.
-- `country`        — best-effort country code resolved from the client IP
--                     (two-letter ISO code, '' when unknown). Populated by a
--                     lightweight GeoIP lookup when available; left empty on
--                     installs without a GeoIP database so the Countries
--                     widget just renders fewer buckets.
-- `blocked`        — 1 when the request was blocked by the panel's
--                     firewall/challenge layer, 0 otherwise. Set by the
--                     security middleware when it short-circuits a request
--                     (rate-limit trip, WAF rule, IP blocklist hit).
-- `challenged`     — 1 when the request was served a challenge / CAPTCHA
--                     (the user eventually passed or was rejected), 0
--                     otherwise. Separated from `blocked` so the panel can
--                     report "X challenges issued, Y of which were solved".
-- `is_api`         — 1 when the path is under /api/ (Admin/API surface),
--                     0 for the SPA + static assets.
-- `is_login`       — 1 when the request target is a login endpoint
--                     (/api/auth/login, /api/auth/switch-login) so the
--                     Failed Login Attempts tile can be derived cheaply
--                     (is_login=1 AND status in (401, 403)).
-- `bytes_sent`     — best-effort response body length in bytes (used for
--                     the Bandwidth Usage widget). Reported as 0 when the
--                     handler streamed without a Content-Length.
-- `duration_ms`    — wall-clock spend inside the handler, in ms. Powers the
--                     Average Response Time metric.

CREATE TABLE IF NOT EXISTS security_requests (
    id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    client_ip   VARCHAR(64) NOT NULL DEFAULT (''),
    method      TEXT    NOT NULL DEFAULT (''),
    path        TEXT    NOT NULL DEFAULT (''),
    status      INTEGER NOT NULL DEFAULT 0,
    user_id     BIGINT,
    user_agent  TEXT    NOT NULL DEFAULT (''),
    country     TEXT    NOT NULL DEFAULT (''),
    blocked     INTEGER NOT NULL DEFAULT 0,
    challenged  INTEGER NOT NULL DEFAULT 0,
    is_api      INTEGER NOT NULL DEFAULT 0,
    is_login    INTEGER NOT NULL DEFAULT 0,
    bytes_sent  INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX security_requests_created_idx ON security_requests(created_at);
CREATE INDEX security_requests_ip_idx     ON security_requests(client_ip);
CREATE INDEX security_requests_status_idx ON security_requests(status);
CREATE INDEX security_requests_login_idx ON security_requests(is_login, status);

-- Seed the panel-level security settings into the existing settings KV so the
-- Attack Status toggle persists across restarts. Keys:
--   security_under_attack — "0" (Normal) / "1" (Under Attack). Drives the
--                          middleware's decision to challenge every request.
--   security_block_unknown_ua — "0"/"1" — block requests from unknown UAs.

INSERT IGNORE INTO settings (`key`, value) VALUES ('security_under_attack', '0');
INSERT IGNORE INTO settings (`key`, value) VALUES ('security_block_unknown_ua', '0');
