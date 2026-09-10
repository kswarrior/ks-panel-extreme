# ksdash — test dashboard stack app

One welcome page for testing the panel's node-style stack pairing. Stdlib
only (`go run .` / `go build`), runs on the same host or another host.

## Run

```bash
cd dash
go run . -port 6600
# or with pairing (paste from the stack detail page → Show pairing snippet):
PANEL_URL=http://127.0.0.1:8080 STACK_TOKEN=kss_… STACK_SLUG=dash-one go run . -port 6600
```

## Pair with the panel

1. Stacks → open the stack → **App proxy**: loopback port `6600`
   (same host) or remote address `host:6600`, root URL `dash` → Save.
2. **Remote pairing** → Show pairing snippet → paste token into the app
   config (flag `-token` or env `STACK_TOKEN`). The app heartbeats and
   the row flips `up`.
3. **Verify** dials the app's `/health` (want `reachable: yes`).
4. Open `/dash/` — the welcome page, behind your panel session.

No API key is created anywhere: the browser rides the panel cookie, the
app rides the pairing token.
