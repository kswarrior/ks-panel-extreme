#!/usr/bin/env bash
# KS Panel — Retest Script
#
# Creates a test sandbox under /tmp, copies release binaries into it,
# seeds demo data, and launches the panel for manual testing.
#
# Usage:
#   ./retest.sh              # Launch on default port 8080
#   ./retest.sh 9090         # Launch on custom port

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
TEST_DIR="/tmp/kspanel-retest"

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

[[ -f "$RELEASE_DIR/kspanel" ]] || die "release/kspanel not found. Run ./rebuild.sh first."
[[ -x "$RELEASE_DIR/kspanel" ]] || die "release/kspanel is not executable."

# ============================================================================
# Test sandbox setup (/tmp)
# ============================================================================

log_step "Preparing test sandbox at $TEST_DIR..."
if [[ -d "$TEST_DIR" ]]; then
    log_warn "Existing test folder found — wiping for a clean run..."
    rm -rf "$TEST_DIR"
fi
mkdir -p "$TEST_DIR"

log_info "Copying binaries from release/ ..."
cp -f "$RELEASE_DIR/kspanel" "$TEST_DIR/"
if [[ -f "$RELEASE_DIR/ksedge" ]]; then
    cp -f "$RELEASE_DIR/ksedge" "$TEST_DIR/"
fi
chmod +x "$TEST_DIR"/kspanel "$TEST_DIR"/ksedge 2>/dev/null || true

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
