# Config (config.toml)

Package: `internal/config/`. Format: TOML. File placed next to binary or `--config <path>`.

## Fields
- `uuid` — optional display UUID.
- `name` — display name (cosmetic).
- `panel_url` — panel base URL (edge dials back).
- `token` — shared secret (kse_…). Never logged in full.
- `listen_port` — edge HTTP listen port (default 4040).
- `use_tls_upstream` — dial panel over HTTPS.
- `heartbeat_interval` — seconds (default 60).
- `skip_verify` — disable TLS verification (self-signed panels).
- `instances_dir` — per-instance working files (default `/var/lib/kspanel/instances`); relative resolves to binary dir.
- `connection_mode` — direct / reverse_tunnel / both / local_port / local_wss / local_both.

## Validation
- Both token and panel_url empty → valid (localnode flow; panel pushes config later).
- Otherwise both required.
- Defaults backfilled on load.

## Helpers
`HeartbeatIntervalOr`, `ListenPortOr`, `InstancesDirOr`, `ResolveInstancesDir`. Relative instances_dir resolved to binary dir.

## Env bridge
`KSPANEL_INSTANCES_DIR` exported to drivers for file manager root.
EOF