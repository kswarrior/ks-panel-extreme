-- 058_sftp.sql: per-instance SFTP access.
--
-- Each row is the SFTP identity for one instance (single-row per instance,
-- hence instance_id is the PRIMARY KEY). The cleartext password is NEVER
-- stored here — it lives only in instance_secrets (secretbox AES-256-GCM,
-- key "sftp_password") so a leaked DB or backup can't recover it. This
-- table holds the non-secret dial parameters the SPA + sftp.json page need
-- to render host:port/user + FileZilla hints.
--
--   enabled   0 = provisioned but disabled (suspend blocks auth by flipping
--             this + deleting the edge in-memory creds; unsuspend restores).
--   username  panel-minted "inst_<id>" (unique per instance).
--   port      edge SFTP listen port for this instance (default 2222).
--             Allocated avoiding instance_ports host_port collisions on the
--             same node so docker -p and SFTP never fight over a host port.
--   root      chroot root for the SFTP session (host path of the instance's
--             primary mount, or "" = edge default). The edge re-validates it
--             with the same isDangerousPath denylist the file manager uses
--             (/bin /sbin /usr /etc /proc /sys /dev /boot /lib /lib64 /root)
--             and jails every operation inside it.
--
-- Lifecycle: Deploy provisions (enable=1), Destroy deletes the row (+ vault
-- secret + edge creds), Suspend flips enabled=0 + deletes edge creds,
-- Unsuspend restores enabled=1 + re-provisions from the vault.

CREATE TABLE IF NOT EXISTS instance_sftp (
    instance_id  INTEGER PRIMARY KEY REFERENCES instances(id) ON DELETE CASCADE,
    enabled      INTEGER NOT NULL DEFAULT 1,
    username     TEXT    NOT NULL DEFAULT '',
    port         INTEGER NOT NULL DEFAULT 2222,
    root         TEXT    NOT NULL DEFAULT '',
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instance_sftp_enabled ON instance_sftp(enabled);
