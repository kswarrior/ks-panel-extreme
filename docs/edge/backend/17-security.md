# Security (Edge)

## Token gating
All `/api/edge/*` RPCs (except /health) require shared edge token. Constant-time compare; explicit
empty-token guard (localnode boot window rejects everything).

## Body limits
Per-route limits in cli.go: 1MB default; larger for file manager (100+ MiB) and install stream.
Middleware enforces.

## Panic recovery
recoverPanic wraps handlers; logs panics, returns 500. Prevents one bad request crashing agent.

## TLS
Heartbeat/tunnel honor use_tls_upstream + skip_verify. Self-signed panels supported via skip_verify.

## Path safety
files denylist + SFTP jail prevent traversal. execstage validates staged paths.

## No secrets persisted
SFTP creds in-memory only; edge restart wipes. Token in config.toml (operator-protected).
EOF