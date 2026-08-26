-- 005_node_heartbeats.sql: Rolling heartbeat log used to compute node uptime %.
--
-- We keep one row per minute per node (collisions are merged into the same
-- minute bucket) – that's enough resolution to show "% time up in the last
-- 24h" without ballooning the DB. The ingest endpoint UPSERTs into the
-- current minute; the uptime calculation counts rows with status='up'.

CREATE TABLE IF NOT EXISTS node_heartbeats (
    node_id       BIGINT NOT NULL,
    -- Truncated-to-minute bucket. Storing a rounded timestamp means a burst
    -- of heartbeats in the same minute collapses to one row, keeping the
    -- table small.
    bucket_at     DATETIME NOT NULL,
    status        TEXT     NOT NULL,
    PRIMARY KEY (node_id, bucket_at),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX node_heartbeats_node_idx ON node_heartbeats(node_id);
