# Files and SFTP

## File manager API
`internal/files/` — `/api/edge/files` (container) and `/api/edge/hostfiles` (host). Token-gated.
Ops: list, read (raw bytes), stat, write, upload, download, archive/extract. Shells out to
`docker exec <name> sh -c …`. Host files handler roots at instances_dir.

## Dangerous path denylist
`isDangerousPath` guards traversal; reused by SFTP jail. Fail closed.

## SFTP server
`internal/sftp/` — chrooted SSH+SFTP on port 2222 (default). Provision/delete via
`/api/edge/sftp/provision`, `/api/edge/sftp/delete`. Credentials in-memory only (edge restart
wipes; panel re-provisions from vault). bcrypt password hash. Jail to root via jailHandler using
files denylist. SSH host key generated in-memory.

## host_instance.go
Host-filesystem instance file handling.
EOF