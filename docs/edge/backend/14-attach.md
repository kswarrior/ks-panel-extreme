# Attach

Package: `internal/attach/`. WebSocket `/api/edge/attach`. Bridges browser WS to instance's MAIN
process stdio via driver.Attach. Same protocol as exec bridge. Drivers without main-process attach
(kvm, lxd, multipass, host) return error. Container needs open stdin (docker -i) for input.

## Use
Terminal attach to running workload's main process (e.g. Minecraft server console).
EOF