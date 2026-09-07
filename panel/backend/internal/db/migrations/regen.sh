#!/usr/bin/env bash
# regen.sh — re-derive postgres/ and mysql/ migration files from sqlite/.
# Idempotent. Run from internal/db/migrations/.
#
# MySQL gate for NEW files: ./regen.sh check <sqlite-file>...
# The Go runner (internal/db/db.go: rewriteTextColumnDefsForMySQL and
# friends) rewrites shipped hostile DDL at apply time because shipped
# migrations are frozen, but every NEW sqlite migration must be authored
# MySQL-safe up front (like 069_api_key_requests.sql: no TEXT DEFAULT,
# no TEXT UNIQUE/PK, no bare key/trigger identifiers, FK types matching
# the referenced PK). The check fails loudly (exit 1, file:line) so a
# hostile new file never reaches a live MySQL 8 host. The default regen
# path is unchanged and stays green on the frozen corpus.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ "${1:-}" = "check" ]; then
    shift
    fail=0
    for f in "$@"; do
        # Strip -- comments so prose mentioning keywords never fires.
        code=$(grep -v '^[[:space:]]*--' "$f" || true)
        lineno=0
        while IFS= read -r line; do
            lineno=$((lineno+1))
            upper=$(printf '%s' "$line" | tr '[:lower:]' '[:upper:]')
            case "$upper" in
                *TEXT*DEFAULT*|*DEFAULT*TEXT*)
                    echo "FAIL $f:$lineno: TEXT with DEFAULT (MySQL 1101): $line" >&2; fail=1 ;;
            esac
            case "$upper" in
                *TEXT*UNIQUE*|*UNIQUE*TEXT*)
                    echo "FAIL $f:$lineno: TEXT with UNIQUE (MySQL 1170): $line" >&2; fail=1 ;;
            esac
            case "$upper" in
                *TEXT*PRIMARY*KEY*|*PRIMARY*KEY*TEXT*)
                    echo "FAIL $f:$lineno: TEXT PRIMARY KEY (MySQL 1170): $line" >&2; fail=1 ;;
            esac
        done <<< "$code"
        # Bare key/trigger identifiers (MySQL reserved words, 1064). Strip
        # string literals first so prose like 'API key' never fires; \< \>
        # are GNU word anchors so key_hash / keyboard stay silent. PRIMARY /
        # FOREIGN / UNIQUE KEY phrases are key specifications, not columns.
        nolits=$(printf '%s' "$code" | sed -e "s/''/__ESC__/g" -e "s/'[^']*'//g")
        if printf '%s' "$nolits" | grep -nEi '\<(key|trigger)\>' | grep -viE 'primary key|foreign key|unique key' >&2; then
            echo "FAIL $f: bare key/trigger identifier (MySQL 1064, quote or rename)" >&2; fail=1
        fi
    done
    if [ "$fail" -ne 0 ]; then exit 1; fi
    echo "check OK: $*"
    exit 0
fi

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
        -e 's/^ALTER TABLE[[:space:]][[:space:]]*([a-zA-Z_]+)[[:space:]][[:space:]]*ADD COLUMN[[:space:]][[:space:]]*([a-zA-Z_]+)/ALTER TABLE \1 ADD COLUMN IF NOT EXISTS \2/' \
        -e 's/DATETIME/TIMESTAMP/g' \
        -e 's/\<BLOB\>/BYTEA/g' \
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
