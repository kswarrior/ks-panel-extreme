# INFINITY FIX — Never-Stop Protocol

## 0. THE ONE LAW
The agent NEVER stops on its own. Ever.
No "task complete", no "let me know if you need anything else", no
"shall I continue?", no summary-then-idle. When one cycle ends, the next
cycle starts IMMEDIATELY. The ONLY thing that can stop this loop is the
USER saying STOP (stop / halt / pause / enough). Silence from the user
means: KEEP GOING. Everything is permitted inside this loop except
stopping and breaking the repo.

## 1. Source Rules
loop.md is always in force. Every fix runs through it:
Plan (§1) → Edit (§3) → CHECKLIST V (§4) → Passes (§5) → Rebuild (§7).
Infinity means RELENTLESS, not reckless. No drive-by changes, no edits
without passing checks. A change that fails checks gets fixed via THE
LOOP failure engine (loop.md §6) — the iteration ladder has NO top rung.

## 2. THE ETERNAL CYCLE (repeat forever, in order)
CYCLE N+1 begins the moment CYCLE N ends. No pause between cycles.

1. ORIENT
   - git status + git log --oneline -5 — confirm clean known base.
   - Re-read loop.md and infinity-fix.md (rules drift-check).
2. SCAN (find what needs fixing — search until something real is found)
   - Run the REAL commands: go build ./... , go test ./... ,
     frontend build + typecheck + lint (backend, frontend, edge).
   - Grep for: compile/test/lint failures, TODO/FIXME/HACK, empty catch,
     swallowed errors, dead/duplicated code, stale references,
     contract mismatches frontend ↔ backend ↔ edge ↔ DB,
     security holes (V9 list), missing input validation, leaked secrets.
   - Check recent changes (`git diff`) for anything unfinished.
3. SELECT
   - Pick the highest-priority REAL issue found. Order:
     build break > test fail > security hole > data-loss bug >
     functional bug > contract mismatch > lint/cleanup.
   - NOTHING found? → go to step 6 (DEEP PASS). Do NOT invent fake work,
     do NOT refactor for fun, do NOT touch unrelated code. Scan deeper instead.
4. FIX (via loop.md, full discipline)
   - State root cause in one line. Plan. Minimal diff. Edit.
   - Reproduce first for bugs; prove zero dangling refs for removals;
     identical behavior for refactors (loop.md §2 protocols).
5. VERIFY + PROVE
   - Full CHECKLIST V (V1–V10). PASS 2 if required by loop.md §5.
   - bash rebuild.sh — read ACTUAL output.
   - Panel needed running? → bash retest.sh, read output + tail log.
   - ANY red → loop.md §6 failure engine → back to step 4. Repeat until green.
   - Green? → report one line (what was fixed, checks passed) → go to step 2.
6. DEEP PASS (reached ONLY when scans find nothing — still NOT allowed to stop)
   Rotate depth, one focus per pass, verify-only unless a real defect appears:
   - Pass A: full flow trace V1 on core routes, both directions.
   - Pass B: security audit (V9): injection, authz, IDOR, CSRF, secrets,
     rate limits, session handling.
   - Pass C: edge cases (V4): empty/null/huge/concurrent inputs on key handlers.
   - Pass D: contract audit (V3): frontend ↔ backend ↔ edge ↔ DB shapes.
   - Pass E: migrations × MySQL/PostgreSQL/SQLite compatibility.
   Then run builds/tests/rebuild again to confirm still green, and start
   the next cycle at step 2. A clean repo is scanned AGAIN, forever.

## 3. ANTI-STOP RULES (absolute)
- NEVER end a response with a question about continuing.
- NEVER say "all done", "nothing left", or treat emptiness as an exit.
- "Everything works" is a SCANNING RESULT, not a stopping reason.
- Tiredness, length, repetition, "this seems enough" — invalid reasons.
- Each cycle MUST produce evidence of life: command output, grep proof,
  a fix, or a completed deep-pass verification with real results.
- Blocked by environment (missing credentials/service)? Report exact
  blocker + evidence, then CONTINUE scanning other areas. Stop nothing.

## 4. STOP CONDITIONS (the complete list)
1. The USER explicitly says stop / halt / pause.
That is the entire list. Anything else → return to §2 step 2.

## 5. Cycle Log (one line per cycle, in the response, every cycle)
`CYCLE n | target | action | checks (real exit codes) | result`
