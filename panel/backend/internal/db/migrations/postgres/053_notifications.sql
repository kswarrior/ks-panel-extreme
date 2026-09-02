-- 052_notifications.sql: powerful per-user notification inbox.
--
-- One row per recipient — broadcasts are fanned out at create time so a
-- per-user "read" never masks another user's unread. The table is indexed
-- on the two columns the inbox list endpoint filters/sorts by: user_id +
-- is_read for the unread badge, and user_id + created_at for the feed.
-- category/priority are TEXT ENUMs constrained in Go, not SQL, to avoid
-- ALTER ENUM pain across engines.

CREATE TABLE IF NOT EXISTS notifications (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    actor_id      INTEGER,
    actor_name    TEXT    NOT NULL DEFAULT '',
    category      TEXT    NOT NULL DEFAULT 'general',
    priority      TEXT    NOT NULL DEFAULT 'normal',
    title         TEXT    NOT NULL,
    message       TEXT    NOT NULL DEFAULT '',
    link          TEXT    NOT NULL DEFAULT '',
    action_label  TEXT    NOT NULL DEFAULT '',
    metadata      TEXT    NOT NULL DEFAULT '',
    is_read       INTEGER NOT NULL DEFAULT 0,
    is_broadcast  INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at       TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category     ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_priority     ON notifications(priority);
