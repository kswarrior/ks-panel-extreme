# Update (Self-Update / Reinstall)

Package: `internal/update/`. Endpoints:
- GET /api/edge/update-info — local build identity + artefact URLs.
- GET /api/edge/update-check — fetch remote manifest, semver compare.
- POST /api/edge/update-apply — download latest, swap binary, relaunch.
- POST /api/edge/reinstall — force reinstall current channel.
- POST /api/edge/reinstall-background — write reinstall.sh + run detached.

## Token
May arrive as JSON body or ?token= query (both accepted on every verb) for direct HTTP and WSS
tunnel parity. Empty-token guard.

## URLs
Mirror panel's ksedge pair in node_handler.go. Detach helpers for linux/other.
EOF