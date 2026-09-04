-- 065_tickets_attachments_sla_notify.sql: ticket attachments + SLA + notify prefs.
--
-- Three new tables (CREATE TABLE IF NOT EXISTS is idempotent on every
-- dialect; the index lines are guarded at runtime in db.go via
-- guardedCreateIndex because MySQL lacks CREATE INDEX IF NOT EXISTS and
-- migrations re-run on every launch — mirrors 055/062):
--
--   ticket_attachments
--     — one row per uploaded file. Bytes live under
--       <DataDir>/ticket_attachments/<ticket_id>/<id>-<sha8>-<name>; this
--       table is only metadata. comment_id is NULL for ticket-level uploads
--       (TicketDetail) and set for chat-message uploads (TicketChat).
--       sha256 powers dedupe: re-uploading identical bytes to the same
--       ticket returns the existing row instead of storing a second copy.
--   ticket_sla
--     — one row per ticket (PK = ticket_id, CASCADE). Kept as a sidecar
--       (not ALTERs on tickets) so the migration stays CREATE-only and
--       needs no per-dialect ALTER guard. first_response_at is stamped on
--       the first staff comment; sla_breached flips when due_at passes
--       while the ticket is still open; escalated marks auto-escalation.
--   notification_prefs
--     — one row per user (PK = user_id, CASCADE). mode is
--       realtime|digest|off (validated in Go); email_opt_out=1 skips all
--       ticket/notification email for that user; last_digest_at tracks the
--       daily digest sweep.
--
-- KV defaults (INSERT OR IGNORE is idempotent on every dialect; each row is
-- a single line so regen.sh derives postgres ON CONFLICT DO NOTHING and
-- mysql INSERT IGNORE automatically):
--   ticket_sla_config  JSON per-category {first_response_mins,resolve_hours}
--   smtp_tls           auto|implicit|starttls|off (default auto: 465 =
--                      implicit TLS, otherwise STARTTLS when advertised).

CREATE TABLE IF NOT EXISTS ticket_attachments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id       INTEGER NOT NULL,
    comment_id      INTEGER,
    file_name       TEXT    NOT NULL DEFAULT '',
    mime            TEXT    NOT NULL DEFAULT 'application/octet-stream',
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    sha256          TEXT    NOT NULL DEFAULT '',
    uploaded_by     INTEGER NOT NULL,
    created_at      TEXT    NOT NULL,
    FOREIGN KEY (ticket_id)  REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_sha ON ticket_attachments(sha256);

CREATE TABLE IF NOT EXISTS ticket_sla (
    ticket_id         INTEGER PRIMARY KEY,
    first_response_at TEXT,
    sla_breached      INTEGER NOT NULL DEFAULT 0,
    escalated         INTEGER NOT NULL DEFAULT 0,
    escalated_at      TEXT,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id        INTEGER PRIMARY KEY,
    mode           TEXT    NOT NULL DEFAULT 'realtime',
    email_opt_out  INTEGER NOT NULL DEFAULT 0,
    last_digest_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('ticket_sla_config', '{"general":{"first_response_mins":60,"resolve_hours":24},"billing":{"first_response_mins":120,"resolve_hours":48},"technical":{"first_response_mins":30,"resolve_hours":12},"feature":{"first_response_mins":240,"resolve_hours":168},"bug":{"first_response_mins":60,"resolve_hours":24},"abuse":{"first_response_mins":30,"resolve_hours":8},"other":{"first_response_mins":120,"resolve_hours":48}}');
INSERT OR IGNORE INTO settings (key, value) VALUES ('smtp_tls', 'auto');
