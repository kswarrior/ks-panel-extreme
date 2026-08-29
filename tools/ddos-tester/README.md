# KS Panel DDoS Tester (SAFE)

Sends a controlled burst of HTTP requests to the local panel and checks that DDoS protection reacted.

**NOT a real DDoS** — limited concurrency, limited total, localhost only by default.

## Build

```
go run ./tools/ddos-tester --help
go build -o /tmp/ddos-tester ./tools/ddos-tester
```

## Examples

Basic (uses existing Security config, just blasts):
```
/tmp/ddos-tester --target http://127.0.0.1:8080 --requests 700 --concurrency 20
```

Auto-configure low thresholds then blast (recommended for CI):
```
/tmp/ddos-tester --target http://127.0.0.1:8080 --configure --per-minute 30 --requests 80 --concurrency 20 --mode port_switch --alt-port 5050
```

Stop mode:
```
/tmp/ddos-tester --configure --mode stop --per-minute 30 --requests 80 --target http://127.0.0.1:8080
```

## What it checks

- 429 Too Many Requests (per-IP rate limit)
- 503 Service Unavailable (DDoS stop mode)
- TCP dropped connections (DDoSDroppingListener)
- Port switch (primary down, alt up + snapshot ddos_port_switched)

Exit 0 = protection working, 1 = FAILED, 2 = usage.
