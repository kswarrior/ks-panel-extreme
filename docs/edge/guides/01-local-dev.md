# Local Development (Edge)

```bash
cd edge/backend
go build ./...
go test ./...
# run
./ksedge launch --config config.toml
# or
go run ./cmd/ksedge launch
```

Default listen port 4040, heartbeat to http://localhost:5050.

Tests: `go test ./...` in edge/backend. Config tests in `internal/config/config_test.go`.
EOF