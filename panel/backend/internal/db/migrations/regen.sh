#!/usr/bin/env bash
# regen.sh — re-derive postgres/ and mysql/ migration files from sqlite/.
# Idempotent. Run from internal/db/migrations/.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SRC=sqlite
PG=postgres
MY=mysql
mkdir -p "$PG" "$MY"

# transform_postgres emits the Postgres dialect from SQLite source on stdin.
# The INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING conversion is
# line-scoped (only the INSERT-line gets the trailing DO NOTHING; every
# other line ending in ';' keeps its semicolon).
transform_postgres() {
    sed -E \
        -e 's/^PRAGMA foreign_keys *=.*//' \
        -e 's/INTEGER PRIMARY KEY AUTOINCREMENT/SERIAL PRIMARY KEY/g' \
        -e 's/^INSERT OR IGNORE INTO ([a-zA-Z_]+) (.*);[[:space:]]*$/INSERT INTO \1 \2 ON CONFLICT DO NOTHING;/' \
        -e 's/^ALTER TABLE ([a-zA-Z_]+) ADD COLUMN ([a-zA-Z_]+)/ALTER TABLE \1 ADD COLUMN IF NOT EXISTS \2/' \
        -e 's/DATETIME/TIMESTAMP/g' \
        -e '/^-- SQLite has no/d' \
        -e '/^-- SQLite doesn/d' \
        -e '/^-- SQLite exposes/d' \
        -e '/stripAlterEngineVersion/d'
}

transform_mysql() {
    sed -E \
        -e 's/^PRAGMA foreign_keys *= *ON;/SET FOREIGN_KEY_CHECKS=1;/' \
        -e 's/^PRAGMA foreign_keys *= *OFF;/SET FOREIGN_KEY_CHECKS=0;/' \
        -e 's/INTEGER PRIMARY KEY AUTOINCREMENT/BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY/g' \
        -e 's/^INSERT OR IGNORE INTO/INSERT IGNORE INTO/' \
        -e 's/^CREATE INDEX IF NOT EXISTS /CREATE INDEX /' \
        -e '/^-- SQLite has no/d' \
        -e '/^-- SQLite doesn/d' \
        -e '/^-- SQLite exposes/d' \
        -e '/stripAlterEngineVersion/d'
}

count=0
for f in "$SRC"/*.sql; do
    base=$(basename "$f")
    transform_postgres < "$f" > "$PG/$base"
    transform_mysql    < "$f" > "$MY/$base"
    count=$((count+1))
done

# 020_mod_v2.sql: strip the bare `ALTER TABLE mods ADD COLUMN engine_version`
# so the file body doesn't fail when exec'd after the Go-side guard runs.
for eng in postgres mysql; do
    if [ -f "$eng/020_mod_v2.sql" ]; then
        grep -v 'ALTER TABLE mods ADD COLUMN engine_version' "$eng/020_mod_v2.sql" > "$eng/020_mod_v2.sql.tmp" \
            && mv "$eng/020_mod_v2.sql.tmp" "$eng/020_mod_v2.sql"
    fi
done

echo "Generated $count files each in postgres/ and mysql/."
