# Testing

## Backend/Edge
```bash
go build ./...
go test ./...
```
Run in `panel/backend` or `edge/backend`. Sync binaries first: `bash update.sh`.

## Frontend
```bash
npm run typecheck
npm run lint
npm run build
```

## Migrations
Verify MySQL/Postgres/SQLite compatibility.

## Runtime checks
Probe :8080 first; use `retest.sh` only when panel DOWN. Read logs at
`/tmp/kspanel-retest/kspanel.log`.

## AI docs
`TestAIDocsCoverage` validates aiskills topics/index/enum sync.

## Final
`bash rebuild.sh` must pass.
EOF