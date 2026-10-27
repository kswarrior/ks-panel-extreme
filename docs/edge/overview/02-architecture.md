# Architecture

```
Panel (Go) ──HTTP/WSS──▶ ksedge (Go) ──shell-out──▶ docker/lxc/virsh/multipass/sh
                              │
                              ▼
                         host /proc, filesystem, instances_dir
```

## Agent
- Single Go module `github.com/example/ksedge`, Go 1.22.
- CLI via cobra. `launch` loads config, starts heartbeat sender + health/HTTP server, optional tunnel.
- Health server registers `/health` + `/api/edge/*` handlers (token-gated).
- Body limits per route (1MB default, larger for file manager).
- Panic recovery middleware.

## Drivers
Thin shell-out layers invoking real binaries; host driver runs shell service directly. Each
implements `Driver` interface. Registry keyed by kind string.

## No DB
State is in-process (install records, SFTP credentials). Edge restart wipes in-progress installs
and SFTP creds; panel re-provisions.
