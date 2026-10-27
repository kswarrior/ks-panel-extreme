# Page Actions

Package: `internal/pageaction/`. Endpoint `/api/edge/page-action`. Token-gated.

## Action types
shell, read_file, write_file, list_files, docker, kvm, lxd, stat, chmod, archive, extract.

## Input
token, kind, name, type, command, path, content, args, env, timeout, options, mode, names, dest,
module_id.

## Behavior
Validates token/kind/name/type. Timeout clamp (default 30s, max 30min). Dispatches to driver
exec/file ops. Returns ok/exit_code/stdout/stderr/error/data.

## Used by
Instance pages allow-listed actions executed on edge via panel `internal/edge/`.

## Limits
1MB body. Timeout upper clamp prevents pinned goroutines.
EOF