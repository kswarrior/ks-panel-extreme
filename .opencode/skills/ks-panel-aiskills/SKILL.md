---
name: ks-panel-aiskills
description: Use when editing the panel AI assistant skill guides in panel/backend/internal/aiskills/*.md, adding a get_docs topic, or touching the AI chat tool/docs contract. Enforces the ~3.2KB size cap, Topics/index/enum synchronization, and TestAIDocsCoverage.
---

# Panel AI Skills (aiskills bundle)

`panel/backend/internal/aiskills/*.md` are embedded into the panel binary (`go:embed`) and served to the built-in AI assistant through its `get_docs` tool. Each file doubles as a readable repo doc. Plan of record: `plan/ai.md`.

## Hard contract

- One file per topic; each guide is 3+ sentences AND under ~3.2KB (tool results are capped at 4000 chars before reaching the model — longer content is cut mid-playbook).
- `index` is the fallback for unknown/blank topics; unknown topics must resolve to the index, never an error.
- Never document tools, permissions or flows that do not exist in `panel/backend/internal/api/handlers/ai_chat_handler.go`.

## Adding or renaming a topic — update EVERY place

1. New guide: `panel/backend/internal/aiskills/<topic>.md`.
2. `Topics` slice in `panel/backend/internal/aiskills/aiskills.go`.
3. `get_docs` topic enum string in `panel/backend/internal/api/handlers/ai_chat_handler.go` (search `"get_docs"`, ~line 965).
4. `index.md` bullet list (topic name + one-line playbook summary).
5. `TestAIDocsCoverage` topic slice in `panel/backend/internal/api/handlers/ai_chat_extra_test.go`.

Never rename `.md` files without updating the embed-dependent references above; the embedded FS is compiled, not read from disk.

## Facts that must stay true in guides

- Read tools need the AI Chat Tools grant; writes need AI Chat Writes + the area permission + the global writes switch.
- Every write returns a confirmation ticket the user approves in the UI before anything executes (DB-backed, 10-minute, user-bound).
- Guards: per-user rate limit 20/min, max 5 tool loops, 110 s outer timeout; secret-ish keys are redacted from tool output.
- Deliberately unoffered (do not promise): API keys, shell/terminal + file writes, role permission editing, mod/application uploads, backup execution + datamove.

## Verify

```bash
cd panel/backend && go test ./internal/aiskills/... ./internal/api/handlers/...
bash rebuild.sh   # re-embeds the bundle into the binary
```
