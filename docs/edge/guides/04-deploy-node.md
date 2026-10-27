# Deploy Node

1. Install ksedge binary on host.
2. Create node in panel → copy config.toml (token, panel_url) to edge dir.
3. Run `ksedge launch` (or supervise). Optionally set instances_dir.
4. Ensure drivers installed (docker/lxc/virsh/multipass) as needed.
5. SFTP port 2222 open if using FileZilla/WinSCP.
6. Connection mode determines inbound port/tunnel needs.
7. Panel probes /health and heartbeat to mark node up.

Self-update via panel per-node Update & Reinstall UI.
EOF