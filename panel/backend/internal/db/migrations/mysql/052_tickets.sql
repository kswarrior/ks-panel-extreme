-- 052_tickets.sql: complete powerful ticket system (MySQL)

CREATE TABLE IF NOT EXISTS tickets (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_no       TEXT    NOT NULL UNIQUE,
    subject         TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    category        TEXT    NOT NULL DEFAULT 'general',
    priority        TEXT    NOT NULL DEFAULT 'medium',
    status          TEXT    NOT NULL DEFAULT 'open',
    created_by      INTEGER NOT NULL,
    assigned_to     INTEGER,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    closed_at       TEXT,
    due_at          TEXT,
    tags            TEXT    NOT NULL DEFAULT '[]',
    FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id       INTEGER NOT NULL,
    author_id       INTEGER NOT NULL,
    body            TEXT    NOT NULL,
    is_internal     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_tickets_status      ON tickets(status);
CREATE INDEX idx_tickets_priority    ON tickets(priority);
CREATE INDEX idx_tickets_category    ON tickets(category);
CREATE INDEX idx_tickets_created_by  ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_ticket_no   ON tickets(ticket_no);
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_author ON ticket_comments(author_id);

-- Seed ticket permissions
INSERT IGNORE INTO permissions (key, description) VALUES
    ('MANAGE_TICKETS', 'Manage tickets (support system umbrella – view, create, edit, delete)'),
    ('TICKETS_VIEW',   'View tickets (list + detail)'),
    ('TICKETS_CREATE', 'Create new tickets'),
    ('TICKETS_EDIT',   'Edit tickets, change status/priority, assign, reply'),
    ('TICKETS_DELETE', 'Delete tickets and comments');
