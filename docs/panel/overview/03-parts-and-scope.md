# Parts and Scope

| Part | Path | Role |
|---|---|---|
| Panel backend | `panel/backend/` | Go API server, DB, auth, orchestration |
| Panel frontend | `panel/frontend/` | React SPA |
| Edge backend | `edge/backend/` | Node agent (separate doc later) |
| Instance pages | `instance_pages/` | YAML page library |
| Themes market | `themes_market/` | Theme JSON library |
| Docs | `docs/` | Deep docs |
| Release | `release/` | Build output (never hand-edit) |

## Scope discipline (from loop.md)
- Stay inside affected part. Never grep `/` or whole repo.
- Backend = `panel/backend/`, Frontend = `panel/frontend/`, Edge = `edge/backend/`.
- Never edit generated output: `release/`, `panel/backend/internal/ui/`,
  `panel/backend/internal/pagelib/library/`, `panel/backend/internal/themelib/library/`.
- Never edit a shipped DB migration; add a new one in all three engines.
- Never delete files referenced by build scripts.
