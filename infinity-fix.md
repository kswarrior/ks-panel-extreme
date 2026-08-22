# KS PANEL — INFINITE EXECUTION / CONTINUOUS FIX LOOP

You are working on the KS Panel project.

## ABSOLUTE FIRST ACTION

Before doing ANYTHING else, including:

* analyzing the task
* inspecting files
* searching the repository
* running commands
* editing code
* asking questions

you MUST read:

`/test/ks-panel/loop.md`

You must actually read and process the complete file.

Do NOT assume you already know its contents.
Do NOT rely on this prompt instead of `loop.md`.
Do NOT skip any instruction from `loop.md`.

After reading `loop.md`, follow it strictly for the entire task.

---

# PRIMARY RULE

This is an **INFINITE CONTINUOUS EXECUTION LOOP**.

Do NOT stop merely because:

* the requested feature appears implemented
* one test passes
* the build succeeds once
* no obvious error is visible
* you think the task is complete
* you found nothing in one search
* the implementation looks correct
* you have reached a natural stopping point
* you have completed one verification cycle

The loop continues until I manually stop/interupt you.

The ONLY normal termination condition is:

**I manually stop the execution.**

Do not voluntarily terminate the task.

---

# CONTINUOUS LOOP

After reading `loop.md`, continuously perform this cycle:

1. Understand the requested task completely.
2. Inspect the relevant existing implementation.
3. Understand the architecture and relationships between files.
4. Find incomplete, incorrect, broken, inconsistent, unsafe, or suspicious behavior.
5. Fix one discrete issue/component at a time.
6. Immediately read every edited file back.
7. Verify the edit from the actual file contents.
8. Continue investigating related code.
9. Run the required verification at the appropriate phase.
10. Inspect the ACTUAL command output.
11. If anything fails:

    * identify the actual root cause
    * fix it
    * read the modified file again
    * restart the required verification process
12. If everything passes:

    * DO NOT STOP.
    * continue looking for additional bugs, errors, edge cases, inconsistencies, regressions, security problems, type problems, logic errors, UI problems, API problems, build problems, and integration problems.
13. Repeat indefinitely.

---

# DO NOT DECLARE SUCCESS PREMATURELY

Never say:

* "Task complete"
* "Everything is fixed"
* "No more issues"
* "Looks good"
* "Build should pass"
* "Tests should pass"
* "This should work"

unless the required verification has actually been executed and its real output has been inspected.

Even after successful verification, DO NOT stop.

A successful verification means:

**continue investigating.**

---

# ZERO-ASSUMPTION RULE

Never assume:

* a file exists
* a path is correct
* a command succeeded
* a test passed
* a build passed
* a dependency is installed
* an import is valid
* a type is correct
* an API works
* a frontend component works
* a backend endpoint works
* a database migration works
* a generated file is correct
* a previous fix solved the root cause

Everything important must be verified using actual repository contents or actual command output.

---

# FILE NAVIGATION RULE

Follow the repository map and navigation rules in:

`/test/ks-panel/loop.md`

Never perform uncontrolled repository-wide searches.

Use explicit target paths.

Do not start broad searches from `/`.

If a new file is created or an unmapped file is discovered, update the project map immediately as required by `loop.md`.

---

# READ BEFORE EDIT

Before modifying a file:

1. Locate it using the mapped project structure.
2. Read the relevant existing code.
3. Understand its imports, types, callers, dependencies, and behavior.
4. Make the smallest appropriate change.
5. Immediately read the edited file back.
6. Verify the actual contents.

Do not modify multiple unrelated components at once.

---

# BUG HUNTING MODE

Do not only implement the explicitly requested feature.

While working, actively look for:

* compile errors
* runtime errors
* logic errors
* incorrect conditions
* incorrect state handling
* race conditions
* nil/null problems
* type mismatches
* incorrect API contracts
* frontend/backend mismatches
* authentication problems
* authorization problems
* validation problems
* error handling problems
* database problems
* migration problems
* SQL compatibility problems
* resource leaks
* concurrency issues
* security vulnerabilities
* unsafe defaults
* broken edge cases
* inconsistent naming
* dead code
* broken imports
* incorrect paths
* missing error checks
* incorrect HTTP behavior
* incorrect status codes
* malformed responses
* incorrect frontend state
* React/TypeScript problems
* CSS/layout problems
* accessibility problems
* build problems
* dependency problems
* regression risks
* integration problems

When you find a real issue, fix it rather than merely reporting it.

---

# ROOT-CAUSE RULE

Do not patch symptoms when the actual root cause can be determined.

For every discovered failure:

1. Reproduce or verify it.
2. Inspect the actual error/output.
3. Trace it to the root cause.
4. Fix the root cause.
5. Read the changed file again.
6. Re-run the appropriate verification.
7. Inspect the actual result.
8. Continue the loop.

Do not hide failures by weakening tests or suppressing errors.

Do not remove functionality merely to make a test pass.

---

# VERIFICATION RULE

Follow the complete verification procedure in `loop.md`.

In particular, do not replace required verification with assumptions.

When verification is required:

* actually execute the command
* capture its output
* inspect the output
* determine PASS or FAIL from the output
* if FAIL, fix the actual problem
* repeat verification as required

The Twice Check must genuinely contain two consecutive successful verification rounds.

Do not count an unexecuted check as a pass.

Do not count a command that was not inspected as a pass.

---

# FINAL REBUILD RULE

After the required Twice Check has genuinely passed, execute:

`bash /test/ks-panel/rebuild.sh`

Actually inspect the complete output.

If it fails:

1. Find the root cause.
2. Fix only the relevant issue.
3. Read the modified file again.
4. Restart the required Twice Check.
5. Run the rebuild again.
6. Inspect its actual output.
7. Only consider that rebuild successful when the actual output confirms success.

After a successful rebuild:

**DO NOT STOP.**

Return to continuous investigation mode.

---

# INFINITE LOOP STATE MACHINE

Use this mental state machine continuously:

`READ LOOP.MD`
↓
`UNDERSTAND TASK`
↓
`INSPECT CODE`
↓
`FIND ISSUE / IMPLEMENT NEXT PART`
↓
`EDIT ONE COMPONENT`
↓
`READ EDITED FILE`
↓
`VERIFY EDIT`
↓
`CONTINUE INVESTIGATION`
↓
`TWICE CHECK`
↓
`FINAL REBUILD`
↓
`INSPECT RESULT`
↓
`SEARCH FOR MORE PROBLEMS`
↓
`FIX NEXT PROBLEM`
↓
`REPEAT FOREVER`

There is intentionally NO automatic final state.

The loop only ends when I manually interrupt/stop you.

---

# WHEN YOU THINK THERE IS NOTHING LEFT

Never stop just because you cannot immediately see another problem.

Instead:

1. Re-read the relevant requirements.
2. Re-read the relevant implementation.
3. Check callers and dependencies.
4. Check related frontend/backend interactions.
5. Check error paths.
6. Check edge cases.
7. Check security implications.
8. Check types and interfaces.
9. Check tests.
10. Check build configuration.
11. Check database/migration behavior where relevant.
12. Run appropriate verification.
13. Inspect the results.
14. Continue investigating.

If no issue is found in one pass, perform another independent review.

---

# COMMUNICATION RULE

Do not repeatedly ask me for confirmation between implementation steps.

Proceed autonomously.

Only stop and ask me if continuing is genuinely impossible because required information, access, credentials, or an unavoidable external decision is missing.

Do not stop merely because the task is difficult.

Do not stop merely because a command fails.

A failure is a reason to investigate and fix, not a reason to terminate.

---

# IMPORTANT

`/test/ks-panel/loop.md` is the authoritative execution protocol.

This prompt adds the requirement that execution is continuous/infinite.

Therefore:

**READ `loop.md` FIRST.**

**FOLLOW `loop.md` STRICTLY.**

**VERIFY EVERYTHING ACTUALLY.**

**FIND AND FIX ERRORS AND BUGS.**

**DO NOT STOP AFTER SUCCESS.**

**CONTINUE THE LOOP UNTIL I MANUALLY STOP YOU.**
