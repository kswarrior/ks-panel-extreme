-- 007_instances.sql: Instances deployed from a template onto an edge node.
--
-- The panel is the source of truth for "which instance lives where, what
-- template it came from, and is it running". ksedge owns the actual
-- container/VM lifecycle and reports back the real `external_id` (docker
-- container name, lxc instance, virsh domain, multipass name) so the panel
-- can later ask the edge to start/stop/destroy that exact workload.

CREATE TABLE IF NOT EXISTS instances (
    id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    -- The edge node this instance was scheduled onto.
    node_id     BIGINT NOT NULL,
    -- The template the instance was spawned from. Kept as a foreign key so
    -- deleting a template still leaves the instance row pointing at it via
    -- ON DELETE SET NULL (we keep history but refuse to redeploy from a
    -- removed template).
    template_id BIGINT,
    -- Operator-chosen instance label, unique per panel so logs/UI are clear.
    name        TEXT    NOT NULL,
    -- 'docker' | 'lxd' | 'kvm' | 'multipass' — cached from the template at
    -- deploy time so an owner can tell at a glance what kind of workload it is.
    kind        TEXT    NOT NULL,
    -- Lifecycle status mirrored from ksedge. 'creating' on deploy, then the
    -- edge flips it to 'running'/'stopped'/'errored' as the driver responds.
    -- The panel also accepts 'destroyed' which removes any printable card.
    status      TEXT    NOT NULL DEFAULT ('creating'),
    -- The real driver-side name/ID ksedge returned (docker container name,
    -- lxc instance name, virsh domain, multipass instance name). Stored so
    -- subsequent start/stop/destroy RPCs reference the exact workload.
    external_id TEXT    NOT NULL DEFAULT (''),
    -- JSON snapshot of the resolved config used at deploy (template.spec
    -- merged with the per-deploy overrides from the modal). Cached so the
    -- instance keeps running even if the template is later edited.
    config      TEXT    NOT NULL DEFAULT ('{}'),
    -- Last error message from the edge, shown verbatim in the UI's status pill.
    error       TEXT    NOT NULL DEFAULT (''),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id)     REFERENCES nodes(id)      ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
    UNIQUE(node_id, name)
);

CREATE INDEX instances_node_idx    ON instances(node_id);
CREATE INDEX instances_status_idx  ON instances(status);
CREATE INDEX instances_template_idx ON instances(template_id);
