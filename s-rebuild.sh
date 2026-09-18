#!/usr/bin/env bash
# s-rebuild.sh — Simple/Unsafe rebuild (NO HARDENING, NO SAFETY CHECKS)
#
# Minimal fast-path rebuild:
#   1. bumps VERSION (patch auto-increment unless $VERSION is set)
#   2. syncs instance_pages/ + themes_market/ into backend embed trees (library)
#   3. builds panel frontend (plain Vite, no obfuscation, no sourcemap stripping check)
#   4. builds kspanel + ksedge binaries (plain go build, no garble, no -s -w, no strip)
#   5. generates sha256 checksums + stamps release/version.json
#
# Intentionally WITHOUT safety/hardening:
#   - no build lock, no strip/objcopy, no garble, no frontend obfuscator
#   - no source-leakage / secret / debug / sourcemap / permission verification
#   - no signing, no readelf/file checks
#
# Usage:
#   ./s-rebuild.sh                  # auto-bump patch (1.0.226 -> 1.0.227)
#   VERSION=1.2.3 ./s-rebuild.sh     # explicit version (persisted to ./VERSION)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_BACKEND_DIR="$ROOT_DIR/panel/backend"
PANEL_FRONTEND_DIR="$ROOT_DIR/panel/frontend"
EDGE_BACKEND_DIR="$ROOT_DIR/edge/backend"
RELEASE_DIR="$ROOT_DIR/release"
VERSION_FILE="$ROOT_DIR/VERSION"

# ---- version ---------------------------------------------------------------
if [[ -n "${VERSION:-}" ]]; then
    VER="$VERSION"
    printf '%s\n' "$VER" > "$VERSION_FILE"
    echo "[s-rebuild] version explicit $VER (persisted)"
else
    cur="1.0.0"
    [[ -f "$VERSION_FILE" ]] && cur="$(tr -d ' \t\r\n' < "$VERSION_FILE" 2>/dev/null || echo "1.0.0")"
    bare="${cur#v}"
    if [[ "$bare" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
        VER="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"
    else
        echo "[s-rebuild] WARN: VERSION file non-semver '$cur' -> reset 1.0.0" >&2
        VER="1.0.0"
    fi
    printf '%s\n' "$VER" > "$VERSION_FILE"
    echo "[s-rebuild] version auto-bumped $cur -> $VER"
fi
COMMIT="${COMMIT:-$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}"
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
echo "[s-rebuild] commit=$COMMIT date=$BUILD_DATE"

# ---- ldflags ---------------------------------------------------------------
KSPANEL_LDFLAGS="-X github.com/example/kspanel/internal/version.Version=${VER} -X github.com/example/kspanel/internal/version.Commit=${COMMIT} -X github.com/example/kspanel/internal/version.BuildDate=${BUILD_DATE}"
KSEDGE_LDFLAGS="-X github.com/example/ksedge/internal/version.Version=${VER} -X github.com/example/ksedge/internal/version.Commit=${COMMIT} -X github.com/example/ksedge/internal/version.BuildDate=${BUILD_DATE}"

# ---- library sync ----------------------------------------------------------
sync_pagelib() {
    local src="$ROOT_DIR/instance_pages" dst="$PANEL_BACKEND_DIR/internal/pagelib/library"
    echo "[s-rebuild] sync pagelib $src -> $dst"
    [[ -d "$src" ]] || { echo "[s-rebuild] ERR instance_pages missing at $src" >&2; exit 1; }
    rm -rf -- "$dst"; mkdir -p -- "$dst/pages"
    [[ -f "$src/marketplace.json" ]] && cp -- "$src/marketplace.json" "$dst/" || echo "[s-rebuild] WARN marketplace.json missing" >&2
    local copied=0 base stem
    if [[ -d "$src/pages" ]]; then
        for f in "$src/pages"/*.yaml "$src/pages"/*.yml "$src/pages"/*.json; do
            [[ -e "$f" ]] || continue
            base="$(basename "$f")"; stem="${base%.*}"
            if [[ -f "$dst/pages/$stem.yaml" || -f "$dst/pages/$stem.yml" ]]; then
                echo "[s-rebuild] skip legacy $base (YAML already exists)"; continue
            fi
            cp -- "$f" "$dst/pages/"; copied=$((copied+1))
        done
    fi
    for f in "$src"/*.yaml "$src"/*.yml "$src"/*.json; do
        [[ -e "$f" ]] || continue
        base="$(basename "$f")"; [[ "$base" == "marketplace.json" ]] && continue
        stem="${base%.*}"
        if [[ -f "$dst/pages/$base" || -f "$dst/pages/$stem.yaml" || -f "$dst/pages/$stem.yml" || -f "$dst/pages/$stem.json" ]]; then
            echo "[s-rebuild] skip duplicate top-level $base"; continue
        fi
        cp -- "$f" "$dst/pages/"; copied=$((copied+1))
    done
    echo "[s-rebuild] pagelib synced ($copied pages + marketplace, total $(find "$dst" -type f 2>/dev/null | wc -l | tr -d ' '))"
}

sync_themelib() {
    local src="$ROOT_DIR/themes_market" dst="$PANEL_BACKEND_DIR/internal/themelib/library"
    echo "[s-rebuild] sync themelib $src -> $dst"
    [[ -d "$src" ]] || { echo "[s-rebuild] ERR themes_market missing at $src" >&2; exit 1; }
    rm -rf -- "$dst"; mkdir -p -- "$dst/market"
    [[ -f "$src/marketplace.json" ]] && cp -- "$src/marketplace.json" "$dst/" || echo "[s-rebuild] WARN marketplace.json missing" >&2
    local copied=0 base
    if [[ -d "$src/market" ]]; then
        for f in "$src/market"/*.json; do
            [[ -e "$f" ]] || continue
            base="$(basename "$f")"; [[ "$base" == "marketplace.json" ]] && continue
            cp -- "$f" "$dst/market/"; copied=$((copied+1))
        done
    fi
    for f in "$src"/*.json; do
        [[ -e "$f" ]] || continue
        base="$(basename "$f")"; [[ "$base" == "marketplace.json" ]] && continue
        [[ -f "$dst/market/$base" ]] && { echo "[s-rebuild] skip duplicate $base"; continue; }
        cp -- "$f" "$dst/market/"; copied=$((copied+1))
    done
    echo "[s-rebuild] themelib synced ($copied themes + marketplace, total $(find "$dst" -type f 2>/dev/null | wc -l | tr -d ' '))"
}

# ---- frontend (plain, no obfuscation) -------------------------------------
build_frontend() {
    echo "[s-rebuild] building frontend (plain Vite, no obfuscation)..."
    mkdir -p -- "$RELEASE_DIR"
    # clean previous dist
    rm -rf -- "$PANEL_FRONTEND_DIR/dist" "$PANEL_BACKEND_DIR/internal/ui/dist"
    if [[ ! -d "$PANEL_FRONTEND_DIR/node_modules" ]]; then
        echo "[s-rebuild] npm ci ..."
        (cd "$PANEL_FRONTEND_DIR" && npm ci --prefer-offline --no-audit --no-fund)
    fi
    # vite build plain
    (cd "$PANEL_FRONTEND_DIR" && node ./node_modules/vite/bin/vite.js build --mode production)
    # defensive: if vite still outputs to panel/frontend/dist only, copy to backend embed
    if [[ ! -f "$PANEL_BACKEND_DIR/internal/ui/dist/index.html" && -f "$PANEL_FRONTEND_DIR/dist/index.html" ]]; then
        mkdir -p -- "$PANEL_BACKEND_DIR/internal/ui"
        cp -r -- "$PANEL_FRONTEND_DIR/dist" "$PANEL_BACKEND_DIR/internal/ui/dist"
    fi
    [[ -f "$PANEL_BACKEND_DIR/internal/ui/dist/index.html" ]] || { echo "[s-rebuild] ERR frontend dist missing" >&2; exit 1; }
    echo "[s-rebuild] frontend OK -> $PANEL_BACKEND_DIR/internal/ui/dist"
}

# ---- go build (plain, no garble/strip) ------------------------------------
build_bin() {
    local name="$1" cmd_dir="$2" out="$3" ldflags="$4"
    echo "[s-rebuild] building $name -> $out"
    [[ -d "$cmd_dir" ]] || { echo "[s-rebuild] ERR cmd dir missing $cmd_dir" >&2; exit 1; }
    [[ -d "$out" ]] && rm -rf -- "$out"
    mkdir -p -- "$(dirname "$out")"
    CGO_ENABLED=0 GOOS="${GOOS:-linux}" GOARCH="${GOARCH:-$(go env GOARCH 2>/dev/null || echo amd64)}" \
        go build -trimpath -ldflags "$ldflags" -o "$out" .
    # deliberately no strip, no garble
    chmod 755 -- "$out"
    echo "[s-rebuild] $name built: $(ls -lh "$out" | awk '{print $5, $9}')"
}

# ---- checksums + version.json ---------------------------------------------
gen_checksums() {
    echo "[s-rebuild] generating checksums..."
    local sum="sha256sum"; command -v sha256sum >/dev/null 2>&1 || sum="shasum -a 256"
    ( cd "$RELEASE_DIR" && : > checksums.txt
      for b in kspanel ksedge; do
          [[ -f "$b" ]] || continue
          $sum -- "$b" > "${b}.sha256"
          $sum -- "$b" >> checksums.txt
          echo "[s-rebuild] $b.sha256 $(cut -d' ' -f1 "${b}.sha256")"
      done
      cat checksums.txt
    )
}

stamp_manifest() {
    echo "[s-rebuild] stamping version.json (version=$VER)..."
    local stamper="$ROOT_DIR/tools/stamp-version-manifest.sh"
    if [[ ! -f "$stamper" ]]; then
        echo "[s-rebuild] WARN stamper missing $stamper" >&2; return 0
    fi
    VERSION="$VER" COMMIT="$COMMIT" BUILD_DATE="$BUILD_DATE" bash "$stamper" "$RELEASE_DIR"
}

# ---- main ------------------------------------------------------------------
echo "[s-rebuild] start (UNSAFE, no hardening) version=$VER"
sync_pagelib
sync_themelib
build_frontend
build_bin "kspanel" "$PANEL_BACKEND_DIR/cmd/kspanel" "$RELEASE_DIR/kspanel" "$KSPANEL_LDFLAGS"
build_bin "ksedge"  "$EDGE_BACKEND_DIR/cmd/ksedge"  "$RELEASE_DIR/ksedge"  "$KSEDGE_LDFLAGS"
gen_checksums
stamp_manifest
echo "[s-rebuild] done (unsafe build)"
ls -lh -- "$RELEASE_DIR"/ 2>/dev/null || true
cat -- "$RELEASE_DIR/version.json" 2>/dev/null || true
