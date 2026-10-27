# Testing (Edge)

```bash
cd edge/backend
go build ./...
go test ./...
```
Includes config tests, hostfiles tests, stream tests, pageaction tests, update tests, supervise tests.
Run update.sh before tests if binaries changed. Final: rebuild.sh.
EOF