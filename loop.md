# KS Panel — Agent Rules

## 0. Paths
- Backend:  /home/runner/work/ks-panel-extreme/ks-panel-extreme/panel/backend
- Frontend: /home/runner/work/ks-panel-extreme/ks-panel-extreme/panel/frontend
- Edge:     /home/runner/work/ks-panel-extreme/ks-panel-extreme/edge/backend
Search only inside the affected part. If the user gives a path, search it FIRST,
then widen within the same part. Never search / or the whole system.

## 1. Plan (before any edit)
1. Classify task: Add | Remove | Fix | Modify | Refactor.
2. Name the affected part(s) and the expected blast radius
   (API? DB model? data format? → then frontend/edge/repository are also in scope).
3. Locate real code by grep, not by guess. Read every file you will touch.
4. Check for duplicate/mirrored files; confirm which one is actually imported/built.
5. Before creating a file, confirm no existing file already does the job.
6. Before deleting, grep all references. Never delete DB migration files.
7. Fix tasks: identify the root cause and state it in one line before editing.
   No symptom hiding, no empty catch, no silent fallback.
8. If the requirement is ambiguous or two valid designs exist → ask, don't guess.

## 2. Edit
- Minimal diff. Only files required by the task. No drive-by refactors,
  no reformatting, no renaming unrelated things.
- Follow existing patterns in the surrounding code.
- Migrations must work on MySQL, PostgreSQL and SQLite (types, defaults,
  ALTER support, indexes, booleans, timestamps). Never edit a shipped migration —
  add a new one.
- Security-sensitive areas (auth, permissions, passwords, sessions, CSRF,
  rate limits, tokens, secrets): fail closed, validate server-side,
  never log/print/return/store secrets or tokens.
- Re-read each file after editing it.

## 3. Verify — CHECKLIST V
Run this full checklist, do not look only at changed lines:
- V1 Trace the full flow input → route → handler → service → repository → DB
     → response → frontend/edge consumer. Both directions.
- V2 Every reference to changed symbols/APIs/types/fields updated (grep to prove it).
- V3 Contracts match across frontend ↔ backend ↔ edge ↔ DB:
     names, casing, nullability, types, status codes, error shapes.
- V4 Imports, error handling, edge cases (empty, null, unauthorized, concurrent).
- V5 No duplicate, dead, conflicting or unreachable code left.
- V6 Implementation matches exactly what the user asked — nothing extra, nothing missing.
- V7 Commands:
     Backend/Edge: go build ./... && go test ./...
     Frontend:     build + typecheck + lint
     Migration:    verify MySQL / PostgreSQL / SQLite compatibility
- V8 Read the REAL command output. Never assume success. Exit code + output or it didn't pass.

## 4. Check passes
- PASS 1: full CHECKLIST V.
- PASS 2: required when the change touches security, auth, migrations, DB models,
  API contracts, or more than one part. Redo V1–V3 independently
  (re-read the files, don't trust pass-1 memory) and rerun V7.
  For a single-file, single-part, non-security change, PASS 2 = rerun V7 + V2.
- Any failure → find the real cause, fix, restart from PASS 1.

## 5. Rebuild
Only after all required passes: bash /home/runner/work/ks-panel-extreme/ks-panel-extreme/rebuild.sh
Read the actual output. Failure → fix root cause → PASS 1 again.

## 6. Report (short)
Task type | Part(s) | Files changed | Root cause (for Fix) |
Checks + real results | Security notes | Assumptions | Rebuild result
State clearly anything you could NOT verify.