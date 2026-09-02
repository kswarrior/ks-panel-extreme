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
# Ephemeral DB in /tmp (fresh each run, no repo persistence)
DB_PATH="$TEST_DIR/kspanel.db"

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
# If the requested LAUNCH_PORT is already occupied by a non-sandbox process,
# and it is the default 5050, auto-select a free port so retest doesn't fail
# on busy dev boxes. Mirrors the launch.go fallback for the default port.
# For a non-default explicit port (e.g. 8080) we keep the requested value —
# launch will fail visibly so the operator knows the port is taken.
find_free_port() {
    python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])' 2>/dev/null || \
    python -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])' 2>/dev/null || echo 0
}
is_port_busy() {
    local p="$1"
    # Try ss, then netstat, then bash /dev/tcp probe, then python
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | grep -q ":${p} " && return 0
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | grep -q ":${p} " && return 0
    fi
    # Fallback: try to bind with python
    if python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1', $p)); s.close()" 2>/dev/null; then
        return 0
    fi
    # Try bash tcp probe
    (echo >/dev/tcp/127.0.0.1/"$p") >/dev/null 2>&1 && return 0
    return 1
}
# Export so every kspanel invocation in this sandbox (seed, setup:localnode,
# launch) sees the same panel port. Without this, setup:localnode's
# ensurePanelUp auto-starts a panel on 5050 (its hard-coded default) and the
# final `launch --port 8080` below leaves TWO panels sharing the same DB —
# triggering the DDoS port-switcher duplicate warning.
export KSPANEL_PORT="$LAUNCH_PORT"
if [[ "$LAUNCH_PORT" == "5050" ]] && is_port_busy "$LAUNCH_PORT"; then
    FREE_P="$(find_free_port)"
    if [[ "$FREE_P" != "0" && -n "$FREE_P" ]]; then
        log_warn "Port $LAUNCH_PORT is busy — auto-selected free port $FREE_P for this run"
        LAUNCH_PORT="$FREE_P"
        export KSPANEL_PORT="$LAUNCH_PORT"
    fi
fi

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
# Test sandbox setup (/tmp) — DB lives in /tmp/kspanel-retest/kspanel.db
# ============================================================================

log_step "Preparing test sandbox at $TEST_DIR..."
if [[ -d "$TEST_DIR" ]]; then
    log_warn "Existing test folder found — wiping for a clean run..."
    rm -rf "$TEST_DIR"
fi
mkdir -p "$TEST_DIR"
# Remove legacy persistent storage folders from repo root if they exist
for _legacy_dir in "$ROOT_DIR/storage" "$ROOT_DIR/storege"; do
    if [[ -e "$_legacy_dir" ]]; then
        log_info "Removing legacy storage folder $_legacy_dir..."
        rm -rf "$_legacy_dir"
    fi
done
# Export so all kspanel invocations (seed, create:user, launch) use the ephemeral /tmp DB
export KSPANEL_DB="$DB_PATH"
export KSPANEL_DB_DSN="$DB_PATH"
# KSPANEL_PORT already exported above; re-export to keep it visible after DB vars
export KSPANEL_PORT="$LAUNCH_PORT"
log_info "Ephemeral DB: $DB_PATH (in /tmp, fresh each run)"
log_info "Panel port: $LAUNCH_PORT (KSPANEL_PORT=$KSPANEL_PORT)"

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
# DB lives directly at $TEST_DIR/kspanel.db (ephemeral, no symlinks needed)

# ============================================================================
# Seed, configure, launch
# ============================================================================

export KSPANEL_SESSION_SECRET="$(openssl rand -base64 32)"

./kspanel seed
./kspanel create:user --username kshosting --email kshosting@ksmail.com --password kshosting@55 --role 1 || true
./kspanel create:user --username kswarrior --email kswarriorpro@gmail.com --password 'KSabu@123@hassan' --role 3 || true
./kspanel import:template minecraft || true
./kspanel setup:localnode --port 4040 || true

# setup:localnode's ensurePanelUp may have auto-started a panel on
# $KSPANEL_PORT (now $LAUNCH_PORT). That intermediate panel would be a
# duplicate with the final `kspanel launch --port $LAUNCH_PORT` below and
# would trigger the DDoS port-switcher duplicate warning
# ("stop the old instance so DDoS port switching can free ports cleanly").
# Stop any intermediate sandbox panel before the final launch, but keep ksedge.
if pgrep -x kspanel >/dev/null 2>&1; then
    # Only kill if the panel is indeed the setup-launched one on KSPANEL_PORT;
    # kill_sandbox_binaries is scoped to $TEST_DIR so it won't touch a system-wide
    # panel outside the sandbox.
    log_info "Stopping intermediate panel from setup:localnode before final launch..."
    kill_sandbox_binaries kspanel
    sleep 1
    # If setup:localnode had to auto-bump 5050 to an ephemeral port (busy box),
    # its edge config now points at that ephemeral port but the final panel
    # will be on $LAUNCH_PORT — patch the edge config so heartbeats land.
    if [[ -f "localnode/ksedge/config.json" ]] && command -v python3 >/dev/null 2>&1; then
        python3 - "$LAUNCH_PORT" <<'PY' 2>/dev/null || true
import json, os, sys
port = sys.argv[1] if len(sys.argv)>1 else "8080"
cfg_path = "localnode/ksedge/config.json"
try:
    with open(cfg_path) as f:
        cfg = json.load(f)
    want = f"http://127.0.0.1:{port}"
    if cfg.get("panel_url") != want:
        cfg["panel_url"] = want
        with open(cfg_path, "w") as f:
            json.dump(cfg, f, indent=2)
        print(f"patched {cfg_path} panel_url -> {want}")
except Exception as e:
    pass
PY
    fi
fi

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
