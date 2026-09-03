-- 052_tickets.sql: complete powerful ticket system
--
-- Two tables:
--   tickets
--     — one row per support request. category/priority/status are plain
--       TEXT enums validated server-side (so adding a new category never
--       needs a migration). ticket_no is the human TKT-000001 code shown
--       in the UI and used for search. assigned_to may be NULL when the
--       ticket is unassigned. tags is a JSON array string.
--   ticket_comments
--     — threaded replies + internal staff notes. is_internal=1 notes are
--       visible only to staff (TICKETS_EDIT / MANAGE_TICKETS). The panel
--       bumps tickets.updated_at on every new comment so the list sort
--       ("recently updated") reflects reply activity without a join.
--
-- Indexes mirror the filter bar on the Tickets page (status / priority /
-- category / created_by / assigned_to) and the comment lookup.
-- Permissions are seeded at the bottom so the admin role picks them up on
-- next launch via db.go SeedCore's INSERT OR IGNORE.

CREATE TABLE IF NOT EXISTS tickets (
    id              SERIAL PRIMARY KEY,
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
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL,
    author_id       INTEGER NOT NULL,
    body            TEXT    NOT NULL,
    is_internal     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority    ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category    ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by  ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_no   ON tickets(ticket_no);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author ON ticket_comments(author_id);

-- Seed ticket permissions
INSERT OR IGNORE INTO permissions (key, description) VALUES
    ('MANAGE_TICKETS', 'Manage tickets (support system umbrella – view, create, edit, delete)'),
    ('TICKETS_VIEW',   'View tickets (list + detail)'),
    ('TICKETS_CREATE', 'Create new tickets'),
    ('TICKETS_EDIT',   'Edit tickets, change status/priority, assign, reply'),
    ('TICKETS_DELETE', 'Delete tickets and comments');
