# Drivers

Package: `internal/drivers/`. Drivers: docker, lxd, kvm, multipass, host. Registry keyed by kind.

## Driver interface
Name, Deploy, Start, Stop, Kill, Status, Destroy, Exec, Attach, Runner (metrics/processes/ports/info),
UpdatePorts, Snapshot (create/restore/delete). ExecSession with Stdin/Stdout/Stderr/Wait/Close.

## ExecSession
Pipes for stdin/stdout/stderr; Wait returns exit code; Close tears down.

## Host driver
Runs shell service directly on edge host filesystem (no isolation). Always available.

## Inspect helpers
`inspect_helpers.go` shared by drivers.

## PortAllocation
Host/container/protocol/IP binding reconciled into live container (docker re-creates with new -p).
EOF