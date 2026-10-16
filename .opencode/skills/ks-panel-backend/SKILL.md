---
name: ks-panel-backend
description: Use when adding or changing panel API endpoints, handlers, repositories, DB migrations (MySQL/Postgres/SQLite), permissions, or edge RPC calls in panel/backend. Covers the request flow, layer rules, and required checks.
---

# Panel Backend (panel/backend)

Single Go API server + embedded frontend + edge client. DB: MySQL / PostgreSQL / SQLite. See `map.md` §1 for the full map; this skill is the working checklist.

## Request flow

`internal/api/` (router + middleware: auth, CSRF, rate-limit, headers, validation) → `handlers/<domain>/` → `repository/` → `models/` + `db/` → response. Cross-node work goes through `internal/edge/` (client) to the ksedge agent.

## Rules

- Handlers never write SQL — repository only. One repo per domain.
- New endpoint = handler in `internal/api/handlers/<domain>/` + route wired in `internal/api/`. Check `internal/permissions/` for the authz key and add one if needed (fail closed).
- Migrations live in `internal/db/migrations/{mysql,postgres,sqlite}/` — three files, all in sync, add a NEW numbered migration (never edit a shipped one). Watch types/defaults/indexes/booleans/timestamps across all three engines; `regen.sh` exists in that folder.
- Security: validate server-side, assume hostile input, never log/return secrets or tokens, keep audit rows (activity_logs) consistent with existing handlers.
- Frontend consumer of an API change lives in `panel/frontend/src/features/<domain>/api/` — grep it and update types/calls in the same task.
- AI assistant tools (`ai_chat_handler.go`) re-check the existing permission engine; if a tool calls your endpoint/flow, keep both paths in sync.

## Verify

```bash
cd panel/backend && go build ./... && go test ./...
cd panel/backend && golangci-lint run            # when available
bash rebuild.sh                                   # final gate (embeds frontend + builds release)
```

Runtime: probe `curl localhost:8080` first; `bash retest.sh` ONLY when the panel is down. Test the full flow both directions (route → handler → repo → DB → response → frontend/edge consumer) per `loop.md` CHECKLIST V.
