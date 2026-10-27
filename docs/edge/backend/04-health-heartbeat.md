# Health and Heartbeat

## /health
`internal/health/health.go` — unauthenticated GET. Returns service "ksedge", name, listen_port,
uptime_secs. Used by panel active probe to confirm responder identity and name match.

## Heartbeat
`internal/heartbeat/heartbeat.go` — Sender POSTs telemetry to `/api/nodes/heartbeat` every interval
(default 60s, immediate on startup). Skipped if token empty (localnode). TLS settings honored.
Hard 10s client timeout, fast-fail dial. Response body drained for keep-alive reuse.

## Payload
token, ram_used/total, cpu_percent, disk_used/total, uptime_secs, drivers availability, hw_*_ok
quality flags.

## Tunnel
Optional reverse WSS (`internal/tunnel/`) dials panel and multiplexes RPCs. Exponential backoff,
reconnect. Modes determine transport use.
EOF