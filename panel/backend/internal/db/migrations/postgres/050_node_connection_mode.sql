-- 050_node_connection_mode.sql: how panel and edge find each other.
--
-- One column storing the connection mode the NodeForm dropdown drives:
--
--   direct          — panel stores edge URL (address), edge stores panel URL
--                     (panel_url). Both talk HTTP/HTTPS (bidirectional).
--   reverse_tunnel  — only edge stores panel URL; edge dials panel via WSS
--                     tunnel (panel never dials edge directly).
--   local_port      — edge runs on panel host via 127.0.0.1:<port> over HTTP.
--   local_wss       — edge runs on panel host via WSS tunnel (loopback).
--
-- Stored as TEXT with a 'direct' default so legacy rows (pre-050) keep the
-- established bidirectional behaviour without a data migration. The Go runner
-- in db.go guards the ALTER individually so SQLite/MySQL re-runs stay idempotent.

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'direct';
