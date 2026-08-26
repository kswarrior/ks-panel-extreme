-- 004_nodes.sql: Edge nodes registered with the panel.
--
-- Each row is one physical/virtual machine (an "edge") that runs the ksedge
-- binary and reports back to the panel. The panel talks to edges via the
-- shared NOMAD_TOKEN below: the edge presents it, the panel uses it to
-- authenticate incoming metrics + instance lifecycle requests.

CREATE TABLE IF NOT EXISTS nodes (
    id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    -- Display name shown in the admin UI. Optional/uniqueness is intentional
    -- – two edges can share a hostname in different regions.
    name          TEXT    NOT NULL,
    -- host:port the panel will dial to drive the edge over HTTP/HTTPS.
    -- The UI shows this so admins know where the edge lives.
    address       TEXT    NOT NULL,
    -- 1 = use TLS (https://), 0 = plain HTTP. The address must still be
    -- host:port; the scheme comes from this column.
    use_tls       INTEGER NOT NULL DEFAULT 0,
    -- Shared NOMAD (edge) token. ksedge presents this on every request;
    -- the panel hashes it with SHA-256 and compares against token_hash so
    -- the raw value never has to be stored.
    token_hash    TEXT    NOT NULL,
    -- 30-char prefix of the plaintext token, so the panel can show a
    -- recognisable label without exposing the secret.
    token_prefix  TEXT    NOT NULL,
    -- Latest telemetry snapshot pushed by the edge.
    ram_used      INTEGER NOT NULL DEFAULT 0,
    ram_total     INTEGER NOT NULL DEFAULT 0,
    cpu_percent   REAL    NOT NULL DEFAULT 0,
    disk_used     INTEGER NOT NULL DEFAULT 0,
    disk_total    INTEGER NOT NULL DEFAULT 0,
    -- Sentinel uptime counter (seconds) so the panel can compute % uptime.
    uptime_secs   INTEGER NOT NULL DEFAULT 0,
    -- "up" = last heartbeat fresh and reachable, "down" = stale or last
    -- contact failed. Updated on every ingest or health probe.
    status VARCHAR(255) NOT NULL DEFAULT ('down'),
    -- Computed uptime percentage (0-100). Updated by the panel from the
    -- heartbeat history so it's available even if the edge crashed.
    uptime_pct    REAL    NOT NULL DEFAULT 0,
    -- Timestamps – updated on every metrics push.
    last_seen_at  DATETIME,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX nodes_status_idx ON nodes(status);
CREATE INDEX nodes_last_seen_idx ON nodes(last_seen_at);
