# Lifecycle

Package: `internal/lifecycle/`. HTTP handler `/api/edge/lifecycle`. Token-gated.

## Actions
deploy, start, stop, kill, status, destroy. Dispatches to drivers.Registry[Kind]. Per-request 5-min
timeout. Returns ok/external_id/status/error.

## Auth
Shared token, constant-time compare, empty-token guard. Only panel origin.

## Error shape
200 with {ok:false,error} so panel reads body, not status.
EOF