# Exec and Terminal

## Interactive terminal bridge
`internal/exec/` — WebSocket `/api/edge/exec`. Bridges browser WS to driver.Exec (PTY). Protocol:
stdin/stdout/stderr/resize/ready/exit with base64 payloads. Token via ?token=.

## One-shot exec (inside workload)
`internal/execrpc/` — POST `/api/edge/exec-rpc`. Runs single command via /bin/sh -c, captures
stdout/stderr/exit. Env exported at top of script. Optional file staging (application runs).
Timeout clamp (default 5min). Used by automation and process kills.

## Host exec
`internal/hostexec/` — POST `/api/edge/host-exec`. Same envelope but runs on edge host filesystem.
Stages files into temp dir via `execstage`. Used by application runs targeting host.

## execstage
`internal/execstage/stage.go` — builds sh script: exports env, stages {path,content} files into
fresh temp dir (heredocs), cds into dir, appends command. Limits: 64 files, 1 MiB/file, 4 MiB total.
Validates path safety (no traversal).

## execrpc vs exec
execrpc = one-shot JSON; exec = streaming WS terminal.
EOF