# Snapshots

Package: `internal/snapshot/`. Endpoint `/api/edge/snapshot`. Token-gated.

## Actions
create, restore, delete. Fields: kind, name, action, snap_name, type, location. Dispatches to
driver.Snapshot. Returns ok/external_ref/size_bytes/error.

## Types
zip, tar, docker, lxd etc. (driver-dependent).
EOF