# KS Panel — DEBUGGING LOOP

Use this together with `loop.md`.

**Goal:** Find and fix every real bug through repeated multi-agent debugging. Never trust an agent's claim without real evidence.

## 1. MAIN LOOP

```text
MAP → SPAWN AGENTS → INVESTIGATE/FIX → VERIFY
→ MAIN AUDIT → FIND NEW BUGS → REPEAT
```

Repeat until a complete audit finds **no actionable defect**.

Never stop because "it looks fixed".

## 2. BEFORE EACH WAVE

```bash
git status
git log --oneline -5
git diff
```

Read the real project structure, entrypoints and existing `loop.md`.

Never guess filenames or edit duplicate/dead implementations.

## 3. SPAWN SPECIALIZED SUB-AGENTS

Create independent agents for the relevant parts:

```text
Backend
Frontend
Edge/Panel
AI/Models/Loop
API/Integration
Database/Persistence
Security
Performance/Resources
Build/Release
Tests/Failure Hunting
Fresh-Eyes Auditor
```

Give each agent a narrow scope.

Agents may **inspect, reproduce, fix and test** their assigned problems.

Do not let multiple agents edit the same critical files simultaneously.

## 4. EACH AGENT MUST

```text
FIND → REPRODUCE → ROOT CAUSE → FIX → TEST
```

Check for:

* crashes/errors
* race conditions/deadlocks
* memory/resource leaks
* broken state/lifecycle
* bad API contracts
* edge/panel behavior
* model failures/timeouts/retries
* persistence bugs
* security issues
* performance problems
* duplicate/dead/conflicting code
* build/release failures

No:

```text
"probably fixed"
"looks good"
"should work"
```

Evidence only.

## 5. AGENT REPORT

```text
BUG:
ROOT CAUSE:
EVIDENCE:
FIX:
FILES:
TESTS:
EXIT CODES:
UNVERIFIED:
```

## 6. MAIN AGENT AUDIT

After all agents finish, the MAIN AGENT must independently:

```text
review every change
→ inspect git diff
→ trace affected flows
→ check frontend ↔ backend ↔ edge ↔ DB/API contracts
→ check agent fixes for regressions
→ run build/tests/typecheck/lint
→ run real runtime/panel checks
→ check AI/model/loop behavior
→ perform security + resource review
```

Assume every sub-agent can be wrong.

## 7. SECOND-ORDER CHECK

After fixing bugs, actively search for bugs **created by the fixes**:

```text
new race?
new duplicate request?
new state bug?
broken caller?
bad cancellation?
startup/restart failure?
model failure handling?
resource leak?
API mismatch?
```

## 8. FAILURE LOOP

Any failure:

```text
FAIL
 ↓
reproduce
 ↓
root cause
 ↓
fix
 ↓
FULL VERIFY
 ↓
START NEW DEBUG WAVE
```

Do not only rerun the failed test.

## 9. HARD PROBLEMS

If the same bug survives repeated attempts:

```text
STOP PATCHING
→ create fresh investigation agent
→ re-read actual code
→ reproduce from scratch
→ find the wrong assumption
→ redesign the fix
→ verify again
```

## 10. EXIT CONDITION

Stop only when:

```text
No known P0/P1 bugs
Build PASS
Tests PASS
Runtime PASS
Critical panel flows PASS
Backend/Frontend/Edge contracts PASS
AI/Loop PASS
Security PASS
Fresh-eyes audit PASS
Final diff reviewed
```

Otherwise start another wave.

**There is no fixed number of waves.**

```text
MAIN
 ↓
AGENTS
 ↓
FIX
 ↓
VERIFY
 ↓
MAIN AUDIT
 ↓
NEW BUG?
 ├─ YES → NEW WAVE
 └─ NO  → FINAL VERIFY
```

Final status must be:

`NO KNOWN ACTIONABLE DEFECTS FOUND IN VERIFIED SCOPE`

Never claim `BUG FREE`.
