# Build and Rebuild

Final gate: `bash rebuild.sh` (must pass after any edit).

## What rebuild.sh does
1. Builds frontend (Vite) → embeds into `panel/backend/internal/ui/`.
2. Syncs `instance_pages/` → `panel/backend/internal/pagelib/library/`.
3. Syncs `themes_market/` → `panel/backend/internal/themelib/library/`.
4. Builds `release/kspanel` + `release/ksedge`.
5. Checksums + `release/version.json`. Auto-bumps VERSION.

## Commands
- `bash update.sh` — sync binaries before tests.
- `bash rebuild.sh` — final verification gate.
- `bash retest.sh` — launch panel on :8080 (only when panel DOWN; kills old instances).

## Rules
- Never hand-edit generated output: `release/`, `internal/ui/`, `pagelib/library/`, `themelib/library/`.
- Run update.sh before test runs if git status shows changes.
- Probe :8080 before running retest.sh (never kill running panel unless user says).
EOF