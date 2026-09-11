-- 078_page_kv.sql: per-page server KV store (plan item 7).
--
-- sdk.kv persists small page state server-side per instance+page (survives
-- browsers/profiles, unlike sdk.storage which is localStorage). One row per
-- (instance, page family, key):
--
--   instance_id INTEGER NOT NULL — the owning instance (scoping key; a list
--                                  scoped to instance B can never see A's rows)
--   page_slug   VARCHAR(128) NOT NULL DEFAULT '' — the page FAMILY slug that
--                                  wrote the row (sub-pages share the parent
--                                  family: the SDK stamps sdk.pageSlug, e.g.
--                                  "files/edit", and the handler resolves it
--                                  via findSpecPageRow like execute-action)
--   k           VARCHAR(128) NOT NULL DEFAULT '' — caller key, code-enforced:
--                                  ^[A-Za-z0-9_.-]{1,128}$
--   v           TEXT NOT NULL — value, code-enforced to <= 64KiB (65536 bytes)
--   updated_at  TEXT NOT NULL — UTC "2006-01-02 15:04:05" write stamp
--                                  (TEXT timestamp mirrors 069_api_key_requests)
--
-- Quotas (enforced in the handler, not here): <= 100 keys per
-- (instance_id, page_slug). KV is NOT a secrets store: values are stored in
-- the clear and returned to anyone who can view the instance's page — never
-- put tokens/passwords here (use the secrets vault instead).
--
-- MySQL-safe up front (regen.sh check): VARCHAR(128) — not TEXT — for the
-- PK members (MySQL 1170 rejects TEXT in any key without a key length);
-- plain TEXT with NO default for v (MySQL 1101 rejects TEXT DEFAULT);
-- single-statement lines only. No secondary index: list queries filter on
-- (instance_id, page_slug), the leftmost PK prefix, so the PK serves them.
-- CREATE TABLE IF NOT EXISTS rides the generic migration path on every
-- engine (no db.go guard needed — mirrors 069_api_key_requests table half).

CREATE TABLE IF NOT EXISTS page_kv (
    instance_id INTEGER NOT NULL,
    page_slug VARCHAR(128) NOT NULL DEFAULT '',
    k VARCHAR(128) NOT NULL DEFAULT '',
    v TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (instance_id, page_slug, k)
);
