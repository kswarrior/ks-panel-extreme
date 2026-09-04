#!/usr/bin/env bash
# stamp-version-manifest.sh — stamp release/version.json from build artifacts.
#
# The panel (update_verify.go) and edge (update/verify.go) verify downloads
# against the digests published in version.json, so every release MUST
# re-stamp the manifest after rebuild.sh regenerates the binaries +
# release/*.sha256 sidecars (+ *.sig when SIGN_KEY is set):
#
#   VERSION=0.1.2 COMMIT=abc1234 ./tools/stamp-version-manifest.sh [release-dir]
#
# Env:
#   VERSION     release semver, required (also: $1 may carry it instead)
#   COMMIT      short git sha (default: git rev-parse --short HEAD)
#   BUILD_DATE  ISO-8601 UTC (default: now)
#   NOTES       single-line release highlights (default: "")
# Reads <dir>/kspanel.sha256 + ksedge.sha256 (+ .sig sidecars when present)
# and writes <dir>/version.json with the extended schema:
#   version/commit/build_date/notes/size_bytes (informational) +
#   sha256/sha256_edge (verified pre-swap) +
#   signature/signature_edge (cosign output, informational).
# No new dependencies: only bash + sha256 sidecar files rebuild.sh already
# produces. Upload the stamped version.json next to the binaries wherever
# kspanelVersionURL / ksedgeVersionURL point (HF bucket release/ today).
set -euo pipefail

DIR="${1:-release}"
VERSION="${VERSION:-}"
if [[ -z "$VERSION" ]]; then
    echo "usage: VERSION=0.1.2 [COMMIT=abc] [BUILD_DATE=...] [NOTES=...] $0 [release-dir]" >&2
    exit 1
fi
COMMIT="${COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
NOTES="${NOTES:-}"

first_field() { awk '{print $1}' "$1" 2>/dev/null || true; }

sha_panel=""; sha_edge=""; sig_panel=""; sig_edge=""; size_bytes=0
[[ -f "$DIR/kspanel.sha256" ]] && sha_panel="$(first_field "$DIR/kspanel.sha256")"
[[ -f "$DIR/ksedge.sha256" ]] && sha_edge="$(first_field "$DIR/ksedge.sha256")"
[[ -f "$DIR/kspanel.sig" ]] && sig_panel="$(tr -d '\n' < "$DIR/kspanel.sig")"
[[ -f "$DIR/ksedge.sig" ]] && sig_edge="$(tr -d '\n' < "$DIR/ksedge.sig")"
if [[ -f "$DIR/kspanel" ]]; then
    size_bytes="$(stat -c%s "$DIR/kspanel" 2>/dev/null || stat -f%z "$DIR/kspanel" 2>/dev/null || echo 0)"
fi

if [[ -z "$sha_panel" ]]; then echo "warn: $DIR/kspanel.sha256 missing — manifest sha256 will be empty (panel installs unverified)" >&2; fi
if [[ -z "$sha_edge" ]]; then echo "warn: $DIR/ksedge.sha256 missing — manifest sha256_edge will be empty (edge installs unverified)" >&2; fi

json_escape() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

{
    printf '{\n'
    printf '  "version": "%s",\n' "$(json_escape "$VERSION")"
    printf '  "commit": "%s",\n' "$(json_escape "$COMMIT")"
    printf '  "build_date": "%s",\n' "$(json_escape "$BUILD_DATE")"
    printf '  "notes": "%s",\n' "$(json_escape "$NOTES")"
    printf '  "size_bytes": %s,\n' "$size_bytes"
    printf '  "sha256": "%s",\n' "$(json_escape "$sha_panel")"
    printf '  "sha256_edge": "%s",\n' "$(json_escape "$sha_edge")"
    printf '  "signature": "%s",\n' "$(json_escape "$sig_panel")"
    printf '  "signature_edge": "%s"\n' "$(json_escape "$sig_edge")"
    printf '}\n'
} > "$DIR/version.json"

echo "stamped $DIR/version.json (version=$VERSION commit=$COMMIT size=$size_bytes)"
echo "  sha256=kspanel:${sha_panel:0:12}… ksedge:${sha_edge:0:12}…"
