# Parts and Scope

| Path | Role |
|---|---|
| `edge/backend/` | Edge agent (this doc) |
| `edge/backend/cmd/ksedge/` | Entrypoint shim |
| `edge/backend/internal/` | Packages |
| `panel/backend/internal/edge/` | Panel-side client (see panel docs) |
| `instance_pages/` | Page library (panel side) |

## Scope discipline
- Stay in `edge/backend/` when working on edge. Never edit panel code from edge tasks without
  crossing the contract.
- Never edit generated release artifacts.
- Config: `config.toml` (TOML). Token-gated HTTP surface.
- Body limits and token auth are security-critical; fail closed.
EOF