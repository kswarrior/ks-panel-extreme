# Local Development

## Prerequisites
- Go 1.25+, Node 18+, (optional MySQL/Postgres).
- Repo at `/home/runner/work/ks-panel-extreme/ks-panel-extreme`.

## Backend
```bash
cd panel/backend
go build ./...
go test ./...
# run
go run ./cmd/kspanel launch   # or use retest.sh
```
Default port 5050, DB `./kspanel.db`.

## Frontend
```bash
cd panel/frontend
npm install
npm run dev       # Vite dev server
npm run typecheck # tsc --noEmit
npm run lint      # tsc --noEmit
npm run build     # production build
```

## Full panel (embedded)
Use `retest.sh` to launch panel on :8080 (auto-rebuilds if release missing). `update.sh` syncs
binaries before tests.

## Scope
Stay in affected part; run checks in that part.
EOF