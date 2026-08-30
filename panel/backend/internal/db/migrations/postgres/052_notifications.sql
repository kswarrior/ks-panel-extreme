-- 052_notifications.sql: powerful per-user notification inbox (Postgres).

CREATE TABLE IF NOT EXISTS notifications (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name    TEXT    NOT NULL DEFAULT '',
    category      TEXT    NOT NULL DEFAULT 'general',
    priority      TEXT    NOT NULL DEFAULT 'normal',
    title         TEXT    NOT NULL,
    message       TEXT    NOT NULL DEFAULT '',
    link          TEXT    NOT NULL DEFAULT '',
    action_label  TEXT    NOT NULL DEFAULT '',
    metadata      TEXT    NOT NULL DEFAULT '',
    is_read       BOOLEAN NOT NULL DEFAULT FALSE,
    is_broadcast  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category     ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_priority     ON notifications(priority);
