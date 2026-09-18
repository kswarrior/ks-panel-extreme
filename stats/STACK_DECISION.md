# Stack decision — 518MB constraint

## Backend: Go 1.25

Reuse `panel/backend/go.mod:1-17` deps: `chi`, `gorilla/websocket`, `modernc.org/sqlite`.
Binary cross-compiles, no Docker needed for low RAM. Panel already proven at 35MB RSS.

```
stats/
  backend/
    go.mod           # module stats, go 1.25
    cmd/server/main.go
    internal/
      ws/handler.go  # WSS /ws heartbeat
      db/sqlite.go   # modernc.org/sqlite, same as panel
      api/handlers.go# owner auth + REST
      geo/maxmind.go
    frontend/dist    # //go:embed — built once, no node_modules on server
```

Build: `go build -ldflags="-s -w" -o stats ./backend/cmd/server` -> 12-18MB

## Frontend: pick one

1. **React+Vite+Tailwind** (if you want consistent with `panel/frontend/vite.config.ts:1`):
   `npm create vite@latest frontend -- --template react-ts` + tailwind + leaflet. Build 1x: `npm run build` -> copied to `backend/internal/ui/dist` same pattern as `panel/frontend/vite.config.ts:22`.

2. **HTMX + Go templates** (if you want lightest, no Node in dev):
   `backend/templates/dashboard.html` + `htmx@1.9` + `tailwindcss` CDN + `leaflet@1.9`.
   No `node_modules` at all, 0 build step. Best for single-owner page.

Bundle sizes: React dist 350KB gz, HTMX 14KB. Both fine for 518MB (served static).

## What NOT to use

- Next.js 15 / Nuxt: requires Node runtime 150-300MB + `node_modules` 200MB+ on server
- Python Django/FastAPI: 100MB+ + pip + gunicorn
- Java/Kotlin: 300MB+ heap minimum

## Deploy on 518MB VPS

```bash
go build -o stats-bin ./backend/cmd/server
./stats-bin --port 9090 --admin-pass $PASS --db ./stats.db
# nginx reverse proxy wss://stats.example.com -> :9090, cert bot
```

No docker, no PM2, single systemd service.
