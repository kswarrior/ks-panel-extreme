-- 055_instance_ports.sql: per-instance host->container port allocations.
--
-- Each row is one desired `-p host:container/protocol` binding for a docker
-- (or future) instance. The edge reconciles these into a live container on
-- PUT; a stopped instance keeps its allocations in the DB without touching
-- docker until the next start/deploy (DB-only path).
--
-- Validation (ports 1-65535, protocol tcp/udp, ip optional) lives in Go; the
-- CHECK here is the durable backstop so a stray manual INSERT can't corrupt
-- the table across dialects.
--
-- Existing rows get 0 ports only when the table is first created — normal
-- PUT replaces the whole set transactionally.

CREATE TABLE IF NOT EXISTS instance_ports (
    id             SERIAL PRIMARY KEY,
    instance_id    INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    host_port      INTEGER NOT NULL,
    container_port INTEGER NOT NULL,
    protocol       TEXT    NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('tcp','udp')),
    ip             TEXT    NOT NULL DEFAULT '',
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instance_ports_instance ON instance_ports(instance_id);
