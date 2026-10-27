# Build (Edge)

Built by `rebuild.sh` → `release/ksedge` (+ checksums + version.json). Also:
```bash
cd edge/backend
go build -o ../../release/ksedge ./cmd/ksedge
```
Final gate: `bash rebuild.sh` (builds frontend + syncs + Go builds). Never hand-edit release/.
EOF