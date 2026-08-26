-- 006_templates.sql: PufferPanel-style instance templates.
--
-- A template is a reusable blueprint an operator picks when deploying a new
-- instance. The panel only STORES the template (name, kind, JSON describing
-- env vars, exposed ports, resource limits, image/aliases…); the real
-- workload is spun up by ksedge using the matching driver (docker, lxd, kvm,
-- multipass). Keeping execution in the edge keeps the panel stateless and
-- lets a single panel drive many heterogeneous edges.

CREATE TABLE IF NOT EXISTS templates (
    id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    -- Display name shown in the deploy modal + template list.
    name VARCHAR(255) NOT NULL,
    -- Short one-line description rendered under the name.
    description TEXT    NOT NULL DEFAULT (''),
    -- Which ksedge driver executes instances from this template.
    -- One of: 'docker' | 'lxd' | 'kvm' | 'multipass'.
    kind VARCHAR(255) NOT NULL,
    -- Pretty image / base the operator recognises (e.g. "ubuntu/22.04",
    -- "alpine:3.19", "debian-12"). Forwarded verbatim to the driver which
    -- interprets it according to its own image syntax.
    image       TEXT    NOT NULL DEFAULT (''),
    -- JSON blob carrying the full driver-specific configuration: env vars,
    -- port mappings, CPU/RAM limits, disk size, mounts, command/entrypoint…
    -- See web/src/types/template.ts (TemplateSpec) for the canonical shape
    -- the panel UI understands; the panel otherwise treats this as opaque.
    spec        TEXT    NOT NULL DEFAULT ('{}'),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name)
);

CREATE INDEX templates_kind_idx ON templates(kind);
