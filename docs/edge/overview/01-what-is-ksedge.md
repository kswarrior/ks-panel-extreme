# What is KS Edge (ksedge)

ksedge is a small Go agent that runs on each node/host. The panel calls it over HTTP (or WSS tunnel)
to execute drivers, files, lifecycle, telemetry, snapshots, page actions. It has no DB and no UI.

## Core concepts
- **Agent**: one process per host. Reads `config.toml` (token, panel_url, listen_port, instances_dir,
  connection_mode). Exposes `/health` + token-gated `/api/edge/*` RPCs.
- **Driver**: virtualization backend (docker, lxd, kvm, multipass, host). Implements common `Driver`
  interface (deploy/start/stop/kill/status/destroy/exec/attach/runner/updateports/snapshot).
- **Heartbeat**: pushes telemetry to panel every interval (default 60s).
- **Tunnel**: optional reverse WSS to panel for NAT'd edges.
- **Install workflow**: async multi-step install with console streaming.
- **Page actions**: allow-listed action execution on edge for instance pages.

## Modes
Connection modes: direct, reverse_tunnel, both, local_port, local_wss, local_both. Direct/local_port
use inbound HTTP; tunnel modes dial out WSS.
