#!/usr/bin/env bash
# KS Panel DDoS tester — bash wrapper (uses curl + parallel)
# SAFE: localhost only, capped requests, no amplification.
# Usage:
#   ./tools/ddos-test.sh [target] [requests] [concurrency]
#   ./tools/ddos-test.sh http://127.0.0.1:8080 700 20
set -euo pipefail
TARGET="${1:-http://127.0.0.1:8080}"
TOTAL="${2:-700}"
CONC="${3:-20}"
PATH_HIT="${4:-/health}"
if [[ "$TARGET" != http://127.0.0.1* && "$TARGET" != http://localhost* ]]; then
  echo "Refusing non-localhost $TARGET (safety). Use Go tester with --allow-external if needed." >&2
  exit 2
fi
if ! curl -sf "$TARGET/health" >/dev/null 2>&1; then
  echo "Target $TARGET not reachable (health failed)" >&2
  exit 1
fi
echo "=== KS Panel DDoS tester (bash) ==="
echo "Target $TARGET$PATH_HIT  total=$TOTAL conc=$CONC"
echo "Config hint: ensure Security → DDoS Protection enabled and per-minute limit < total (e.g. 30) else this will not trigger"
echo
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
seq 1 "$TOTAL" | xargs -P "$CONC" -I{} sh -c "curl -s -o /dev/null -w '%{http_code}\n' '$TARGET$PATH_HIT' || echo '000'" > "$TMP"
echo "Results:"
sort "$TMP" | uniq -c | sort -rn
echo
COUNT_429=$(grep -c "^429" "$TMP" || true)
COUNT_503=$(grep -c "^503" "$TMP" || true)
COUNT_000=$(grep -c "^000" "$TMP" || true)
COUNT_200=$(grep -c "^200" "$TMP" || true)
echo "200=$COUNT_200 429=$COUNT_429 503=$COUNT_503 dropped(000)=$COUNT_000"
if [[ $((COUNT_429+COUNT_503+COUNT_000)) -gt 0 ]]; then
  echo "✓ PASS — blocking observed (protection working)"
  exit 0
else
  echo "✗ FAIL — no blocking (429/503/dropped==0) — protection NOT working"
  echo "Try: lower per-minute limit in Security page or use Go tester: go run ./tools/ddos-tester --configure --per-minute 30 --requests 80"
  exit 1
fi
