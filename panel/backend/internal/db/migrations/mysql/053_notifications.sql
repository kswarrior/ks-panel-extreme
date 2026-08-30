-- 052_notifications.sql: powerful per-user notification inbox (MySQL).

CREATE TABLE IF NOT EXISTS notifications (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    actor_id      BIGINT NULL,
    actor_name    VARCHAR(255) NOT NULL DEFAULT '',
    category      VARCHAR(32)  NOT NULL DEFAULT 'general',
    priority      VARCHAR(16)  NOT NULL DEFAULT 'normal',
    title         VARCHAR(500) NOT NULL,
    message       TEXT         NOT NULL,
    link          VARCHAR(1000) NOT NULL DEFAULT '',
    action_label  VARCHAR(255)  NOT NULL DEFAULT '',
    metadata      TEXT         NOT NULL,
    is_read       TINYINT(1) NOT NULL DEFAULT 0,
    is_broadcast  TINYINT(1) NOT NULL DEFAULT 0,
    created_at    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at       DATETIME   NULL,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_notifications_user_read    (user_id, is_read),
    INDEX idx_notifications_user_created (user_id, created_at),
    INDEX idx_notifications_category     (category),
    INDEX idx_notifications_priority     (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
