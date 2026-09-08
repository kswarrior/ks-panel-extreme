#!/bin/bash
# Wave-2 repro: every ON CONFLICT upsert in the allowed files is a MySQL syntax error.
# MySQL supports only INSERT ... ON DUPLICATE KEY UPDATE; ON CONFLICT is
# SQLite/Postgres-only. Exit 1 if any such site remains (bug present).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FILES=(
  "panel/backend/internal/repository/settings_repo.go"
  "panel/backend/internal/repository/user_auth_repo.go"
  "panel/backend/internal/repository/role_auth_repo.go"
  "panel/backend/internal/repository/security_repo.go"
  "panel/backend/internal/repository/authority_repo.go"
  "panel/backend/internal/modengine/storage.go"
)
found=0
for f in "${FILES[@]}"; do
  hits=$(grep -n "ON CONFLICT" "$ROOT/$f" | grep -vE "^[0-9]+:[[:space:]]*(//|\*)" | grep -c "" || true)
  echo "$f: ON CONFLICT code hits=$hits"
  grep -n "ON CONFLICT" "$ROOT/$f" | grep -vE "^[0-9]+:[[:space:]]*(//|\*)" || true
  found=$((found + hits))
done
if [ "$found" -gt 0 ]; then
  echo "REPRO: $found MySQL-incompatible ON CONFLICT upsert site(s) present -> BUG REPRODUCED"
  exit 1
else
  echo "OK: no ON CONFLICT upsert sites remain in wave-2 scope"
  exit 0
fi
