---
name: ks-loop
description: Use for ANY change in the ks-panel-extreme repo (panel/backend Go, panel/frontend React+TS, edge/backend Go, instance_pages YAML, migrations, scripts). Enforces THE LOOP from loop.md - read loop.md and map.md first, minimal scoped edits, CHECKLIST V verification with real output, and rebuild.sh as the final gate.
---

# KS Panel — THE LOOP (mandatory workflow)

`loop.md` is the authoritative rulebook; `map.md` is the authoritative map. Read both before editing. This skill is only a quick-entry summary — when they disagree, loop.md wins.

## 0. Before any edit

1. Read `loop.md` (rules) and `map.md` (where everything lives).
2. `git status` + `git log --oneline -5` — know the base state.
3. Classify task: Add | Remove | Fix | Modify | Refactor. State the blast radius.
4. Paths (never grep `/` or the whole repo):
   - Panel backend: `panel/backend`
   - Panel frontend: `panel/frontend`
   - Edge: `edge/backend`
   - Instance pages: `instance_pages/`
5. Fix tasks: reproduce first, state the root cause in one line before editing.

## 1. Edit rules (short form)

- Minimal diff; follow surrounding patterns; no drive-by refactors.
- Never edit a shipped migration — add a new one; it must work on MySQL, PostgreSQL AND SQLite.
- No swallowed errors, no debug prints, no secrets in logs.
- Re-read every edited file after editing; check `git diff`.

## 2. Verify — real output or it did not pass

Run every applicable check in the right workdir and READ the output:

| Part | Command (workdir) |
|---|---|
| Panel backend | `go build ./... && go test ./...` (`panel/backend`) |
| Edge | `go build ./... && go test ./...` (`edge/backend`) |
| Frontend | `npm run build && npm run typecheck && npm run lint` (`panel/frontend`) |
| Instance pages | `python3 tools/pages_lint.py --strict` (repo root) |
| Lint | `golangci-lint run` (`panel/backend`, `edge/backend`) when config present |

Runtime checks:

- Probe first: `curl -s http://localhost:8080/...` — if the panel answers, test against it.
- ONLY when the panel is DOWN: `bash retest.sh` (it kills a running instance; log `/tmp/kspanel-retest/kspanel.log`, stop via `kill $(cat /tmp/kspanel-retest/kspanel.pid)`).
- `bash update.sh` syncs release binaries before test runs when `git status` is dirty.

## 3. Final gate

```bash
bash rebuild.sh
```

Must pass after any edit (frontend build + embed, pagelib/themelib sync, Go builds, `release/kspanel` + `release/ksedge`, `release/version.json`). Read the actual output.

Never hand-edit generated trees: `release/`, `panel/backend/internal/ui/`, `panel/backend/internal/pagelib/library/`, `panel/backend/internal/themelib/library/`.

## 4. Passes & failure engine

- PASS 2 is required for security/auth/migrations/DB models/API contracts/multi-part changes: redo V1–V3 with fresh eyes + rerun checks.
- Any failure: root cause → fix → restart PASS 1. On attempt 5+, isolate via `git diff` / revert the newest change.
- If `map.md` becomes stale because the change moved/added/renamed a main part, update `map.md` in the same task.
- Report per `loop.md` §8: task type, files changed, real check results, security notes, honest gaps.
