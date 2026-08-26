-- 012_activity_logs.sql: Activity / audit log of administrative actions.
--
-- One row per panel-level mutation performed by an authenticated user. The
-- rows are the panel's "who did what when from where" history — they make the
-- Activity page a real audit timeline rather than a placeholder. We do NOT
-- log read-only operations (list / fetch) here; they'd balloon the table.
--
-- `category` is the broad bucket ('user' / 'role' / 'node' / 'template' /
-- 'instance' / 'api_key' / 'settings' / 'auth') so the dashboard can group /
-- filter without needing to inspect the action string.
--
-- `action` is the verb ('create' / 'update' / 'delete' / 'rotate' /
-- 'login' / 'logout' / 'start' / 'stop' / 'destroy' / etc.).
--
-- `target_id` is the row id of the affected entity (nullable for actions
-- that don't bind to a single row, e.g. login). `target_label` is a
-- human-readable name cached at write-time so the page can render rows
-- even after the underlying entity is gone.
--
-- `ip_address` is the client IP, preferring X-Forwarded-For when the panel
-- sits behind a reverse proxy. Stored as TEXT so the panel can show e.g.
-- `10.0.0.5` or `2001:db8::1` without truncation.
--
-- `user_agent` is the raw User-Agent header value (nullable) — kept short
-- by browsers and proxies so the column never blows up.
--
-- The actor's username is denormalised into `username` so an Activity
-- timeline can render even if the underlying `users` row is later deleted.

CREATE TABLE IF NOT EXISTS activity_logs (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    -- The user who triggered the action. Nullable so a deleted user doesn't
    -- break viewing the historic row — the denormalised username column
    -- carries the label.
    user_id      BIGINT,
    -- Denormalised username at write-time. Empty when the action was
    -- performed by an unauthenticated caller (e.g. failed login attempt).
    username     TEXT    NOT NULL DEFAULT (''),
    -- Optional role display name at write-time; useful in the Activity UI
    -- to colour-code the actor without joining.
    role         TEXT    NOT NULL DEFAULT (''),
    category VARCHAR(255) NOT NULL,
    action       TEXT    NOT NULL,
    target_id    INTEGER,
    target_label TEXT    NOT NULL DEFAULT (''),
    -- Free-form human summary ('deleted user "alice"', 'rotated token for
    -- edge "edge-1"', 'logged in'). Limited at write-side to ~255 chars.
    message      TEXT    NOT NULL DEFAULT (''),
    ip_address   TEXT    NOT NULL DEFAULT (''),
    user_agent   TEXT    NOT NULL DEFAULT (''),
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX activity_logs_created_idx ON activity_logs(created_at);
CREATE INDEX activity_logs_user_idx    ON activity_logs(user_id);
CREATE INDEX activity_logs_category_idx ON activity_logs(category);
