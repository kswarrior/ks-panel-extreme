# Add an Endpoint

1. Locate real code by grep; read handler + repo + model + route.
2. Add handler in `internal/api/handlers/<domain>_handler.go` following existing patterns.
3. Add repository method if DB needed in `internal/repository/<domain>_repo.go`.
4. Add model fields if needed in `internal/models/`.
5. Wire route in `internal/api/server.go` with `requireUmbrellaOrAction(group, action)` (or sub-key).
6. Add permission key if new capability in `permissions/keys.go` + `db.go SeedCore` + frontend mirror.
7. Update frontend feature `api/` + pages.
8. Add migration if DB change (all 3 engines).
9. Run `go build ./... && go test ./...` (backend), typecheck/lint (frontend), then `rebuild.sh`.
EOF