# ./stats - Private Panel Telemetry

Owner-only dashboard. Panels dial WSS -> stats on startup (if configured), stats shows map + list of all running panels.

## Recommended Stack for 518MB

**Backend: Go 1.25 (same as `panel/backend/go.mod:3`)**
- Single static binary `~12-18MB` (panel is `panel/backend/release/kspanel:25M`, `release/kspanel:47M`)
- RSS idle `20-35MB` verified: `ps aux` shows `./kspanel launch --port 8080` at `35972 KB` (~35MB)
- No runtime, no GC pressure. Handles 500+ concurrent WSS on 30MB.
- Reuse `modernc.org/sqlite v1.39.0` (pure Go, no CGO) + `github.com/gorilla/websocket` already in panel.
- Embed frontend via `//go:embed` -> one binary to deploy.

Why not Node/Python/Java: Node idle 120-250MB + heap spikes, Python FastAPI 100-180MB + pip, Java Spring 300MB+ heap — all too heavy for 518MB VPS. Rust is leaner but dev cost higher and no reuse of panel code.

**Frontend: Vite + React + Tailwind (reuse) OR Svelte/HTMX for ultra-light**

Option A (recommended for team): `panel/frontend/package.json:1-11` stack — `vite@5.4`, `react@18.3`, `tailwind@3.4`. Build to `frontend/dist` ( ~300-500KB gz), served as static files by Go embed. Zero Node at runtime, no `node_modules` (278M) on server.

Option B (absolute minimal): Go `html/template` + HTMX + Tailwind CDN + Leaflet for map. No build step, <20KB JS, even less disk/RAM. Good if stats has 1 page only.

Avoid Next.js/Angular/Nuxt — requires Node SSR at runtime ( 100MB+ extra).

### Resource budget on 518MB VPS

| Component | Disk | RAM idle | RAM 500 panels |
|-----------|------|----------|----------------|
| Go stats binary | 15MB | 20-30MB | 45-60MB |
| SQLite DB | 1-50MB | 0 (mmap) | 0 |
| Frontend dist | 1MB | 0 (embedded) | 0 |
| OS + spare | - | 450MB free | 440MB free |

Total <60MB — fits 256MB VPS even. Node alt would be 180MB idle + fails.

## Architecture
```
[Panel] --wss://stats.yourdomain.com/ws?token=PSK--> [stats backend Go]
  on startup + every 30s: {panel_id, version, hostname, ip, geo, uptime, cpu%, mem%, nodes, instances, players}
                                                        |
                                                   [SQLite]
                                                        |
                                              [Owner Dashboard /]
                                          auth: ADMIN_PASSWORD bcrypt + cookie
                                          pages: Map (Leaflet), Table, Detail (sparkline)
```

Panel side: add `stats.url` + `stats.token` to `panel/backend/internal/config`. On `panel/backend/internal/api/server.go` startup, goroutine dials WSS if configured, reconnect with backoff.

Stats side: `WSS /ws` validates `token` (per-panel PSK), inserts/updates `panels` table. `GET /api/panels` owner-only. No public signup.

Geo: `ip` from `X-Forwarded-For` or WSS remote addr -> MaxMind GeoLite2 mmdb (5MB) or free `ip-api.com` cache.
