# Edge Agent Structure

Root: `edge/backend/`. Module: `github.com/example/ksedge`, Go 1.22.

```
edge/backend/
├── cmd/ksedge/main.go
└── internal/
    ├── attach/       # WS bridge to instance main process stdio
    ├── cli/          # cobra commands, launch, health server, route registration
    ├── config/       # config.toml load + defaults + validation
    ├── drivers/      # docker/lxd/kvm/multipass/host + registry
    ├── exec/         # WS interactive terminal bridge
    ├── execrpc/      # one-shot exec inside workload
    ├── execstage/    # stage files + build sh script
    ├── files/        # file manager API (container + host)
    ├── health/       # /health handler
    ├── heartbeat/    # push telemetry to panel
    ├── hostexec/     # one-shot exec on host
    ├── inspect/      # live state (metrics/processes/ports/info)
    ├── install/      # async install workflow + console stream
    ├── lifecycle/    # deploy/start/stop/kill/status/destroy
    ├── pageaction/   # allow-listed page actions
    ├── ports/        # port reconciliation
    ├── sftp/         # chrooted SFTP server
    ├── snapshot/     # snapshot RPCs
    ├── telemetry/    # host metrics + driver detection
    ├── tunnel/       # reverse WSS to panel
    ├── update/       # self-update/reinstall
    └── version/      # version stamp
```

## Conventions
- Handlers token-gated (constant-time compare, empty token guard).
- JSON envelopes with `ok` + `error`.
- Per-request timeouts. Panic recovery.
EOF