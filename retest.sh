#!/usr/bin/env bash
# KS Panel — Retest Script
#
# Creates a test sandbox under /tmp, copies release binaries into it,
# seeds demo data, and launches the panel for manual testing.
# If a panel from a previous run is still up, it is stopped first.
#
# Usage:
#   ./retest.sh              # Launch on default port 8080
#   ./retest.sh 9090         # Launch on custom port

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
TEST_DIR="/tmp/kspanel-retest"
# Persistent DB in repo storage (user requested ./storege/kspanel.db — handle both spellings)
STORAGE_DIR="$ROOT_DIR/storage"
STOREGE_DIR="$ROOT_DIR/storege"
STORAGE_DB="$STORAGE_DIR/kspanel.db"
STOREGE_DB="$STOREGE_DIR/kspanel.db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err() { echo -e "${RED}[ERR]${NC} $*" >&2; }
log_step() { echo -e "${BLUE}==>${NC} $*"; }

die() { log_err "$*"; exit 1; }

LAUNCH_PORT="${1:-8080}"

# ============================================================================
# Sanity checks
# ============================================================================

command -v openssl >/dev/null 2>&1 || die "openssl is required but not installed"

if [[ ! -f "$RELEASE_DIR/kspanel" ]]; then
    log_warn "release/kspanel not found — auto-running ./rebuild.sh first..."
    bash "$ROOT_DIR/rebuild.sh" || die "rebuild.sh failed. Aborting."
fi
[[ -x "$RELEASE_DIR/kspanel" ]] || die "release/kspanel is not executable."

# ============================================================================
# Stop any previously running sandbox instances
# ============================================================================

stop_pid() {
    local pid="$1"
    [[ -n "$pid" ]] || return 0
    kill "$pid" 2>/dev/null || return 0
    for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || return 0
        sleep 0.2
    done
    kill -9 "$pid" 2>/dev/null || true
}

kill_sandbox_binaries() {
    local bin="$1" pid exe
    for pid in $(pgrep -x "$bin" 2>/dev/null || true); do
        exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
        [[ "$exe" == "$TEST_DIR"/* ]] || continue
        log_info "Stopping old $bin (pid $pid)..."
        stop_pid "$pid"
    done
}

if pgrep -x kspanel >/dev/null 2>&1 || pgrep -x ksedge >/dev/null 2>&1; then
    log_step "Stopping previously running instances..."
    kill_sandbox_binaries kspanel
    kill_sandbox_binaries ksedge
fi

# ============================================================================
# Test sandbox setup (/tmp) — DB persisted in ./storage/kspanel.db
# ============================================================================

log_step "Preparing test sandbox at $TEST_DIR..."
if [[ -d "$TEST_DIR" ]]; then
    log_warn "Existing test folder found — wiping for a clean run..."
    rm -rf "$TEST_DIR"
fi
mkdir -p "$TEST_DIR"
# Persistent storage for DB (covers both ./storage and typo ./storege)
mkdir -p "$STORAGE_DIR" "$STOREGE_DIR"
# Keep both spellings in sync — canonical is storage/kspanel.db
if [[ -f "$STOREGE_DB" && ! -f "$STORAGE_DB" ]]; then
    cp -f "$STOREGE_DB" "$STORAGE_DB"
fi
# Always ensure the typo path exists as a symlink/copy of the canonical
ln -sf "$STORAGE_DB" "$STOREGE_DB" 2>/dev/null || cp -f "$STORAGE_DB" "$STOREGE_DB" 2>/dev/null || true
# Export so all kspanel invocations (seed, create:user, launch) use the persistent DB
export KSPANEL_DB="$STORAGE_DB"
export KSPANEL_DB_DSN="$STORAGE_DB"
log_info "Persistent DB: $STORAGE_DB (also $STOREGE_DB)"

log_info "Copying binaries from release/ ..."
cp -f "$RELEASE_DIR/kspanel" "$TEST_DIR/"
if [[ -f "$RELEASE_DIR/ksedge" ]]; then
    cp -f "$RELEASE_DIR/ksedge" "$TEST_DIR/"
fi
chmod +x "$TEST_DIR"/kspanel "$TEST_DIR"/ksedge 2>/dev/null || true

# Pre-seed localnode/ksedge from the local release copy when available.
# setup:localnode only downloads ksedge when <cwd>/localnode/ksedge/ksedge
# is missing — without this seed it hits the GitHub releases URL, which
# 404s on machines without access to that release asset.
if [[ -f "$RELEASE_DIR/ksedge" ]]; then
    mkdir -p "$TEST_DIR/localnode/ksedge"
    cp -f "$RELEASE_DIR/ksedge" "$TEST_DIR/localnode/ksedge/ksedge"
    chmod +x "$TEST_DIR/localnode/ksedge/ksedge"
fi

log_ok "Test folder ready:"
ls -lh "$TEST_DIR"

cd "$TEST_DIR"

# ============================================================================
# Seed, configure, launch
# ============================================================================

export KSPANEL_SESSION_SECRET="$(openssl rand -base64 32)"

./kspanel seed
./kspanel create:user --username kshosting --email kshosting@ksmail.com --password kshosting@55 --role 1
./kspanel import:template minecraft
./kspanel setup:localnode --port 4040

echo
log_step "Launching kspanel on port $LAUNCH_PORT (background)..."
LOG_FILE="$TEST_DIR/kspanel.log"
PID_FILE="$TEST_DIR/kspanel.pid"

nohup ./kspanel launch --port "$LAUNCH_PORT" >"$LOG_FILE" 2>&1 &
PANEL_PID=$!
echo "$PANEL_PID" > "$PID_FILE"

# Give it a moment to boot, then verify
sleep 3
if kill -0 "$PANEL_PID" 2>/dev/null; then
    log_ok "kspanel running in background (PID $PANEL_PID)"
    log_ok "Logs:   $LOG_FILE"
    log_ok "Stop:   kill \$(cat $PID_FILE)"
    tail -n 20 "$LOG_FILE" || true
else
    log_err "kspanel failed to start — last log lines:"
    tail -n 40 "$LOG_FILE" || true
    exit 1
fi
