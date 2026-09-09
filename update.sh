#!/usr/bin/env bash
# KS Panel & KSEdge — Update Script
#
# Self-updates the release binaries in place via their own CLI:
#   ./kspanel update --apply   (SHA-verified, atomic swap, old kept as .old)
#   ./ksedge  update --apply   (same)
# Run it before retest.sh when you want the sandbox to exercise the latest
# published release instead of the locally built binaries. retest.sh calls
# this automatically when UPDATE_BEFORE_RETEST=1 is set.
#
# Usage:
#   ./update.sh              # Apply available updates to both binaries
#   ./update.sh --check      # Dry run: report only, change nothing
#   ./update.sh --force      # Reinstall even when versions already match
#   ./update.sh --help       # Show help

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$ROOT_DIR/release"

# Colors (disabled when not a TTY, same convention as retest.sh/rebuild.sh)
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

log_info() { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
log_ok() { printf "${GREEN}[OK]${NC} %s\n" "$*"; }
log_warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*" >&2; }
log_err() { printf "${RED}[ERR]${NC} %s\n" "$*" >&2; }
log_step() { printf "${BLUE}==>${NC} %s\n" "$*"; }

die() { log_err "$*"; exit 1; }

show_help() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
}

CHECK_ONLY=0
FORCE=0
for arg in "$@"; do
    case "$arg" in
        --check) CHECK_ONLY=1 ;;
        --force) FORCE=1 ;;
        --help|-h|help) show_help; exit 0 ;;
        *) die "Unknown argument: $arg. Use --check, --force or --help." ;;
    esac
done

[[ -x "$RELEASE_DIR/kspanel" ]] || die "release/kspanel not found or not executable — run ./rebuild.sh first."
[[ -x "$RELEASE_DIR/ksedge" ]] || die "release/ksedge not found or not executable — run ./rebuild.sh first."
command -v openssl >/dev/null 2>&1 || die "openssl is required but not installed"

# The kspanel CLI requires KSPANEL_SESSION_SECRET at startup (auth package
# guard) even for read-only commands. The update check never touches the
# session layer, so an ephemeral secret is enough — same approach as retest.sh.
if [[ -z "${KSPANEL_SESSION_SECRET:-}" ]]; then
    export KSPANEL_SESSION_SECRET
    KSPANEL_SESSION_SECRET="$(openssl rand -base64 32)"
fi

EXTRA_ARGS=()
[[ "$FORCE" == "1" ]] && EXTRA_ARGS+=(--force)
if [[ "$CHECK_ONLY" == "1" ]]; then
    log_step "Checking for updates (dry run, nothing will be installed)..."
else
    log_step "Applying updates to release binaries..."
fi

failures=0

log_step "kspanel..."
if [[ "$CHECK_ONLY" == "1" ]]; then
    "$RELEASE_DIR/kspanel" update || failures=$((failures+1))
else
    "$RELEASE_DIR/kspanel" update --apply "${EXTRA_ARGS[@]}" || failures=$((failures+1))
fi

log_step "ksedge..."
if [[ "$CHECK_ONLY" == "1" ]]; then
    "$RELEASE_DIR/ksedge" update || failures=$((failures+1))
else
    "$RELEASE_DIR/ksedge" update --apply "${EXTRA_ARGS[@]}" || failures=$((failures+1))
fi

if [[ "$failures" -ne 0 ]]; then
    die "update.sh finished with $failures failure(s)."
fi
if [[ "$CHECK_ONLY" == "1" ]]; then
    log_ok "Check complete — nothing was installed."
else
    log_ok "Update complete — restart any running instances so the new binaries take over."
fi
