#!/usr/bin/env bash
set -euo pipefail


ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_BACKEND_DIR="$ROOT_DIR/panel/backend"
PANEL_FRONTEND_DIR="$ROOT_DIR/panel/frontend"
EDGE_BACKEND_DIR="$ROOT_DIR/edge/backend"
RELEASE_DIR="$ROOT_DIR/release"
KSPANEL_RELEASE_BIN="$RELEASE_DIR/kspanel"
KSPANEL_OLD_BIN="$KSPANEL_RELEASE_BIN.old"
KSEDGE_RELEASE_BIN="$RELEASE_DIR/ksedge"
KSEDGE_OLD_BIN="$KSEDGE_RELEASE_BIN.old"
# Clean previous builds
echo "Cleaning previous builds..."
rm -rf "$PANEL_FRONTEND_DIR/dist"
rm -rf "$PANEL_BACKEND_DIR/internal/ui/dist"
# Remove previous binaries if they exist
rm -f "$KSPANEL_RELEASE_BIN" "$KSPANEL_OLD_BIN"
rm -f "$KSEDGE_RELEASE_BIN" "$KSEDGE_OLD_BIN"


echo "[0/5] Preparing kspanel frontend toolchain..."
# Ensure deps are installed. `npm install` is idempotent and a no-op when
# node_modules is already in sync from a prior run; without this step a
# fresh checkout (no node_modules yet) makes the vite build at [1/5] blow
# up with "Cannot find module .../vite/bin/vite.js".
if [ ! -d "$PANEL_FRONTEND_DIR/node_modules" ] || [ ! -f "$PANEL_FRONTEND_DIR/node_modules/vite/bin/vite.js" ]; then
    echo "  node_modules missing — running npm install..."
    (cd "$PANEL_FRONTEND_DIR" && npm install)
fi
# npm installs in restricted sandboxes sometimes ship the esbuild binary
# without an execute bit and/or omit the node_modules/.bin shim directory,
# both of which make `vite build` fail with "EACCES"/"vite: not found".
# Fix the execute bits and ensure the bin shims exist before we build.
ESBUILD_SHIM="$PANEL_FRONTEND_DIR/node_modules/esbuild/bin/esbuild"
# chmod every esbuild native binary under node_modules — npm may hoist
# @esbuild/linux-x64 at the top OR nest it inside esbuild/node_modules/,
# and a missing execute bit makes `vite build` crash with EACCES the
# first time it spawns the service. We list candidates first (into a
# plain array, no process substitution) then chmod each; each chmod is
# individually guarded so a read-only fs error never aborts the build.
esbuild_bins=()
while IFS= read -r p; do
    [ -n "$p" ] && esbuild_bins+=("$p")
done < <(find "$PANEL_FRONTEND_DIR/node_modules" -path '*/@esbuild/linux-x64/bin/esbuild' 2>/dev/null)
for bin in "${esbuild_bins[@]}"; do
    chmod +x "$bin" 2>/dev/null || true
done
if [ -f "$ESBUILD_SHIM" ]; then chmod +x "$ESBUILD_SHIM" 2>/dev/null || true; fi
# Some overlay/COW sandboxes silently strip the execute bit on the npm-installed
# esbuild binary's inode (chmod succeeds, `ls` even shows -rwxr-xr-x, but the bit
# reverts before vite can spawn it → EACCES). Copying the binary to a fresh
# inode that reliably retains +x and pointing esbuild at it via ESBUILD_BINARY_PATH
# sidesteps the whole native-spawn path. esbuild respects this var over its
# own resolution, so vite's internal esbuild instance picks up the good copy.
ESBUILD_FALLBACK="$ROOT_DIR/.build-tmp/esbuild"
for bin in "${esbuild_bins[@]}"; do
    if [ -f "$bin" ]; then
        mkdir -p "$ROOT_DIR/.build-tmp"
        if cp "$bin" "$ESBUILD_FALLBACK" 2>/dev/null && chmod +x "$ESBUILD_FALLBACK" 2>/dev/null && \
           [ -x "$ESBUILD_FALLBACK" ]; then
            export ESBUILD_BINARY_PATH="$ESBUILD_FALLBACK"
            echo "  using esbuild fallback binary at $ESBUILD_FALLBACK"
        fi
        break
    fi
done
if [ ! -d "$PANEL_FRONTEND_DIR/node_modules/.bin" ]; then
    mkdir -p "$PANEL_FRONTEND_DIR/node_modules/.bin"
fi
# Recreate shims (idempotent). Use -f so stale links get overwritten.
[ -f "$PANEL_FRONTEND_DIR/node_modules/vite/bin/vite.js" ] && \
    ln -sf ../vite/bin/vite.js "$PANEL_FRONTEND_DIR/node_modules/.bin/vite" 2>/dev/null || true
[ -f "$ESBUILD_SHIM" ] && \
    ln -sf ../esbuild/bin/esbuild "$PANEL_FRONTEND_DIR/node_modules/.bin/esbuild" 2>/dev/null || true


echo "[1/5] Building kspanel frontend..."
# Invoke vite through node directly rather than the node_modules/.bin/vite
# shim. In this restricted sandbox `npm run build` (which exec's the
# node_modules/.bin/vite symlink) intermittently dies with
# "vite: Permission denied" — the exec syscall refuses to follow the
# .bin symlink out to its target even though the target itself is +x.
# Calling `node path/to/vite.js build` sidesteps the exec-symlink path
# entirely and is robust regardless of .bin/.bin-shim state.
(cd "$PANEL_FRONTEND_DIR" && node ./node_modules/vite/bin/vite.js build)

echo "  frontend dist already in Go embed path (written by vite)"


echo "[2/5] Building kspanel binary..."
mkdir -p "$RELEASE_DIR"
# If a prior broken run left $KSPANEL_RELEASE_BIN as a directory (a stale
# kspanel/kspanel.old artifact), go build -o would drop the binary *inside*
# it instead of replacing it, so the stashing logic never finds a file at
# $KSPANEL_RELEASE_BIN. Remove any such directory so the output lands where we expect.
if [ -d "$KSPANEL_RELEASE_BIN" ]; then
    echo "  removing stale directory at $KSPANEL_RELEASE_BIN..."
    rm -rf "$KSPANEL_RELEASE_BIN"
fi
if [ -f "$KSPANEL_RELEASE_BIN" ]; then
    mv "$KSPANEL_RELEASE_BIN" "$KSPANEL_OLD_BIN"
fi
# Stamp the build identity into the binary via -ldflags so the admin
# "Updates" tab can show the running version + commit + build date and
# compare it against the latest release. The package is
# internal/version (see version.go). VERSION falls back to "dev" when no
# VERSION env var is set (e.g. a local rebuild for debugging); COMMIT
# reads `git rev-parse --short HEAD` from the kspanel repo root, or
# "unknown" outside of a git checkout.
KSPANEL_VERSION="${VERSION:-dev}"
KSPANEL_COMMIT="${COMMIT:-$(git -C "$PANEL_BACKEND_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}"
KSPANEL_BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
KSPANEL_LDFLAGS="-X github.com/example/kspanel/internal/version.Version=${KSPANEL_VERSION} \
 -X github.com/example/kspanel/internal/version.Commit=${KSPANEL_COMMIT} \
 -X github.com/example/kspanel/internal/version.BuildDate=${KSPANEL_BUILD_DATE}"
echo "  stamping version=${KSPANEL_VERSION} commit=${KSPANEL_COMMIT} build_date=${KSPANEL_BUILD_DATE}"
if ! (cd "$PANEL_BACKEND_DIR/cmd/kspanel" && go build -buildvcs=false -ldflags "$KSPANEL_LDFLAGS" -o "$KSPANEL_RELEASE_BIN" .); then
    # Build failed — restore the previous binary from the stash so the panel
    # is not left without a working executable. Leave $KSPANEL_OLD_BIN in place so the
    # operator can inspect it / the next run will overwrite it.
    if [ -f "$KSPANEL_OLD_BIN" ]; then
        mv "$KSPANEL_OLD_BIN" "$KSPANEL_RELEASE_BIN"
        echo "  build failed — restored previous binary from $KSPANEL_OLD_BIN" >&2
    fi
    exit 1
fi
rm -f "$KSPANEL_OLD_BIN"


echo "[3/5] Building ksedge binary..."
mkdir -p "$RELEASE_DIR"
if [ -d "$KSEDGE_RELEASE_BIN" ]; then
    echo "  removing stale directory at $KSEDGE_RELEASE_BIN..."
    rm -rf "$KSEDGE_RELEASE_BIN"
fi
if [ -f "$KSEDGE_RELEASE_BIN" ]; then
    mv "$KSEDGE_RELEASE_BIN" "$KSEDGE_OLD_BIN"
fi
if ! (cd "$EDGE_BACKEND_DIR/cmd/ksedge" && go build -buildvcs=false -o "$KSEDGE_RELEASE_BIN" .); then
    if [ -f "$KSEDGE_OLD_BIN" ]; then
        mv "$KSEDGE_OLD_BIN" "$KSEDGE_RELEASE_BIN"
        echo "  build failed — restored previous binary from $KSEDGE_OLD_BIN" >&2
    fi
    exit 1
fi
rm -f "$KSEDGE_OLD_BIN"


echo "[4/5] Verifying builds..."
echo "  kspanel: $KSPANEL_RELEASE_BIN"
ls -lh "$KSPANEL_RELEASE_BIN"
echo "  ksedge: $KSEDGE_RELEASE_BIN"
ls -lh "$KSEDGE_RELEASE_BIN"


echo "[5/5] Done."