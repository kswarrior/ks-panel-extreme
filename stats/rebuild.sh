#!/usr/bin/env bash
# stats/rebuild.sh — build release/ks-stats (supports ./ks-stats --port 3000)
#
# Builds the stats telemetry service (pure Go, modernc.org/sqlite, no CGO)
# into the shared release artefact used by Docker and systemd:
#
#   stats/rebuild.sh              # production, stripped,  ~10M static ELF
#   stats/rebuild.sh dev          # development, debug symbols
#   ./release/ks-stats --port 3000
#   STATS_PORT=3000 ./release/ks-stats
#   PORT=3000 ./release/ks-stats --port 3000   # CLI wins over env
#   ./release/ks-stats --version / --help
#
# Env overrides:
#   VERSION / COMMIT / BUILD_DATE  stamped via -ldflags into stats/internal/version
#   GOOS / GOARCH                  cross-compile (default linux / host arch)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATS_DIR="$SCRIPT_DIR"
ROOT_DIR="$(cd "$STATS_DIR/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
VERSION_FILE="$ROOT_DIR/VERSION"
OUT_BIN="$RELEASE_DIR/ks-stats"
OUT_SHA="$RELEASE_DIR/ks-stats.sha256"

MODE="${1:-production}"
case "$MODE" in
  --help|-h|help)
    cat <<'USAGE'
Usage:
  stats/rebuild.sh [mode]

Modes:
  production            stripped static ELF (default, ~10M)
  dev|development       debug build (no strip, -gcflags -N -l)

Examples:
  ./stats/rebuild.sh
  ./stats/rebuild.sh dev
  VERSION=1.0.234 ./stats/rebuild.sh
  GOARCH=arm64 ./stats/rebuild.sh

Output:
  release/ks-stats               ELF binary (supports --port 3000)
  release/ks-stats.sha256        SHA-256 sidecar

Run:
  ./release/ks-stats --port 3000
  ./release/ks-stats --port=3000
  STATS_PORT=3000 ./release/ks-stats
  ./release/ks-stats --version
  ./release/ks-stats --help
USAGE
    exit 0
    ;;
  production|prod|release) MODE="production" ;;
  dev|development|debug) MODE="development" ;;
  *) echo "unknown mode: $MODE (use --help)" >&2; exit 1 ;;
esac

# --- deps ---
command -v go >/dev/null 2>&1 || { echo "ERR: go not found (need Go 1.25+)" >&2; exit 1; }

TARGET_GOOS="${GOOS:-linux}"
if [[ -n "${GOARCH:-}" ]]; then
  TARGET_GOARCH="$GOARCH"
else
  TARGET_GOARCH="$(go env GOARCH 2>/dev/null || echo amd64)"
fi

# --- version (shared with panel/edge via root VERSION) ---
if [[ -n "${VERSION:-}" ]]; then
  VER="$VERSION"
  printf '%s\n' "$VER" > "$VERSION_FILE" 2>/dev/null || true
  echo "[stats] version explicit $VER"
else
  if [[ -f "$VERSION_FILE" ]]; then
    VER="$(tr -d ' \t\r\n' < "$VERSION_FILE" 2>/dev/null || echo dev)"
    [[ -z "$VER" ]] && VER="dev"
  else
    VER="dev"
  fi
  echo "[stats] version $VER (from $VERSION_FILE, not bumped)"
fi
COMMIT="${COMMIT:-$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}"
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
echo "[stats] commit=$COMMIT date=$BUILD_DATE target=$TARGET_GOOS/$TARGET_GOARCH mode=$MODE"

# ldflags — version package added in stats/internal/version/version.go:1
LDFLAGS="-s -w -X stats/internal/version.Version=${VER} -X stats/internal/version.Commit=${COMMIT} -X stats/internal/version.BuildDate=${BUILD_DATE}"
if [[ "$MODE" == "development" ]]; then
  LDFLAGS="-X stats/internal/version.Version=${VER} -X stats/internal/version.Commit=${COMMIT} -X stats/internal/version.BuildDate=${BUILD_DATE}"
  GCFLAGS="all=-N -l"
else
  GCFLAGS="all=-trimpath=${ROOT_DIR}"
fi

mkdir -p "$RELEASE_DIR"

# backup old binary
if [[ -f "$OUT_BIN" ]]; then
  mv -f "$OUT_BIN" "$OUT_BIN.old" || true
fi

echo "[stats] building $OUT_BIN ..."
# CGO_ENABLED=0 is mandatory: modernc.org/sqlite is pure Go, binary must be static
if [[ "$MODE" == "development" ]]; then
  ( cd "$STATS_DIR" && CGO_ENABLED=0 GOOS="$TARGET_GOOS" GOARCH="$TARGET_GOARCH" \
    go build -buildvcs=false -trimpath -gcflags "$GCFLAGS" -ldflags "$LDFLAGS" -o "$OUT_BIN" ./cmd/server )
else
  ( cd "$STATS_DIR" && CGO_ENABLED=0 GOOS="$TARGET_GOOS" GOARCH="$TARGET_GOARCH" \
    go build -buildvcs=false -trimpath -gcflags "$GCFLAGS" -ldflags "$LDFLAGS" -o "$OUT_BIN" ./cmd/server )
fi

# strip only production linux ELF
if [[ "$MODE" == "production" && "$TARGET_GOOS" == "linux" ]] && command -v strip >/dev/null 2>&1; then
  if strip --strip-all "$OUT_BIN" 2>/dev/null || strip "$OUT_BIN" 2>/dev/null; then
    echo "[stats] stripped"
  fi
  command -v objcopy >/dev/null 2>&1 && objcopy --remove-section .comment --remove-section .note "$OUT_BIN" 2>/dev/null || true
fi

chmod 755 "$OUT_BIN" 2>/dev/null || true
rm -f "$OUT_BIN.old" 2>/dev/null || true

# --- verify ---
if [[ ! -f "$OUT_BIN" ]]; then echo "[stats] ERR build failed: $OUT_BIN missing" >&2; exit 1; fi
if [[ ! -x "$OUT_BIN" ]]; then echo "[stats] ERR not executable" >&2; exit 1; fi
SIZE="$(stat -c%s "$OUT_BIN" 2>/dev/null || stat -f%z "$OUT_BIN" 2>/dev/null || echo 0)"
HUMAN="$(ls -lh "$OUT_BIN" 2>/dev/null | awk '{print $5}')"
echo "[stats] built $OUT_BIN ($HUMAN, $SIZE bytes)"
# quick file check
if command -v file >/dev/null 2>&1; then file "$OUT_BIN" || true; fi

# --version smoke test
if "$OUT_BIN" --version 2>&1 | head -n1 | grep -q "ks-stats" ; then
  echo "[stats] --version OK: $("$OUT_BIN" --version 2>&1 | head -n1)"
else
  echo "[stats] WARN --version check failed"
fi

# --help smoke test
if "$OUT_BIN" --help 2>&1 | grep -q "\-\-port" ; then
  echo "[stats] --help OK (documents --port)"
fi

# --- sha256 ---
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT_BIN" > "$OUT_SHA"
  echo "[stats] $(cat "$OUT_SHA")"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$OUT_BIN" > "$OUT_SHA"
  echo "[stats] $(cat "$OUT_SHA")"
else
  echo "[stats] WARN no sha256sum/shasum found, skipping $OUT_SHA"
fi

# also append to release/checksums.txt if it exists (keep kspanel/ksedge entries)
if [[ -f "$RELEASE_DIR/checksums.txt" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$RELEASE_DIR" && grep -v "ks-stats" checksums.txt 2>/dev/null > checksums.txt.tmp || true
      sha256sum ks-stats >> checksums.txt.tmp 2>/dev/null || true
      cat checksums.txt.tmp | sort -u > checksums.txt 2>/dev/null || true
      rm -f checksums.txt.tmp 2>/dev/null || true )
  fi
fi

echo "[stats] done"
ls -lh "$RELEASE_DIR"/ks-stats* 2>/dev/null || true
echo "[stats] run: ./release/ks-stats --port 3000"
echo "[stats] then: curl http://127.0.0.1:3000/health  # -> {\"ok\":true}"
