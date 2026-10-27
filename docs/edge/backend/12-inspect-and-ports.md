# Inspect and Ports

## Inspect
`internal/inspect/` — POST `/api/edge/inspect`. Gathers live state via driver.Runner:
metrics, processes, ports, info (raw JSON). 12s timeout. Panel caches live state; falls back to
cached on failure. Unknown driver kind rejected.

## Ports
`internal/ports/` — POST `/api/edge/ports/update`. Reconciles desired host→container port
allocations into live container. Validates port ranges/protocol/IP. 60s timeout. Drivers without
port support (kvm/lxd/multipass/host) no-op.
EOF