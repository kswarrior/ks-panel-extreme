# Migrations How-To

## Rules
- Never edit a shipped migration. Add a new one in all three engines.
- Keep MySQL/Postgres/SQLite in sync (types, defaults, ALTER support, indexes, booleans, timestamps).
- Naming: `NNN_description.sql` with next number (current max 084).

## Steps
1. Create file in `internal/db/migrations/{mysql,postgres,sqlite}/` with next number.
2. Write dialect-appropriate SQL.
3. Run backend tests; verify all three engines if possible.
4. Seed/backfill logic in `db.go` if needed (permissions/roles).
5. Rebuild.

## Engine differences
- SQLite: limited ALTER; use table rebuild for column changes.
- Postgres: `SERIAL`, `TIMESTAMPTZ`, booleans.
- MySQL: `AUTO_INCREMENT`, `TINYINT(1)` for bool, `DATETIME`/`TIMESTAMP`.
EOF