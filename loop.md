# KS Panel — Agent Rules (THE LOOP)

Non-negotiable core: NO task is done until every required check passes with REAL,
read output. If a check fails → root cause → fix → restart PASS 1. There is no
"done with warnings". There is no "probably works". Exit code + output or it didn't pass.
This loop repeats as many times as needed. Giving up is not an option; being blocked
requires written proof of exactly what is blocked and why.

## 0. Paths & Scope Discipline
- Backend:  /home/runner/work/ks-panel-extreme/ks-panel-extreme/panel/backend
- Frontend: /home/runner/work/ks-panel-extreme/ks-panel-extreme/panel/frontend
- Edge:     /home/runner/work/ks-panel-extreme/ks-panel-extreme/edge/backend
- Search only inside the affected part. User-given path FIRST, then widen within
  the same part. Never search / or the whole system.
- Before touching anything: `git status` + `git log --oneline -5` — know the base state
  so any damage can be reverted precisely.

## 1. Plan (before ANY edit)
1. Classify task: Add | Remove | Fix | Modify | Refactor | Multi.
   Multi = run the matching protocol (§2) for each sub-task independently.
2. Name affected part(s) and expected blast radius
   (API? DB model? data format? → frontend/edge/repository are also in scope).
   Blast radius defines which consumers must appear in CHECKLIST V tracing.
3. Locate real code by grep, not by guess. Read EVERY file you will touch,
   fully — imports, callers, tests, migrations, config.
4. Check for duplicate/mirrored files; confirm which one is actually imported/built
   (grep import paths; check build entrypoints). Editing the wrong twin = wasted pass.
5. Before creating a file: prove no existing file does the job.
6. Before deleting: grep ALL references (code, templates, configs, docs, tests).
   Never delete DB migration files. Never delete files referenced by build scripts.
7. Fix tasks: state the ROOT CAUSE in one line before editing.
   No symptom hiding, no empty catch, no silent fallback, no "try/catch around it".
8. Ambiguity or two valid designs → ask, don't guess. A wrong guess costs a full loop.
9. Write a mini plan (files to touch, expected behavior after change, how you will verify).
10. Risk triage: does the change touch security/auth/migrations/API contracts/
    multiple parts? → PASS 2 mandatory (§5).

## 2. Task Protocols
- ADD: locate insertion points by reading real call sites → implement following existing
  patterns → wire ALL layers the feature crosses → add/adjust tests where they exist →
  verify end-to-end via CHECKLIST V.
- REMOVE: grep all references → confirm nothing depends on it (incl. frontend/edge
  consumers, config keys, DB columns) → remove in dependency order (consumers first,
  definition last) → prove zero dangling references by grep returning empty.
- FIX: REPRODUCE first (command/log/test that shows the bug). No reproduction possible
  → construct the strongest reasoning chain from evidence. Root cause → minimal fix →
  re-run the reproducer → must now pass → regression-check neighbors (V4/V5).
- MODIFY: understand current behavior fully BEFORE changing it → change → prove new
  behavior correct AND old behavior intentionally replaced (no half-old/half-new states).
- REFACTOR: behavior must be IDENTICAL. Prove it: capture behavior (tests/output)
  before, compare after. No logic drift allowed inside refactors.

## 3. Edit Rules
- Minimal diff. Only files required by the task. No drive-by refactors, no reformatting,
  no renaming unrelated things.
- Follow existing patterns in surrounding code (naming, error style, framework idioms).
- Migrations must work on MySQL, PostgreSQL and SQLite (types, defaults, ALTER support,
  indexes, booleans, timestamps). Never edit a shipped migration — add a new one.
- Security-sensitive areas (auth, permissions, passwords, sessions, CSRF, rate limits,
  tokens, secrets): fail closed, validate server-side, never log/print/return/store
  secrets or tokens. Assume every input hostile.
- Concurrency: shared state → ask "what if two requests do this simultaneously?"
- Error handling: every new error path returns a meaningful, non-leaking error.
  No swallowed errors anywhere.
- Re-read each file AFTER editing it. Verify the diff matches intent exactly (`git diff`).

## 4. Verify — CHECKLIST V (full, every pass, not just changed lines)
- V1 Trace the full flow input → route → handler → service → repository → DB
     → response → frontend/edge consumer. BOTH directions.
- V2 Every reference to changed symbols/APIs/types/fields updated
     (grep to PROVE it: show the search returned nothing stale).
- V3 Contracts match across frontend ↔ backend ↔ edge ↔ DB:
     names, casing, nullability, types, status codes, error shapes.
- V4 Imports, error handling, edge cases (empty, null, unauthorized, concurrent, huge input).
- V5 No duplicate, dead, conflicting or unreachable code left.
- V6 Implementation matches EXACTLY what the user asked — nothing extra, nothing missing.
- V7 Commands (run them, don't assume):
     Backend/Edge: go build ./... && go test ./...
     Frontend:     build + typecheck + lint
     Migration:    verify MySQL / PostgreSQL / SQLite compatibility
     Runtime:      ANY check needing the panel RUNNING (endpoints, login,
                   seed data, edge wiring) → bash /home/runner/work/
                   ks-panel-extreme/ks-panel-extreme/retest.sh
                   (auto-runs rebuild.sh if release/kspanel missing; stops old
                   instances; launches panel on :8080, custom port as arg 1;
                   logs: /tmp/kspanel-retest/kspanel.log; stop: kill $(cat
                   /tmp/kspanel-retest/kspanel.pid)). Read output + tail the log.
- V8 READ the REAL command output. Exit code + output or it didn't pass.
     A green assumption is a red failure.
- V9 Security pass on touched surfaces: injection, authz gaps, secret exposure,
     open redirects, mass assignment, IDOR on new endpoints.
- V10 Consistency pass: new code follows the file's/part's established conventions;
     no TODO/FIXME/debug prints left behind.

## 5. Passes
- PASS 1: full CHECKLIST V (V1–V10).
- PASS 2: REQUIRED when the change touches security, auth, migrations, DB models,
  API contracts, or more than one part. Redo V1–V3 INDEPENDENTLY (re-read the files,
  fresh eyes, don't trust pass-1 memory) and rerun V7. For single-file, single-part,
  non-security changes: PASS 2 = rerun V7 + V2.
- Any failure → real cause → fix → restart PASS 1. Partial credit does not exist.

## 6. THE LOOP — Failure Engine (this is what makes it work every time)
When any check fails or the build breaks, enter the loop. Do NOT patch blindly.
Iteration ladder:
- Attempt 1–2: targeted fix of the identified root cause. Rerun the failed command first
  to see the CURRENT error (it may have moved).
- Attempt 3–4: STOP trusting your model of the code. Re-read the actual files end-to-end.
  Question assumptions: wrong file (duplicates §1.4)? stale build cache? missed consumer?
  Wrong layer of the fix?
- Attempt 5+: isolate minimally — `git diff` review of everything changed this session;
  bisect by reverting the most recent change to confirm which edit broke it; then
  re-apply differently. Reduce the problem to the smallest failing case.
- Every iteration: name the previous attempt, why it failed, what differs now.
  Repeating the same failing action counts as failure of process, not bad luck.
- Hard rule: NEVER widen scope silently. If the true fix requires touching outside the
  blast radius, say so explicitly and update the plan (back to §1), then proceed.
- Truly blocked (missing credentials/env/service): stop, report exact blocker + evidence
  + what would unblock it. That is the ONLY exit other than success.

## 7. Rebuild
Only after all required passes:
bash /home/runner/work/ks-panel-extreme/ks-panel-extreme/rebuild.sh
Read the ACTUAL output. Failure → root cause → THE LOOP → PASS 1 again.

## 8. Report (short, honest)
Task type | Part(s) | Files changed | Root cause (for Fix) |
Checks run + REAL results (exit codes) | Security notes | Assumptions |
Iterations through THE LOOP | Rebuild result.
State clearly anything you could NOT verify. An honest gap beats a fake green.
