# Install Engine

Package: `internal/install/`. Async multi-step install workflow.

## Endpoints
- POST /api/edge/install — kick off (async), returns install_id.
- GET /api/edge/install?token&kind&name — poll state (running/done/failed/unknown).
- GET /api/edge/install/stream — WebSocket live console (history + tail).
- POST /api/edge/install/stop — cancel + optional stop_command (same/different terminal).
- POST /api/edge/install/stdin — write one console line to running step.

## Features
- In-process store keyed `<kind>:<name>`; state survives until overwrite.
- OnProgress publishes live per-step state.
- Concurrent stdout/stderr drain (no pipe deadlock).
- Container-not-running retry (up to 30s) for post-deploy scheduling.
- Timeout semantics: >0 cap, <0 no deadline (long-running actions), 0 legacy 30min.
- KeepStdin mode keeps stdin open for same-terminal stop.
- StopCommand same (inject into stdin) or different (exec separate shell).
- Stdin budget 8 KiB.

## Engine
`engine.go` runs steps; `execstage` builds sh script; `stream.go` WS console.
EOF