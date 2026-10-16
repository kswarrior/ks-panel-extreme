# KS Panel — Agent Rules

FIRST ACTION for any task in this repo: read `loop.md` (THE LOOP — mandatory rules and
verification protocol) and `map.md` (where everything lives). They are authoritative.

- Scope discipline: stay inside the affected part — `panel/backend`, `panel/frontend`,
  `edge/backend`, or `instance_pages`. Never grep `/` or the entire repo.
- No task is done until the required checks pass with real, read output. Final gate:
  `bash rebuild.sh`.
- Project skills (auto-loaded by opencode) live in `.opencode/skills/`:
  `ks-loop`, `ks-edge`, `ks-panel-backend`, `ks-panel-aiskills`, `ks-instance-pages`.
- Never hand-edit generated output: `release/`, `panel/backend/internal/ui/`,
  `panel/backend/internal/pagelib/library/`, `panel/backend/internal/themelib/library/`.
- Never edit a shipped DB migration; add a new one in all three engines (mysql, postgres,
  sqlite). Never delete files referenced by build scripts.
