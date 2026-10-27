# Telemetry

Package: `internal/telemetry/`. Stdlib-only (no gopsutil). Linux /proc based; degrades to zeros
on unsupported platforms.

## Snapshot
RAM used/total, CPU percent, disk used/total, uptime, drivers availability, per-metric hw_*_ok
quality flags.

## Driver detection
`detectDrivers` probes PATH for docker/dockerd/podman, virsh+virt-install, multipass, lxd/lxc.
Host always true. KVM requires both virsh and virt-install.

## Collectors
meminfo, cpuPercent, diskUsage (working dir filesystem), uptimeSeconds. Each reports success.
EOF