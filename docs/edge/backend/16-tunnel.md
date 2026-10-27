# Tunnel (Reverse WSS)

Package: `internal/tunnel/`. Edge dials wss://panel/api/edge/tunnel?token=... and keeps connection.
Panel multiplexes RPCs over socket; edge forwards to local HTTP server (127.0.0.1:port) and returns
response. Enables NAT'd edges (reverse_tunnel, local_wss, both, local_both modes). Direct/local_port
modes use plain HTTP; tunnel harmless in parallel.

## Client
Client struct with panelURL/token/listenPort/skipVerify. Run blocks with exponential backoff (cap 30s).
connectAndServe forwards requests.
EOF