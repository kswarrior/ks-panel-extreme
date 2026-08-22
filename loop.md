KS Panel Development Rules

1. First understand the task.
   Classify it as: Add, Remove, Fix, Modify, or Refactor/Rename/Move.

2. Identify which part of the project is affected:
   - Backend: /test/ks-panel/panel/backend
   - Frontend: /test/ks-panel/panel/frontend
   - Edge: /test/ks-panel/edge/backend

3. Always search with find/search inside the correct project folder.

4. If the user gives a path, search that path FIRST.
   Example:
   User says: frontend/src/pages/
   Search first in:
   /test/ks-panel/panel/frontend/src/pages/

5. If the file/code is not found there, search wider inside the same project part.
   Never search the whole system or /.

6. Before creating a new file, check whether an existing file already does the same job.

7. Before deleting anything, search for all references/usages first.
   Never delete old database migration files.

8. For a Fix task, find the real cause before changing code.
   Do not only hide the error.

9. Before editing, check for duplicate or mirrored files.
   Confirm which file is actually used.

10. Database migrations must be kept compatible across:
    MySQL, PostgreSQL, and SQLite.

11. If backend code changes an API, database model, or data format,
    check the related repository, API, frontend, or edge code too.

12. Be extra careful with:
    authentication, permissions, passwords, sessions, CSRF, security,
    rate limits, tokens, and secrets.

13. Never print, log, expose, or save passwords, tokens, secrets,
    or sensitive authentication information.

14. Edit only the files needed for the task.
    Do not make unrelated changes.

15. After editing a file, read it again and check that the change is correct.

16. Never assume a command, test, build, or fix succeeded.
    Check the actual command output.

17. After all changes, do a First Check:
    review the changed files, code, references, and requirements.

18. Run the required checks for the changed part:
    - Backend: go test ./... and go build ./...
    - Frontend: available build, TypeScript, and lint checks
    - Edge: go test ./... and go build ./...
    - Migration: check MySQL, PostgreSQL, and SQLite compatibility

19. After the first checks pass, do a Second Check.
    In BOTH checks, do not only inspect the changed lines.

    FIRST CHECK:
    - Read ALL files related to the task.
    - Understand how the complete feature works.
    - Trace the full flow from input to output.
    - Check all related functions, components, APIs, models, repositories,
      database queries, types, routes, and frontend/edge connections.
    - Compare related files and confirm they match.
    - Check imports, references, data flow, error handling, and behavior.
    - Look for duplicate, conflicting, missing, or broken code.
    - Verify the implementation matches the user's request.

    SECOND CHECK:
    - Read ALL relevant files AGAIN.
    - Understand the complete flow AGAIN from start to end.
    - Independently compare the implementation with related files.
    - Compare frontend ↔ backend ↔ edge ↔ database where applicable.
    - Re-check every reference, function, API contract, type, query,
      route, component, and data flow affected by the change.
    - Confirm there are no inconsistencies, missing updates, regressions,
      duplicate logic, broken references, or unintended behavior.
    - Run the required tests/builds/checks AGAIN.

    Do not declare the task complete unless BOTH checks pass and
    the full related code flow has been read, understood, and compared.

20. Only after TWO successful checks, run:
    bash /test/ks-panel/rebuild.sh

21. Check the real rebuild output.
    Do not assume rebuild succeeded.

22. If any check or rebuild fails:
    find the real cause, fix it, and repeat the required checks.

23. Task is complete only when:
    - required checks pass
    - second check passes
    - rebuild succeeds
    - no unrelated files were changed

24. Final response must briefly report:
    - Task type
    - Part changed
    - Files changed
    - Checks performed and results
    - Security-sensitive changes, if any
    - Assumptions, if any
    - Final rebuild result