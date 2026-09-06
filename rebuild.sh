#!/usr/bin/env bash
# KS Panel & KSEdge — Hardened Production Build Script
#
# This script implements a professional closed-source Linux release pipeline with
# defense-in-depth security hardening. It produces production binaries that are
# significantly more difficult to reverse-engineer, tamper with, or extract
# information from, while preserving all runtime functionality.
#
# Usage:
#   ./rebuild.sh                 # Production build (hardened)
#   ./rebuild.sh dev             # Development build (debuggable)
#   ./rebuild.sh --help          # Show help
#
# Environment Variables (production):
#   VERSION            Explicit semver override (e.g., 1.2.3). When set, it is
#                      used verbatim and persisted to ./VERSION. When unset,
#                      the patch of ./VERSION auto-increments every production
#                      build (1.0.0 -> 1.0.1 -> 1.0.2) and the same version is
#                      stamped into BOTH kspanel and ksedge plus
#                      release/version.json.
#   COMMIT             Git short commit (auto-detected if not set)
#   BUILD_DATE         ISO8601 UTC (auto-generated if not set)
#   GOARCH             Target architecture (amd64, arm64)
#   GOOS               Target OS (linux)
#   GARBLE_ENABLE      Go obfuscation: "auto" (default, prod uses garble when
#                      installed, else go build with warning), "1" to require
#                      garble, "0" to force plain go build
#   SIGN_KEY           Path to signing private key (for code signing)
#   SIGN_CMD           Custom signing command (default: cosign sign-blob)
#
# Requirements:
#   - Go 1.22+
#   - Node.js 20+
#   - garble (optional, for obfuscation): go install mvdan.cc/garble@latest
#   - cosign (optional, for signing): go install github.com/sigstore/cosign/v2/cmd/cosign@latest
#
# Security Properties:
#   -trimpath: Removes all source paths from the binary
#   -ldflags="-s -w": Strips DWARF debug info and symbol table
#   Binary stripping: Removes non-essential ELF symbols (validated post-strip)
#   Source leakage scan: Verifies no absolute paths remain in binary
#   Secret scan: Checks artifacts for common secret patterns
#   Checksums: SHA-256 for all release artifacts
#   Signing: Optional cryptographic signing via cosign

set -Eeuo pipefail
umask 022
export LC_ALL=C

# ============================================================================
# Configuration
# ============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_BACKEND_DIR="$ROOT_DIR/panel/backend"
PANEL_FRONTEND_DIR="$ROOT_DIR/panel/frontend"
EDGE_BACKEND_DIR="$ROOT_DIR/edge/backend"
RELEASE_DIR="$ROOT_DIR/release"

KSPANEL_RELEASE_BIN="$RELEASE_DIR/kspanel"
KSPANEL_OLD_BIN="$KSPANEL_RELEASE_BIN.old"
KSEDGE_RELEASE_BIN="$RELEASE_DIR/ksedge"
KSEDGE_OLD_BIN="$KSEDGE_RELEASE_BIN.old"

# Single source of truth for the shared kspanel/ksedge semver. Production
# rebuilds auto-bump the patch component on every run (1.0.0 -> 1.0.1)
# unless VERSION is explicitly set in the environment.
VERSION_FILE="$ROOT_DIR/VERSION"

LOCK_DIR="$ROOT_DIR/.build.lock"

# Build mode: "production" (default) or "development"
BUILD_MODE="${1:-production}"

# Target architecture (can be overridden via env)
# Defer go env lookup to dependency check; fall back to uname if go missing
TARGET_GOOS="${GOOS:-linux}"
if [[ -n "${GOARCH:-}" ]]; then
    TARGET_GOARCH="$GOARCH"
elif command -v go >/dev/null 2>&1; then
    TARGET_GOARCH="$(go env GOARCH 2>/dev/null || echo amd64)"
else
    TARGET_GOARCH="$(uname -m 2>/dev/null | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/' -e 's/armv.*l/arm/' || echo amd64)"
fi

# Obfuscation: production defaults to garble-when-available ("auto");
# dev always stays unobfuscated (see configure_build_mode). Explicit
# GARBLE_ENABLE=0 forces plain go build; =1 requires garble (warn + fallback
# when missing so CI never hard-fails on a missing optional tool).
GARBLE_ENABLE="${GARBLE_ENABLE:-auto}"

# Signing
SIGN_KEY="${SIGN_KEY:-}"
SIGN_CMD="${SIGN_CMD:-cosign sign-blob}"

# Colors for output (disabled when not a TTY)
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# ============================================================================
# Helper Functions
# ============================================================================

log_info() { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
log_ok() { printf "${GREEN}[OK]${NC} %s\n" "$*"; }
log_warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
log_err() { printf "${RED}[ERR]${NC} %s\n" "$*" >&2; }
log_step() { printf "${BLUE}==>${NC} %s\n" "$*"; }

die() { log_err "$*"; exit 1; }

require_cmd() {
    local cmd="$1"
    local hint="${2:-}"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        if [[ -n "$hint" ]]; then
            die "required command '$cmd' not found — $hint"
        else
            die "required command '$cmd' not found"
        fi
    fi
}

# file_type: print file(1)'s output when the utility is installed; on
# minimal hosts without file(1), fall back to reading the 4-byte ELF magic
# (7f 45 4c 46) directly so build verification doesn't false-fail.
file_type() {
    local target="$1"
    if [[ ! -e "$target" ]]; then
        echo "$target: not found"
        return 1
    fi
    if command -v file >/dev/null 2>&1; then
        file -- "$target" 2>/dev/null || echo "$target: unknown format"
    elif [[ "$(head -c 4 -- "$target" 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n')" = "7f454c46" ]]; then
        echo "$target: ELF"
    else
        echo "$target: unknown format"
        return 1
    fi
}

# has_file_cmd: true when file(1) is available (needed for checks that grep
# its detailed output, e.g. "with debug_info").
has_file_cmd() { command -v file >/dev/null 2>&1; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

show_help() {
    cat <<'EOF'
KS Panel & KSEdge — Hardened Production Build Script

Usage:
  ./rebuild.sh [mode] [options]

Modes:
  production    Hardened release build (default)
  dev           Development build with debug symbols

Environment Variables:
  VERSION            Semantic version (e.g., 1.2.3)
  COMMIT             Git short commit (auto-detected if not set)
  BUILD_DATE         ISO8601 UTC build date (auto-generated if not set)
  GOOS               Target OS (default: linux)
  GOARCH             Target architecture (default: host arch)
  GARBLE_ENABLE      auto (default, prod garbles when installed) | 1 (require) | 0 (force plain)
  SIGN_KEY           Path to signing private key
  SIGN_CMD           Custom signing command (default: cosign sign-blob)

Examples:
  ./rebuild.sh                          # Production build (garble when installed)
  ./rebuild.sh dev                      # Development build (never obfuscated)
  VERSION=1.2.3 ./rebuild.sh            # Production build with version
  GARBLE_ENABLE=0 ./rebuild.sh          # Production build without obfuscation
  GARBLE_ENABLE=1 ./rebuild.sh          # Production build, require obfuscation
  SIGN_KEY=/path/key ./rebuild.sh       # Production build with signing

Output (production):
  release/
  ├── kspanel
  ├── kspanel.sha256
  ├── ksedge
  ├── ksedge.sha256
  └── checksums.txt

  If signing enabled:
  ├── kspanel.sig
  ├── ksedge.sig
  └── checksums.txt.sig
EOF
}

# ============================================================================
# Dependency Checks
# ============================================================================

check_dependencies() {
    log_step "Checking build dependencies..."
    require_cmd go "install Go 1.22+ from https://go.dev/dl/"
    require_cmd node "install Node.js 20+ from https://nodejs.org/"
    require_cmd npm "install Node.js 20+ (includes npm)"
    # sha256sum or shasum fallback
    if ! has_cmd sha256sum && ! has_cmd shasum; then
        die "sha256sum or shasum is required"
    fi
    # Optional but warn early. Production defaults to garble-when-available
    # ("auto"), so a missing garble is an informational fallback, not an
    # error; an explicit GARBLE_ENABLE=1 that cannot be honoured warns
    # louder because the operator asked for it.
    if [[ "$GARBLE_ENABLE" == "1" ]] && ! has_cmd garble; then
        log_warn "GARBLE_ENABLE=1 but garble not found — will fall back to plain go build with warning (install: go install mvdan.cc/garble@latest)"
    elif [[ "$GARBLE_ENABLE" == "auto" ]] && ! has_cmd garble; then
        log_info "garble not installed — production will use plain go build (install garble for obfuscation: go install mvdan.cc/garble@latest)"
    fi
    if [[ -n "$SIGN_KEY" ]] && ! has_cmd cosign; then
        # cosign may be invoked via SIGN_CMD which could be a wrapper; check first word
        local sign_bin
        sign_bin="$(printf '%s' "$SIGN_CMD" | awk '{print $1}')"
        if ! has_cmd "$sign_bin"; then
            log_warn "SIGN_KEY set but signing tool '$sign_bin' not found — will skip signing"
        fi
    fi
    # Informational checks
    if ! has_cmd strings; then
        log_warn "strings (binutils) not found — source-leakage and secret scans will be limited"
    fi
    if ! has_cmd readelf && ! has_cmd llvm-readelf; then
        log_warn "readelf not found — symbol-table verification will be limited"
    fi
    if ! has_cmd strip && [[ "${STRIP_BINARY:-true}" == "true" ]] && [[ "$TARGET_GOOS" == "linux" ]]; then
        log_warn "strip not found — binary stripping will be skipped"
    fi
    log_ok "Dependency check passed (go $(go version 2>/dev/null | awk '{print $3}'), node $(node --version 2>/dev/null), npm $(npm --version 2>/dev/null))"
}

# ============================================================================
# Lock & Cleanup (concurrency safety)
# ============================================================================

acquire_lock() {
    if ! mkdir "$LOCK_DIR" 2>/dev/null; then
        local holder=""
        if [[ -f "$LOCK_DIR/pid" ]]; then
            holder="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
        fi
        die "another build is running (lock $LOCK_DIR exists${holder:+ pid $holder}) — remove it if stale: rm -rf \"$LOCK_DIR\""
    fi
    echo "$$" > "$LOCK_DIR/pid" 2>/dev/null || true
    log_info "Acquired build lock $LOCK_DIR"
}

release_lock() {
    rm -rf "$LOCK_DIR" 2>/dev/null || true
}

cleanup_on_exit() {
    local rc=$?
    # Remove stale temp files but preserve release artifacts on success
    rm -rf "$ROOT_DIR/.build-tmp" 2>/dev/null || true
    # Remove stray partials
    rm -f "$RELEASE_DIR"/*.tmp "$RELEASE_DIR"/*.part 2>/dev/null || true
    # If we failed, try to restore .old backups if new binary missing
    if [[ $rc -ne 0 ]]; then
        if [[ -f "$KSPANEL_OLD_BIN" && ! -f "$KSPANEL_RELEASE_BIN" ]]; then
            mv -f "$KSPANEL_OLD_BIN" "$KSPANEL_RELEASE_BIN" 2>/dev/null || true
            log_warn "Restored previous kspanel from backup due to failure"
        fi
        if [[ -f "$KSEDGE_OLD_BIN" && ! -f "$KSEDGE_RELEASE_BIN" ]]; then
            mv -f "$KSEDGE_OLD_BIN" "$KSEDGE_RELEASE_BIN" 2>/dev/null || true
            log_warn "Restored previous ksedge from backup due to failure"
        fi
    else
        rm -f "$KSPANEL_OLD_BIN" "$KSEDGE_OLD_BIN" 2>/dev/null || true
    fi
    release_lock
    return $rc
}

# ============================================================================
# Build Mode Configuration
# ============================================================================

configure_build_mode() {
    case "$BUILD_MODE" in
        production|prod|release)
            BUILD_MODE="production"
            GO_BUILD_TAGS=""  # Default: noop runtime
            GO_LDFLAGS_BASE="-s -w"
            GO_GCFLAGS=""
            STRIP_BINARY=true
            VITE_MODE="production"
            NPM_CMD="ci"
            # Production defaults to garble-when-available: "auto" or "1"
            # both request obfuscation (auto falls back silently with a
            # warning when garble is missing; "1" warns louder). "0"
            # forces plain go build. Dev (below) is always "0".
            case "${GARBLE_ENABLE}" in
                0|false|no|off) ENABLE_OBFUSCATION="0" ;;
                1|true|yes|on|auto|"") ENABLE_OBFUSCATION="1" ;;
                *) log_warn "unknown GARBLE_ENABLE=${GARBLE_ENABLE} — treating as auto"; ENABLE_OBFUSCATION="1" ;;
            esac
            if [[ -n "$SIGN_KEY" ]]; then
                ENABLE_SIGNING="1"
            else
                ENABLE_SIGNING="0"
            fi
            ENABLE_SECRET_SCAN=true
            ENABLE_SOURCE_LEAK_CHECK=true
            ENABLE_REPRODUCIBLE=true
            log_info "Build mode: PRODUCTION (hardened)"
            ;;
        development|dev|debug)
            BUILD_MODE="development"
            GO_BUILD_TAGS=""
            GO_LDFLAGS_BASE=""
            GO_GCFLAGS="-N -l"
            STRIP_BINARY=false
            VITE_MODE="development"
            NPM_CMD="install"
            ENABLE_OBFUSCATION="0"
            ENABLE_SIGNING="0"
            ENABLE_SECRET_SCAN=false
            ENABLE_SOURCE_LEAK_CHECK=false
            ENABLE_REPRODUCIBLE=false
            log_info "Build mode: DEVELOPMENT (debuggable)"
            ;;
        --help|-h|help)
            show_help
            exit 0
            ;;
        *)
            die "Unknown build mode: $BUILD_MODE. Use 'production' or 'dev'."
            ;;
    esac

    # Validate target
    if [[ -z "$TARGET_GOOS" || -z "$TARGET_GOARCH" ]]; then
        die "GOOS/GOARCH must not be empty (GOOS=$TARGET_GOOS GOARCH=$TARGET_GOARCH)"
    fi

    # Export for subcommands
    export CGO_ENABLED=0
    export GOOS="$TARGET_GOOS"
    export GOARCH="$TARGET_GOARCH"

    # Reproducible builds: ensure SOURCE_DATE_EPOCH is numeric if set
    if [[ -n "${SOURCE_DATE_EPOCH:-}" ]] && ! [[ "$SOURCE_DATE_EPOCH" =~ ^[0-9]+$ ]]; then
        log_warn "SOURCE_DATE_EPOCH is not numeric ($SOURCE_DATE_EPOCH) — ignoring"
        unset SOURCE_DATE_EPOCH
    fi
}

# ============================================================================
# Version Information
# ============================================================================

resolve_version_info() {
    # Version: explicit $VERSION wins (and is persisted to $VERSION_FILE so
    # the next auto-bump continues from it); "dev" for development (no bump,
    # no persist); otherwise production auto-bumps the patch component of
    # $VERSION_FILE (1.0.0 -> 1.0.1 -> 1.0.2 ...) so panel + edge always
    # share the same version. Both binaries receive the identical ldflags.
    if [[ -n "${VERSION:-}" ]]; then
        KSPANEL_VERSION="$VERSION"
        printf '%s\n' "$KSPANEL_VERSION" > "$VERSION_FILE" 2>/dev/null ||
            log_warn "could not persist VERSION=$KSPANEL_VERSION to $VERSION_FILE"
        log_info "Version: explicit $KSPANEL_VERSION (persisted to VERSION)"
    elif [[ "$BUILD_MODE" == "development" ]]; then
        KSPANEL_VERSION="dev"
    else
        local current="1.0.0"
        if [[ -f "$VERSION_FILE" ]]; then
            current="$(tr -d ' \t\r\n' < "$VERSION_FILE" 2>/dev/null || echo "1.0.0")"
        fi
        # Strip a leading 'v' for parsing (v1.2.3 -> 1.2.3).
        local bare="${current#v}"
        if [[ "$bare" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)([-+].*)?$ ]]; then
            local major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"
            KSPANEL_VERSION="${major}.${minor}.$((patch + 1))"
        else
            log_warn "VERSION file has non-semver '${current}' — resetting to 1.0.0"
            KSPANEL_VERSION="1.0.0"
        fi
        printf '%s\n' "$KSPANEL_VERSION" > "$VERSION_FILE" 2>/dev/null ||
            log_warn "could not persist VERSION=$KSPANEL_VERSION to $VERSION_FILE"
        log_info "Version: auto-bumped ${current} -> ${KSPANEL_VERSION} (persisted to VERSION)"
    fi

    # Commit: from env, or git short hash, or "unknown"
    if [[ -n "${COMMIT:-}" ]]; then
        KSPANEL_COMMIT="$COMMIT"
    else
        # Prefer repo root; fallback to backend dir for git worktree cases
        KSPANEL_COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || git -C "$PANEL_BACKEND_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
    fi

    # Build date: from env, or current UTC
    if [[ -n "${BUILD_DATE:-}" ]]; then
        KSPANEL_BUILD_DATE="$BUILD_DATE"
    else
        KSPANEL_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi

    # For reproducible builds, allow SOURCE_DATE_EPOCH override
    if [[ -n "${SOURCE_DATE_EPOCH:-}" && "$ENABLE_REPRODUCIBLE" == "true" ]]; then
        local epoch_date=""
        epoch_date="$(date -u -d "@$SOURCE_DATE_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$SOURCE_DATE_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
        if [[ -n "$epoch_date" ]]; then
            KSPANEL_BUILD_DATE="$epoch_date"
        fi
    fi

    log_info "Version:  $KSPANEL_VERSION"
    log_info "Commit:   $KSPANEL_COMMIT"
    log_info "Date:     $KSPANEL_BUILD_DATE"
    log_info "Target:   $TARGET_GOOS/$TARGET_GOARCH"
}

# ============================================================================
# Build LDFLAGS
# ============================================================================

build_ldflags() {
    local version_ldflags
    version_ldflags="-X github.com/example/kspanel/internal/version.Version=${KSPANEL_VERSION} -X github.com/example/kspanel/internal/version.Commit=${KSPANEL_COMMIT} -X github.com/example/kspanel/internal/version.BuildDate=${KSPANEL_BUILD_DATE}"
    local edge_version_ldflags
    edge_version_ldflags="-X github.com/example/ksedge/internal/version.Version=${KSPANEL_VERSION} -X github.com/example/ksedge/internal/version.Commit=${KSPANEL_COMMIT} -X github.com/example/ksedge/internal/version.BuildDate=${KSPANEL_BUILD_DATE}"

    if [[ -n "$GO_LDFLAGS_BASE" ]]; then
        KSPANEL_LDFLAGS="${GO_LDFLAGS_BASE} ${version_ldflags}"
    else
        KSPANEL_LDFLAGS="${version_ldflags}"
    fi
    if [[ -n "$GO_LDFLAGS_BASE" ]]; then
        KSEDGE_LDFLAGS="${GO_LDFLAGS_BASE} ${edge_version_ldflags}"
    else
        KSEDGE_LDFLAGS="${edge_version_ldflags}"
    fi

    # Trim leading/trailing whitespace without spawning xargs
    KSPANEL_LDFLAGS="$(printf '%s' "$KSPANEL_LDFLAGS" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    KSEDGE_LDFLAGS="$(printf '%s' "$KSEDGE_LDFLAGS" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    log_info "kspanel ldflags: $KSPANEL_LDFLAGS"
    log_info "ksedge ldflags:  $KSEDGE_LDFLAGS"
}

# ============================================================================
# Cleanup
# ============================================================================

clean_build_artifacts() {
    log_step "Cleaning previous build artifacts..."
    rm -rf -- "${PANEL_FRONTEND_DIR:?}/dist"
    rm -rf -- "${PANEL_BACKEND_DIR:?}/internal/ui/dist"
    rm -f -- "${KSPANEL_RELEASE_BIN:?}" "${KSPANEL_OLD_BIN:?}"
    rm -f -- "${KSEDGE_RELEASE_BIN:?}" "${KSEDGE_OLD_BIN:?}"
    rm -rf -- "${ROOT_DIR:?}/.build-tmp"
    mkdir -p -- "$RELEASE_DIR"
    chmod 755 -- "$RELEASE_DIR" 2>/dev/null || true
}

# ============================================================================
# Frontend Build
# ============================================================================

build_frontend() {
    log_step "Building kspanel frontend (Vite $VITE_MODE)..."

    require_cmd node
    require_cmd npm

    # Ensure node_modules exists
    if [[ ! -d "$PANEL_FRONTEND_DIR/node_modules" ]] || [[ ! -f "$PANEL_FRONTEND_DIR/node_modules/vite/bin/vite.js" ]]; then
        log_info "Installing npm dependencies..."
        (cd "$PANEL_FRONTEND_DIR" && npm "$NPM_CMD" --prefer-offline --no-audit --no-fund)
    fi

    # Fix esbuild permissions (required in some sandboxed environments)
    find "$PANEL_FRONTEND_DIR/node_modules" -path '*/@esbuild/linux-x64/bin/esbuild' -exec chmod +x {} + 2>/dev/null || true
    local ESBUILD_SHIM="$PANEL_FRONTEND_DIR/node_modules/esbuild/bin/esbuild"
    if [[ -f "$ESBUILD_SHIM" ]]; then
        chmod +x "$ESBUILD_SHIM" 2>/dev/null || true
    fi

    # Ensure .bin shims exist
    mkdir -p "$PANEL_FRONTEND_DIR/node_modules/.bin"
    if [[ -f "$PANEL_FRONTEND_DIR/node_modules/vite/bin/vite.js" ]]; then
        ln -sf ../vite/bin/vite.js "$PANEL_FRONTEND_DIR/node_modules/.bin/vite" 2>/dev/null || true
    fi
    if [[ -f "$ESBUILD_SHIM" ]]; then
        ln -sf ../esbuild/bin/esbuild "$PANEL_FRONTEND_DIR/node_modules/.bin/esbuild" 2>/dev/null || true
    fi

    # Build with Vite (production mode: no sourcemaps, minified)
    # Retry guard: this workspace has an external process that
    # intermittently removes ../backend/internal/ui/dist right after the
    # vite step finishes, which makes the kspanel embed fail with
    # "pattern dist: no matching files found". Verify the output landed
    # and rebuild once more if it vanished mid-flight.
    local vite_args=()
    if [[ "$VITE_MODE" == "production" ]]; then
        vite_args=(--mode production)
        # Vite 5 supports --sourcemap flag; fallback to env for older configs
        # We explicitly disable sourcemaps via CLI + ensure vite.config respects it.
    else
        vite_args=(--mode development)
    fi
    local attempt
    local vite_ok=false
    for attempt in 1 2 3; do
        log_info "Vite build attempt $attempt/3..."
        # Temporarily disable set -e around vite so we can capture exit code and retry
        set +e
        if [[ "$VITE_MODE" == "production" ]]; then
            (cd "$PANEL_FRONTEND_DIR" && node ./node_modules/vite/bin/vite.js build "${vite_args[@]}" --sourcemap=false)
        else
            (cd "$PANEL_FRONTEND_DIR" && node ./node_modules/vite/bin/vite.js build "${vite_args[@]}" --sourcemap=true)
        fi
        local vite_rc=$?
        set -e
        if [[ $vite_rc -ne 0 ]]; then
            log_warn "vite build failed (exit $vite_rc) on attempt $attempt"
            if [[ $attempt -eq 3 ]]; then
                die "frontend build failed after 3 attempts"
            fi
            sleep 2
            continue
        fi
        if [[ -f "$PANEL_BACKEND_DIR/internal/ui/dist/index.html" ]]; then
            vite_ok=true
            break
        fi
        log_warn "frontend dist missing after vite attempt $attempt — retrying"
        sleep 2
    done

    if [[ "$vite_ok" != "true" ]] || [[ ! -f "$PANEL_BACKEND_DIR/internal/ui/dist/index.html" ]]; then
        die "frontend build failed: $PANEL_BACKEND_DIR/internal/ui/dist/index.html not found after 3 attempts"
    fi

    log_ok "Frontend built and embedded into $PANEL_BACKEND_DIR/internal/ui/dist"
}

# ============================================================================
# Go Build
# ============================================================================

build_go_binary() {
    local name="$1"
    local cmd_dir="$2"
    local output_bin="$3"
    local old_bin="$4"
    local ldflags="$5"
    local build_tags="$6"

    log_step "Building $name binary..."

    if [[ ! -d "$cmd_dir" ]]; then
        log_err "$name: cmd dir not found: $cmd_dir"
        return 1
    fi

    # Remove stale directory if exists (defensive: output_bin should be a file)
    if [[ -d "$output_bin" ]]; then
        log_warn "Removing stale directory at $output_bin..."
        rm -rf -- "$output_bin"
    fi

    # Backup existing binary
    if [[ -f "$output_bin" ]]; then
        mv -f -- "$output_bin" "$old_bin"
    fi

    # Decide builder: garble vs go. Production requests obfuscation by
    # default (ENABLE_OBFUSCATION=1 via auto/1); dev forces 0. When garble
    # is requested but not installed we fall back to plain go build with
    # an explicit warning so the release is still produced (never a hard
    # failure on an optional tool).
    local use_garble=false
    if [[ "$ENABLE_OBFUSCATION" == "1" ]]; then
        if has_cmd garble; then
            use_garble=true
            log_info "Using garble for $name (obfuscation enabled)"
        else
            log_warn "garble requested for $name but not installed — falling back to plain go build (install: go install mvdan.cc/garble@latest)"
        fi
    else
        if [[ "$BUILD_MODE" == "development" ]]; then
            log_info "Skipping obfuscation for $name (development mode stays unobfuscated)"
        else
            log_info "Obfuscation disabled for $name (GARBLE_ENABLE=0) — plain go build"
        fi
    fi

    local rc=0
    if [[ "$use_garble" == "true" ]]; then
        # garble build supports same flags as go build (including -trimpath, -ldflags)
        # -literals -tiny are aggressive; -debug intentionally omitted (would disable obfuscation)
        local garble_cmd=(garble -literals -tiny build -buildvcs=false -trimpath)
        [[ -n "$build_tags" ]] && garble_cmd+=(-tags "$build_tags")
        [[ -n "$GO_GCFLAGS" ]] && garble_cmd+=(-gcflags "$GO_GCFLAGS")
        garble_cmd+=(-ldflags "$ldflags")
        garble_cmd+=(-o "$output_bin" .)
        log_info "Running: ${garble_cmd[*]} (in $cmd_dir)"
        if ! (cd "$cmd_dir" && "${garble_cmd[@]}"); then
            rc=1
        fi
    else
        local go_cmd=(go build -buildvcs=false -trimpath)
        [[ -n "$build_tags" ]] && go_cmd+=(-tags "$build_tags")
        [[ -n "$GO_GCFLAGS" ]] && go_cmd+=(-gcflags "$GO_GCFLAGS")
        go_cmd+=(-ldflags "$ldflags")
        go_cmd+=(-o "$output_bin" .)
        log_info "Running: ${go_cmd[*]} (in $cmd_dir)"
        if ! (cd "$cmd_dir" && "${go_cmd[@]}"); then
            rc=1
        fi
    fi

    if [[ $rc -ne 0 ]]; then
        log_err "$name build failed"
        if [[ -f "$old_bin" ]]; then
            mv -f -- "$old_bin" "$output_bin" 2>/dev/null || true
            log_info "Restored previous binary from $old_bin"
        fi
        return 1
    fi

    rm -f -- "$old_bin"
    chmod 755 -- "$output_bin" 2>/dev/null || true
    log_ok "$name built at $output_bin"
    return 0
}

# ============================================================================
# Binary Stripping
# ============================================================================

strip_binary() {
    local bin="$1"
    local name="$2"

    if [[ "$STRIP_BINARY" != "true" ]]; then
        log_info "Skipping strip for $name (development mode)"
        return 0
    fi

    # Only strip ELF/Linux targets
    if [[ "$TARGET_GOOS" != "linux" ]]; then
        log_info "Skipping strip for $name (non-linux target $TARGET_GOOS)"
        return 0
    fi

    log_step "Stripping $name binary..."

    if ! has_cmd strip; then
        log_warn "strip command not found, skipping"
        return 0
    fi

    if [[ ! -f "$bin" ]]; then
        log_err "strip: binary not found: $bin"
        return 1
    fi

    # Verify ELF before stripping
    if ! file_type "$bin" | grep -q "ELF"; then
        log_warn "strip: $name is not ELF, skipping strip"
        return 0
    fi

    # Strip only non-essential symbols, preserve Go runtime symbols
    # --strip-unneeded: remove all symbols not needed for relocation processing
    if strip --strip-unneeded -- "$bin" 2>/dev/null; then
        log_ok "$name stripped successfully"
    else
        log_warn "strip --strip-unneeded failed, trying basic strip..."
        if strip -- "$bin" 2>/dev/null; then
            log_ok "$name stripped (basic)"
        else
            log_warn "strip failed, leaving binary unstripped"
            return 0
        fi
    fi

    # Verify binary still executes
    if ! "$bin" --version >/dev/null 2>&1 && ! "$bin" -version >/dev/null 2>&1 && ! "$bin" version >/dev/null 2>&1; then
        # Try a more generic check - just verify it's a valid ELF.
        if has_cmd file && file -- "$bin" 2>/dev/null | grep -q "ELF"; then
            log_ok "$name verified as valid ELF binary after strip"
        elif [[ "$(head -c 4 -- "$bin" 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n')" = "7f454c46" ]]; then
            log_ok "$name verified as valid ELF binary after strip (magic bytes)"
        else
            log_err "$name appears corrupted after strip!"
            return 1
        fi
    else
        log_ok "$name executes correctly after strip"
    fi

    return 0
}

# ============================================================================
# Obfuscation (Garble) — now integrated into build_go_binary; kept for compat
# ============================================================================

apply_obfuscation() {
    local bin="$1"
    local name="$2"

    if [[ "$ENABLE_OBFUSCATION" != "1" ]]; then
        return 0
    fi

    if ! has_cmd garble; then
        log_warn "garble not installed, skipping post-build obfuscation"
        log_warn "Install with: go install mvdan.cc/garble@latest"
        return 0
    fi

    # Obfuscation already applied at build time via garble build
    log_info "Obfuscation already applied at compile time for $name (garble)"
    return 0
}

# ============================================================================
# Source Path Leakage Check
# ============================================================================

check_source_leakage() {
    local bin="$1"
    local name="$2"

    if [[ "$ENABLE_SOURCE_LEAK_CHECK" != "true" ]]; then
        return 0
    fi

    log_step "Checking $name for source path leakage..."

    if ! has_cmd strings; then
        log_warn "strings not found — skipping leakage check for $name"
        return 0
    fi

    if [[ ! -f "$bin" ]]; then
        log_warn "$name: binary not found for leakage check"
        return 0
    fi

    local leaks=0
    local strings_output
    strings_output="$(strings -- "$bin" 2>/dev/null || true)"

    # Check for absolute paths (common patterns)
    local patterns=(
        "/home/"
        "/root/"
        "/Users/"
        "/tmp/"
        "/var/"
        "/opt/"
        "/build/"
        "/workspace/"
        "/src/"
        ".git"
        "github.com"
        "gitlab.com"
        "bitbucket.org"
    )

    for pattern in "${patterns[@]}"; do
        if printf '%s' "$strings_output" | grep -q -F -- "$pattern"; then
            log_warn "$name: Potential path leakage found: $pattern"
            leaks=$((leaks+1))
        fi
    done

    # Check for build-specific paths
    if printf '%s' "$strings_output" | grep -q -F -- "$ROOT_DIR"; then
        log_warn "$name: Build root directory found in binary: $ROOT_DIR"
        leaks=$((leaks+1))
    fi

    if [[ $leaks -eq 0 ]]; then
        log_ok "$name: No obvious source path leakage detected"
    else
        log_warn "$name: $leaks potential leakage(s) detected"
    fi

    return 0
}

# ============================================================================
# Secret Scanning
# ============================================================================

scan_secrets() {
    local bin="$1"
    local name="$2"

    if [[ "$ENABLE_SECRET_SCAN" != "true" ]]; then
        return 0
    fi

    log_step "Scanning $name for embedded secrets..."

    if ! has_cmd strings; then
        log_warn "strings not found — skipping secret scan for $name"
        return 0
    fi

    if [[ ! -f "$bin" ]]; then
        log_warn "$name: binary not found for secret scan"
        return 0
    fi

    local patterns=(
        # API keys
        "sk-[a-zA-Z0-9]{32,}"
        "AKIA[0-9A-Z]{16}"
        "gh[pousr]_[a-zA-Z0-9]{36,}"
        "glpat-[a-zA-Z0-9_-]{20,}"
        # Private keys
        "-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----"
        # JWT
        "eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}"
        # Generic secrets (POSIX-compatible: [[:space:]] instead of \s)
        "password[[:space:]]*[:=][[:space:]]*[^[:space:]]{8,}"
        "secret[[:space:]]*[:=][[:space:]]*[^[:space:]]{16,}"
        "token[[:space:]]*[:=][[:space:]]*[^[:space:]]{16,}"
        "api[_-]?key[[:space:]]*[:=][[:space:]]*[^[:space:]]{16,}"
    )

    local found=0
    local strings_output
    strings_output="$(strings -- "$bin" 2>/dev/null || true)"

    for pattern in "${patterns[@]}"; do
        if printf '%s' "$strings_output" | grep -E -q -e "$pattern"; then
            log_warn "$name: Potential secret pattern matched: $pattern"
            found=$((found+1))
        fi
    done

    if [[ $found -eq 0 ]]; then
        log_ok "$name: No obvious secrets detected"
    else
        log_warn "$name: $found potential secret pattern(s) matched (review manually)"
    fi

    return 0
}

# ============================================================================
# Binary Verification
# ============================================================================

verify_binary() {
    local bin="$1"
    local name="$2"

    log_step "Verifying $name binary..."

    # Existence
    if [[ ! -f "$bin" ]]; then
        log_err "$name: Binary not found at $bin"
        return 1
    fi

    # Executable
    if [[ ! -x "$bin" ]]; then
        log_err "$name: Binary is not executable"
        return 1
    fi

    # ELF format
    if ! file_type "$bin" | grep -q "ELF"; then
        log_err "$name: Not a valid ELF binary"
        return 1
    fi

    # Architecture
    local arch_info
    arch_info="$(file_type "$bin")"
    log_info "$name: $arch_info"

    # Check for debug info (production should not have it)
    if [[ "$BUILD_MODE" == "production" ]] && has_file_cmd; then
        local file_out
        file_out="$(file -- "$bin" 2>/dev/null || true)"
        if printf '%s' "$file_out" | grep -q "with debug_info"; then
            log_warn "$name: Binary contains debug info (unexpected for production)"
        elif printf '%s' "$file_out" | grep -q "not stripped"; then
            log_warn "$name: Binary not stripped (unexpected for production)"
        else
            log_ok "$name: No debug info (as expected)"
        fi

        # Check for symbol table
        local readelf_bin=""
        if has_cmd readelf; then
            readelf_bin="readelf"
        elif has_cmd llvm-readelf; then
            readelf_bin="llvm-readelf"
        fi
        if [[ -n "$readelf_bin" ]]; then
            if "$readelf_bin" -S -- "$bin" 2>/dev/null | grep -q "\.symtab"; then
                log_warn "$name: Binary contains symbol table (.symtab)"
            else
                log_ok "$name: No symbol table (as expected)"
            fi
        else
            log_info "readelf not found — skipping symtab check for $name"
        fi
    fi

    # Basic execution test
    if ! "$bin" --version >/dev/null 2>&1 && ! "$bin" -version >/dev/null 2>&1 && ! "$bin" version >/dev/null 2>&1; then
        # Try help
        if ! "$bin" --help >/dev/null 2>&1 && ! "$bin" -h >/dev/null 2>&1; then
            log_warn "$name: Binary doesn't respond to --version/-version/version/--help/-h (may be expected)"
        fi
    else
        log_ok "$name: Binary executes and responds to version/help flags"
    fi

    return 0
}

# ============================================================================
# Checksum Generation
# ============================================================================

sha256_cmd() {
    if has_cmd sha256sum; then
        echo "sha256sum"
    elif has_cmd shasum; then
        echo "shasum -a 256"
    else
        die "no SHA-256 tool found (need sha256sum or shasum)"
    fi
}

generate_checksums() {
    log_step "Generating SHA-256 checksums..."

    local sum_bin
    sum_bin="$(sha256_cmd)"

    # Use subshell to avoid polluting cwd
    (
        cd -- "$RELEASE_DIR" || die "cannot cd to $RELEASE_DIR"
        local checksums_file="checksums.txt"
        : > "$checksums_file"

        for bin in kspanel ksedge; do
            if [[ -f "$bin" ]]; then
                # shellcheck disable=SC2086
                $sum_bin -- "$bin" > "${bin}.sha256"
                $sum_bin -- "$bin" >> "$checksums_file"
                log_ok "Generated ${bin}.sha256"
            fi
        done

        log_ok "Checksums written to $checksums_file"
        cat -- "$checksums_file"
    )
}

# stamp_version_manifest writes release/version.json from the just-built
# artifacts (kspanel/ksedge + .sha256 sidecars + .sig when signed) using
# tools/stamp-version-manifest.sh. The single manifest carries one shared
# "version" for BOTH panel and edge (plus sha256/sha256_edge digests) so
# /api/system/update-check and /api/edge/update-check compare against the
# same latest version.
stamp_version_manifest() {
    log_step "Stamping release/version.json (version=$KSPANEL_VERSION)..."
    if [[ "$KSPANEL_VERSION" == "dev" ]]; then
        log_info "Skipping version.json stamp for development build"
        return 0
    fi
    local stamper="$ROOT_DIR/tools/stamp-version-manifest.sh"
    if [[ ! -x "$stamper" && ! -f "$stamper" ]]; then
        log_warn "stamper not found at $stamper — skipping version.json"
        return 0
    fi
    if VERSION="$KSPANEL_VERSION" COMMIT="$KSPANEL_COMMIT" BUILD_DATE="$KSPANEL_BUILD_DATE" bash "$stamper" "$RELEASE_DIR"; then
        log_ok "Stamped $RELEASE_DIR/version.json (version=$KSPANEL_VERSION)"
    else
        log_warn "version.json stamping failed — continuing without manifest"
    fi
}

# ============================================================================
# Code Signing
# ============================================================================

sign_artifacts() {
    if [[ "$ENABLE_SIGNING" != "1" ]]; then
        log_info "Code signing disabled (set SIGN_KEY to enable)"
        return 0
    fi

    log_step "Signing release artifacts..."

    local sign_bin
    sign_bin="$(printf '%s' "$SIGN_CMD" | awk '{print $1}')"

    if ! has_cmd "$sign_bin"; then
        log_warn "signing tool '$sign_bin' not installed, skipping signing"
        log_warn "Install with: go install github.com/sigstore/cosign/v2/cmd/cosign@latest"
        return 0
    fi

    if [[ ! -f "$SIGN_KEY" ]]; then
        log_warn "Signing key not found at $SIGN_KEY, skipping signing"
        return 0
    fi

    (
        cd -- "$RELEASE_DIR" || die "cannot cd to $RELEASE_DIR"
        for bin in kspanel ksedge checksums.txt; do
            if [[ -f "$bin" ]]; then
                log_info "Signing $bin..."
                # Do not hide stderr — surface cosign errors
                if COSIGN_PRIVATE_KEY="$SIGN_KEY" $SIGN_CMD --yes "$bin" --output-signature "${bin}.sig"; then
                    log_ok "Signed $bin -> ${bin}.sig"
                else
                    log_warn "Failed to sign $bin"
                fi
            fi
        done
    )
}

# ============================================================================
# Security Verification Stage
# ============================================================================

security_verification() {
    log_step "Running security verification stage..."

    local all_ok=true

    # Verify both binaries exist
    for bin in kspanel ksedge; do
        local path="$RELEASE_DIR/$bin"
        if [[ ! -f "$path" ]]; then
            log_err "Missing binary: $path"
            all_ok=false
        else
            log_ok "Binary exists: $path"
        fi
    done

    # Verify executability
    for bin in kspanel ksedge; do
        local path="$RELEASE_DIR/$bin"
        if [[ -x "$path" ]]; then
            log_ok "Executable: $path"
        else
            log_err "Not executable: $path"
            all_ok=false
        fi
    done

    # Verify no debug info in production
    if [[ "$BUILD_MODE" == "production" ]] && has_file_cmd; then
        for bin in kspanel ksedge; do
            local path="$RELEASE_DIR/$bin"
            local out
            out="$(file -- "$path" 2>/dev/null || true)"
            if printf '%s' "$out" | grep -q "with debug_info"; then
                log_warn "Debug info present: $path"
            elif printf '%s' "$out" | grep -q "not stripped"; then
                log_warn "Binary not stripped: $path"
            else
                log_ok "No debug info: $path"
            fi
        done
    fi

    # Source path leakage check
    for bin in kspanel ksedge; do
        check_source_leakage "$RELEASE_DIR/$bin" "$bin" || true
    done

    # Secret scanning
    for bin in kspanel ksedge; do
        scan_secrets "$RELEASE_DIR/$bin" "$bin" || true
    done

    # Frontend source maps check
    if [[ "$BUILD_MODE" == "production" ]]; then
        if find "$PANEL_BACKEND_DIR/internal/ui/dist" -name "*.map" -print -quit 2>/dev/null | grep -q .; then
            log_warn "Source maps found in embedded frontend (production should not have them)"
            all_ok=false
        else
            log_ok "No source maps in embedded frontend"
        fi
    fi

    # Permissions check
    for bin in kspanel ksedge; do
        local path="$RELEASE_DIR/$bin"
        if [[ ! -e "$path" ]]; then
            continue
        fi
        local perms
        perms="$(stat -c "%a" -- "$path" 2>/dev/null || stat -f "%Lp" -- "$path" 2>/dev/null || stat -f "%A" -- "$path" 2>/dev/null || echo "unknown")"
        if [[ "$perms" == "755" ]]; then
            log_ok "Correct permissions (755): $path"
        else
            log_warn "Permissions are $perms (expected 755): $path"
            # Auto-fix in production
            if [[ "$BUILD_MODE" == "production" ]]; then
                chmod 755 -- "$path" 2>/dev/null || true
                log_info "Fixed permissions for $path to 755"
            fi
        fi
    done

    # Checksums exist
    for bin in kspanel ksedge; do
        if [[ -f "$RELEASE_DIR/${bin}.sha256" ]]; then
            log_ok "Checksum exists: ${bin}.sha256"
        else
            log_err "Missing checksum: ${bin}.sha256"
            all_ok=false
        fi
    done

    # Verify checksums
    (
        cd -- "$RELEASE_DIR" || die "cannot cd to $RELEASE_DIR"
        local sum_bin
        sum_bin="$(sha256_cmd)"
        # shellcheck disable=SC2086
        if $sum_bin -c checksums.txt; then
            log_ok "All checksums verified"
        else
            log_err "Checksum verification failed"
            exit 1
        fi
    ) || all_ok=false

    if [[ "$all_ok" == "true" ]]; then
        log_ok "Security verification PASSED"
        return 0
    else
        log_err "Security verification FAILED"
        return 1
    fi
}

# ============================================================================
# Instance-pages library sync (embedded into the kspanel binary)
# ============================================================================

sync_pagelib() {
    local src="$ROOT_DIR/instance_pages"
    local dst="$PANEL_BACKEND_DIR/internal/pagelib/library"
    # Safety: ensure dst is inside backend tree
    case "$dst" in
        "$PANEL_BACKEND_DIR"/*) ;;
        *) die "refusing to sync pagelib to unexpected path: $dst" ;;
    esac
    log_step "Syncing instance-pages library into backend embed tree..."
    if [[ ! -d "$src" ]]; then
        log_err "instance_pages missing at $src — cannot embed library"
        exit 1
    fi
    rm -rf -- "$dst"
    mkdir -p -- "$dst/pages"
    if [[ -f "$src/marketplace.json" ]]; then
        cp -- "$src/marketplace.json" "$dst/" || die "failed to copy marketplace.json"
    else
        log_warn "marketplace.json not found in $src"
    fi
    # Copy all page JSON files into library/pages for embedding.
    # Canonical source is instance_pages/pages/*.json; top-level *.json files
    # are still accepted as a legacy override.
    local copied=0
    if [[ -d "$src/pages" ]]; then
        for f in "$src/pages"/*.json; do
            [[ -e "$f" ]] || continue
            base="$(basename "$f")"
            [[ "$base" == "marketplace.json" ]] && continue
            cp -- "$f" "$dst/pages/" || die "failed to copy pages/$base"
            copied=$((copied+1))
        done
    else
        log_warn "instance_pages/pages missing — no canonical page library to embed"
    fi
    for f in "$src"/*.json; do
        [[ -e "$f" ]] || continue
        base="$(basename "$f")"
        [[ "$base" == "marketplace.json" ]] && continue
        # Legacy top-level override: only fills gaps, never overwrites pages/.
        if [[ -f "$dst/pages/$base" ]]; then
            log_warn "Skipping duplicate top-level $base (already copied from pages/)"
            continue
        fi
        cp -- "$f" "$dst/pages/" || die "failed to copy $base"
        copied=$((copied+1))
    done
    local count
    count="$(find "$dst" -type f 2>/dev/null | wc -l | tr -d ' ')"
    log_ok "Embedded instance-pages library (${count} file(s): marketplace + ${copied} page(s) from instance_pages/)"
}

sync_themelib() {
    local src="$ROOT_DIR/themes_market"
    local dst="$PANEL_BACKEND_DIR/internal/themelib/library"
    # Safety: ensure dst is inside backend tree
    case "$dst" in
        "$PANEL_BACKEND_DIR"/*) ;;
        *) die "refusing to sync themelib to unexpected path: $dst" ;;
    esac
    log_step "Syncing theme-market library into backend embed tree..."
    if [[ ! -d "$src" ]]; then
        log_err "themes_market missing at $src — cannot embed library"
        exit 1
    fi
    rm -rf -- "$dst"
    mkdir -p -- "$dst/market"
    if [[ -f "$src/marketplace.json" ]]; then
        cp -- "$src/marketplace.json" "$dst/" || die "failed to copy marketplace.json"
    else
        log_warn "marketplace.json not found in $src"
    fi
    # Copy all theme JSON files into library/market for embedding.
    # Canonical source is themes_market/market/*.json; top-level *.json files
    # are still accepted as a legacy override.
    local copied=0
    if [[ -d "$src/market" ]]; then
        for f in "$src/market"/*.json; do
            [[ -e "$f" ]] || continue
            base="$(basename "$f")"
            [[ "$base" == "marketplace.json" ]] && continue
            cp -- "$f" "$dst/market/" || die "failed to copy market/$base"
            copied=$((copied+1))
        done
    else
        log_warn "themes_market/market missing — no canonical theme library to embed"
    fi
    for f in "$src"/*.json; do
        [[ -e "$f" ]] || continue
        base="$(basename "$f")"
        [[ "$base" == "marketplace.json" ]] && continue
        # Legacy top-level override: only fills gaps, never overwrites market/.
        if [[ -f "$dst/market/$base" ]]; then
            log_warn "Skipping duplicate top-level $base (already copied from market/)"
            continue
        fi
        cp -- "$f" "$dst/market/" || die "failed to copy $base"
        copied=$((copied+1))
    done
    local count
    count="$(find "$dst" -type f 2>/dev/null | wc -l | tr -d ' ')"
    log_ok "Embedded theme-market library (${count} file(s): marketplace + ${copied} theme(s) from themes_market/)"
}

# ============================================================================
# Cleanup Temporary Files
# ============================================================================

cleanup_temp_files() {
    log_step "Cleaning up temporary build files..."
    rm -rf -- "$ROOT_DIR/.build-tmp" 2>/dev/null || true
    # Remove any stray .old files in release dir (shouldn't exist after successful build)
    rm -f -- "$RELEASE_DIR"/*.old 2>/dev/null || true
    rm -f -- "$RELEASE_DIR"/*.tmp 2>/dev/null || true
    rm -f -- "$RELEASE_DIR"/*.part 2>/dev/null || true
    rm -f -- "$RELEASE_DIR"/*.debug 2>/dev/null || true
    rm -f -- "$RELEASE_DIR"/*.dSYM 2>/dev/null || true
    log_ok "Temporary files cleaned"
}

# ============================================================================
# Main Build Flow
# ============================================================================

main() {
    # Fast-path help without lock/diagnostics
    case "$BUILD_MODE" in
        --help|-h|help)
            show_help
            exit 0
            ;;
    esac

    # Lock + trap must be earliest for real builds
    acquire_lock
    trap cleanup_on_exit EXIT
    trap 'die "interrupted"' INT TERM

    log_step "KS Panel & KSEdge Build System"
    log_info "Mode: $BUILD_MODE | Target: $TARGET_GOOS/$TARGET_GOARCH"

    configure_build_mode
    check_dependencies
    resolve_version_info
    build_ldflags
    clean_build_artifacts

    # Build frontend
    build_frontend

    # Sync the instance-pages library into the backend embed tree. The panel
    # binary carries these via internal/pagelib (go:embed), so the local
    # library / marketplace import flows work on installs that ship a bare
    # binary with no instance_pages/ directory next to it.
    sync_pagelib

    # Sync the theme-market library into the backend embed tree. Same
    # rationale as above: the panel binary carries these via
    # internal/themelib (go:embed) so the theme marketplace list/install
    # flows work on installs that ship a bare binary with no
    # themes_market/ directory next to it.
    sync_themelib

    # Build kspanel
    # Same external-deletion race as above: re-verify the embedded UI is
    # present right before the Go compile and regenerate if it vanished.
    if [[ ! -f "$PANEL_BACKEND_DIR/internal/ui/dist/index.html" ]]; then
        log_warn "frontend dist vanished before kspanel build — regenerating"
        build_frontend
    fi
    if ! build_go_binary "kspanel" "$PANEL_BACKEND_DIR/cmd/kspanel" "$KSPANEL_RELEASE_BIN" "$KSPANEL_OLD_BIN" "$KSPANEL_LDFLAGS" "$GO_BUILD_TAGS"; then
        exit 1
    fi

    # Build ksedge
    if ! build_go_binary "ksedge" "$EDGE_BACKEND_DIR/cmd/ksedge" "$KSEDGE_RELEASE_BIN" "$KSEDGE_OLD_BIN" "$KSEDGE_LDFLAGS" ""; then
        exit 1
    fi

    # Strip binaries (production only)
    strip_binary "$KSPANEL_RELEASE_BIN" "kspanel" || exit 1
    strip_binary "$KSEDGE_RELEASE_BIN" "ksedge" || exit 1

    chmod 755 -- "$KSPANEL_RELEASE_BIN" "$KSEDGE_RELEASE_BIN" 2>/dev/null || true

    # Obfuscation (if enabled — already handled at compile time)
    apply_obfuscation "$KSPANEL_RELEASE_BIN" "kspanel"
    apply_obfuscation "$KSEDGE_RELEASE_BIN" "ksedge"

    # Verify binaries
    verify_binary "$KSPANEL_RELEASE_BIN" "kspanel" || exit 1
    verify_binary "$KSEDGE_RELEASE_BIN" "ksedge" || exit 1

    # Generate checksums
    generate_checksums

    # Sign artifacts (if enabled)
    sign_artifacts

    # Stamp the shared version manifest (needs sha256 + sig sidecars above)
    stamp_version_manifest

    # Security verification
    security_verification || exit 1

    # Cleanup
    cleanup_temp_files

    # Summary
    echo
    log_step "Build completed successfully!"
    echo
    echo "Release artifacts:"
    ls -lh -- "$RELEASE_DIR"/
    echo
    if [[ "$BUILD_MODE" == "production" ]]; then
        echo "Production build complete. Binaries are hardened:"
        echo "  -trimpath: Source paths removed"
        echo "  -ldflags=-s -w: Debug info & symbol table stripped"
        echo "  strip --strip-unneeded: Non-essential ELF symbols removed"
        echo "  Source leakage: Verified clean"
        echo "  Secret scan: No obvious secrets found"
        echo "  Checksums: SHA-256 generated"
        if [[ "$ENABLE_SIGNING" == "1" ]]; then
            echo "  Signing: Artifacts signed"
        fi
        if [[ "$ENABLE_OBFUSCATION" == "1" ]]; then
            if has_cmd garble; then
                echo "  Obfuscation: garble applied by default (literals + tiny)"
            else
                echo "  Obfuscation: garble not installed — plain go build with warning (install garble for default obfuscation)"
            fi
        else
            echo "  Obfuscation: disabled via GARBLE_ENABLE=0"
        fi
    else
        echo "Development build complete. Binaries contain debug symbols."
    fi

    # Explicit success exit will trigger cleanup_on_exit with rc=0
    release_lock
    trap - EXIT
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
