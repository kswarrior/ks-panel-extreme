-- 065_ai_persistence.sql: durable storage for the panel-wide AI assistant.
--
-- ai_confirmation_tickets replaces the old process-local ticket map: a
-- write-tool proposal survives panel restarts and works behind any
-- single-instance deploy. Rows are user-bound (approval re-checks the
-- owner) and expire after 10 minutes; the handler sweeps expired rows on
-- every store/take.
--
-- ai_chat_threads + ai_chat_messages persist per-user chat history. The
-- server loads the last 50 messages of a thread as the model context
-- window; every query is scoped by user_id so users can never see each
-- other's threads.
--
-- The ai_fallback_* / ai_cost_* settings extend the assistant config KV
-- (same shape as 064): a secondary provider the chat loop fails over to,
-- plus optional per-1k-token prices used for usage/cost audit rows.
-- NOTE: keep each INSERT on ONE line — regen.sh only converts single-line
-- INSERT OR IGNORE statements for postgres.

CREATE TABLE IF NOT EXISTS ai_confirmation_tickets (
    id         VARCHAR(64) PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool       TEXT NOT NULL DEFAULT '',
    args_json  TEXT NOT NULL DEFAULT '{}',
    summary    TEXT NOT NULL DEFAULT '',
    diff       TEXT NOT NULL DEFAULT '',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_tickets_user ON ai_confirmation_tickets(user_id, expires_at);

CREATE TABLE IF NOT EXISTS ai_chat_threads (
    id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_threads_user ON ai_chat_threads(user_id, id DESC);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    thread_id  INTEGER NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'user',
    content    TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_messages_thread ON ai_chat_messages(thread_id, id);

INSERT IGNORE INTO settings (key, value) VALUES ('ai_fallback_base_url', '');
INSERT IGNORE INTO settings (key, value) VALUES ('ai_fallback_api_key_enc', '');
INSERT IGNORE INTO settings (key, value) VALUES ('ai_fallback_model_id', '');
INSERT IGNORE INTO settings (key, value) VALUES ('ai_fallback_ollama_mode', '0');
INSERT IGNORE INTO settings (key, value) VALUES ('ai_cost_per_1k_in', '0');
INSERT IGNORE INTO settings (key, value) VALUES ('ai_cost_per_1k_out', '0');
