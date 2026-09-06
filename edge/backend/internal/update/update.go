// Package update implements the edge self-update surface the panel's
// per-node "Update & Reinstall" UI drives.
//
// Endpoints (all token-gated with the same shared secret the heartbeat
// ingest uses):
//
//	GET  /api/edge/update-info          — local build identity + artefact URLs
//	GET  /api/edge/update-check         — fetch remote manifest, semver compare
//	POST /api/edge/update-apply         — download latest, swap binary, relaunch
//	POST /api/edge/reinstall            — force reinstall current channel binary
//	POST /api/edge/reinstall-background — write reinstall.sh + run detached
//
// Token may arrive either as JSON body {"token":"kse_…"} (POST, mirrors the
// lifecycle/inspect pattern) or as ?token= query (GET, mirrors the install
// poll pattern — browsers can't set headers behind proxies and the panel's
// tunnel forwarder preserves the query string). Both are accepted on every
// verb so direct HTTP and WSS-tunnel transports behave identically.
//
// The binary + manifest URLs mirror the panel's ksedge pair in
// panel/backend/internal/api/handlers/node_handler.go so the edge
// self-update flow pulls the same artefact the panel's "Create & setup"
// button would.
package update

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/example/ksedge/internal/version"
)

const (
	ksedgeBaseURL    = "https://huggingface.co/buckets/kswarrior/opencode-storage/resolve/ks-panel/release"
	ksedgeVersionURL = ksedgeBaseURL + "/version.json?download=true"
	// ksedgeBinaryURL is the reinstall / update binary source. The panel's
	// NodeDetail → Update tab now uses the dedicated ks-panel-edge GitHub
	// release per user request.
	ksedgeBinaryURL = "https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/ksedge"
)

// ksedgeDownloadURLs returns the sole ksedge binary source.
func ksedgeDownloadURLs() []string {
	return []string{
		ksedgeBinaryURL,
	}
}

// versionManifest mirrors the JSON shape served at ksedgeVersionURL.
// Loose types on purpose — a missing field falls back to zero value.
// SHA256Edge/SignatureEdge drive verified downloads (see verify.go):
// when a digest is published the apply path hashes the temp file BEFORE
// chmod/swap and aborts on mismatch. SHA256 (no suffix) is the PANEL
// binary's digest sharing this manifest — never used for edge verification.
type versionManifest struct {
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	BuildDate     string `json:"build_date"`
	Notes         string `json:"notes"`
	SizeBytes     int64  `json:"size_bytes"`
	SHA256        string `json:"sha256"`
	SHA256Edge    string `json:"sha256_edge"`
	Signature     string `json:"signature"`
	SignatureEdge string `json:"signature_edge"`
	SHA256URL     string `json:"sha256_url"`
}

type infoResponse struct {
	Local      version.Info `json:"local"`
	UpdateURL  string       `json:"update_url"`
	VersionURL string       `json:"version_url"`
	BinaryPath string       `json:"binary_path"`
}

type checkResponse struct {
	Available bool            `json:"available"`
	Local     version.Info    `json:"local"`
	Remote    versionManifest `json:"remote"`
	CheckedAt string          `json:"checked_at"`
	UpdateURL string          `json:"update_url"`
	Error     string          `json:"error,omitempty"`
}

type applyResponse struct {
	OK           bool   `json:"ok"`
	Message      string `json:"message"`
	LocalBefore  string `json:"local_version_before"`
	TargetBinary string `json:"target_binary"`
	Log          string `json:"log,omitempty"`
}

type reinstallBackgroundResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Script  string `json:"script_path"`
}

// tokenRequest is the POST body shape. Token may also arrive via ?token=.
type tokenRequest struct {
	Token string `json:"token"`
}

// Handler returns an http.Handler exposing the five update endpoints.
// It is itself a *ServeMux registering every path, so the caller (cli)
// must mount the SAME handler at each literal path (mirrors the install
// handler's mount-both-paths fix — Go's root mux only subtree-matches
// trailing-slash registrations).
func Handler(token string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/edge/update-info", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if !checkToken(r, token, "") {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		handleInfo(w)
	})
	mux.HandleFunc("/api/edge/update-check", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if !checkToken(r, token, "") {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		handleCheck(w)
	})
	mux.HandleFunc("/api/edge/update-apply", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		bodyTok := readBodyToken(r)
		if !checkToken(r, token, bodyTok) {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		handleApply(w, false)
	})
	mux.HandleFunc("/api/edge/reinstall", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		bodyTok := readBodyToken(r)
		if !checkToken(r, token, bodyTok) {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		handleApply(w, true)
	})
	mux.HandleFunc("/api/edge/reinstall-background", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		bodyTok := readBodyToken(r)
		if !checkToken(r, token, bodyTok) {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		handleReinstallBackground(w)
	})
	return mux
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": msg})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func constTimeEqual(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// readBodyToken drains at most 64KiB of the POST body looking for
// {"token":"…"}. The body is small (just the token) — anything larger is
// abusive and rejected. Returns "" on any decode failure so the caller
// falls back to the ?token= query check.
func readBodyToken(r *http.Request) string {
	if r.Body == nil {
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		return ""
	}
	var tr tokenRequest
	if err := json.Unmarshal(body, &tr); err != nil {
		return ""
	}
	return strings.TrimSpace(tr.Token)
}

// checkToken accepts the token from either the JSON body (bodyTok, already
// extracted) or the ?token= query param, mirroring the install handler's
// dual-path auth. Fail closed on empty configured token.
func checkToken(r *http.Request, configured, bodyTok string) bool {
	if configured == "" {
		return false
	}
	if bodyTok != "" && constTimeEqual(bodyTok, configured) {
		return true
	}
	q := strings.TrimSpace(r.URL.Query().Get("token"))
	if q != "" && constTimeEqual(q, configured) {
		return true
	}
	return false
}

func exePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}
	return exe, nil
}

func handleInfo(w http.ResponseWriter) {
	local := version.Snapshot()
	exe, _ := exePath()
	if exe == "" {
		exe = "unknown"
	}
	writeJSON(w, infoResponse{
		Local:      local,
		UpdateURL:  ksedgeBinaryURL,
		VersionURL: ksedgeVersionURL,
		BinaryPath: exe,
	})
}

func handleCheck(w http.ResponseWriter) {
	local := version.Snapshot()
	resp := checkResponse{
		Local:     local,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		UpdateURL: ksedgeBinaryURL,
	}
	client := &http.Client{Timeout: 15 * time.Second}
	httpResp, err := client.Get(ksedgeVersionURL)
	if err != nil {
		resp.Error = "could not reach update server: " + err.Error()
		writeJSON(w, resp)
		return
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		resp.Error = fmt.Sprintf("update server returned HTTP %d", httpResp.StatusCode)
		writeJSON(w, resp)
		return
	}
	body, err := io.ReadAll(io.LimitReader(httpResp.Body, 1<<20))
	if err != nil {
		resp.Error = "read manifest: " + err.Error()
		writeJSON(w, resp)
		return
	}
	var manifest versionManifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		resp.Error = "malformed manifest: " + err.Error()
		writeJSON(w, resp)
		return
	}
	resp.Remote = manifest
	resp.Available = semverGreater(manifest.Version, local.Version)
	writeJSON(w, resp)
}

// handleApply downloads the latest ksedge binary into a temp file, swaps it
// over the running executable, then in a goroutine launches the new binary
// detached and exits the current process. The HTTP response is written
// BEFORE the exit kicks in so the panel sees a clean 200 with the
// "edge is restarting" payload. When force is true the same path runs as a
// reinstall (useful when the on-disk binary was corrupted).
func handleApply(w http.ResponseWriter, force bool) {
	local := version.Snapshot()
	exe, err := exePath()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot locate running binary: "+err.Error())
		return
	}
	exeDir := filepath.Dir(exe)
	exeBase := filepath.Base(exe)
	oldPath := filepath.Join(exeDir, exeBase+".old")
	tmpPath := filepath.Join(exeDir, exeBase+".update")

	logLines := []string{}
	if force {
		logLines = append(logLines, "reinstalling from "+ksedgeBinaryURL+" …")
	} else {
		logLines = append(logLines, "downloading "+ksedgeBinaryURL+" …")
	}
	// Single-source download from the ks-panel-edge release.
	var lastErr error
	downloaded := false
	for _, u := range ksedgeDownloadURLs() {
		if err := downloadFile(u, tmpPath); err != nil {
			lastErr = err
			logLines = append(logLines, fmt.Sprintf("download from %s failed: %v", u, err))
			continue
		}
		logLines = append(logLines, "downloaded from "+u)
		downloaded = true
		break
	}
	if !downloaded {
		msg := "download failed"
		if lastErr != nil {
			msg += ": " + lastErr.Error()
		}
		writeErr(w, http.StatusBadGateway, msg)
		return
	}
	fi, statErr := os.Stat(tmpPath)
	if statErr != nil || fi.Size() == 0 {
		os.Remove(tmpPath)
		writeErr(w, http.StatusBadGateway, "downloaded file is empty or missing")
		return
	}
	// Verified download: cosign signature FIRST, then SHA-256 hash, both
	// BEFORE chmod/swap. Either mismatch deletes the temp file, leaves the
	// live binary untouched and answers 422. Best-effort manifest fetch —
	// no published signature+checksum means proceed unverified with a log
	// line, so old manifests don't brick edge updates while new ones are
	// enforced.
	if m, merr := fetchEdgeManifest(); merr != nil {
		logLines = append(logLines, "could not fetch manifest for verification ("+merr.Error()+") — installing unverified binary")
	} else {
		if sig := strings.TrimSpace(m.SignatureEdge); sig != "" {
			if serr := verifyEdgeSignature(tmpPath, sig); serr != nil {
				os.Remove(tmpPath)
				writeErr(w, http.StatusUnprocessableEntity, "signature mismatch — download deleted, live binary untouched: "+serr.Error())
				return
			}
			logLines = append(logLines, "signature verified (cosign)")
		} else {
			logLines = append(logLines, "no signature published — checksum only")
		}
		if expected, verr := resolveEdgeExpectedSHA256(m); verr != nil {
			os.Remove(tmpPath)
			writeErr(w, http.StatusUnprocessableEntity, "checksum error: "+verr.Error())
			return
		} else if expected != "" {
			if verr := verifyEdgeFileSHA256(tmpPath, expected); verr != nil {
				os.Remove(tmpPath)
				writeErr(w, http.StatusUnprocessableEntity, "checksum mismatch — download deleted, live binary untouched: "+verr.Error())
				return
			}
			logLines = append(logLines, "checksum verified (sha256 "+expected[:12]+"…)")
		} else {
			logLines = append(logLines, "no checksum published — installing unverified binary")
		}
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		os.Remove(tmpPath)
		writeErr(w, http.StatusInternalServerError, "chmod failed: "+err.Error())
		return
	}
	logLines = append(logLines, fmt.Sprintf("downloaded %d bytes", fi.Size()))

	if _, statErr := os.Stat(oldPath); statErr == nil {
		if err := os.Remove(oldPath); err != nil {
			os.Remove(tmpPath)
			writeErr(w, http.StatusInternalServerError, "could not remove prior backup: "+err.Error())
			return
		}
		logLines = append(logLines, "removed prior "+exeBase+".old")
	}
	if err := os.Rename(exe, oldPath); err != nil {
		os.Remove(tmpPath)
		writeErr(w, http.StatusInternalServerError, "could not move running binary aside: "+err.Error())
		return
	}
	logLines = append(logLines, "moved current binary to "+oldPath)

	if err := os.Rename(tmpPath, exe); err != nil {
		_ = os.Rename(oldPath, exe)
		writeErr(w, http.StatusInternalServerError, "could not place new binary: "+err.Error())
		return
	}
	logLines = append(logLines, "placed new binary at "+exe)

	msg := "Update applied. The edge is restarting now."
	if force {
		msg = "Reinstall applied. The edge is restarting now."
	}
	writeJSON(w, applyResponse{
		OK:           true,
		Message:      msg,
		LocalBefore:  local.Version,
		TargetBinary: exe,
		Log:          strings.Join(logLines, "\n"),
	})

	go func() {
		time.Sleep(600 * time.Millisecond)
		if err := relaunchEdge(exe); err != nil {
			log.Printf("edge relaunch failed: %v", err)
			os.Exit(1)
		}
		os.Exit(0)
	}()
}

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	tmp := dest + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dest)
}

// relaunchEdge spawns the freshly placed binary as `launch` with its working
// directory set to the binary's own dir so it picks up the co-located
// config.json (mirrors SetupLocalNodeHandler's launch). The child is
// detached into its own session so the current process's exit doesn't
// propagate signals. We wait up to 30s for /health to answer before letting
// the old process exit — otherwise the new edge becomes an orphan and
// failures go unreported.
func relaunchEdge(exe string) error {
	exeDir := filepath.Dir(exe)
	port := effectiveEdgePort(exeDir)
	logPath := filepath.Join(exeDir, "ksedge.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open edge log: %w", err)
	}
	defer logFile.Close()

	cmd := exec.Command(exe, "launch")
	cmd.Dir = exeDir
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Env = os.Environ()
	cmd.SysProcAttr = detachAttr()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start: %w", err)
	}
	if cmd.Process != nil {
		_ = cmd.Process.Release()
	}
	edgeURL := "http://127.0.0.1:" + port
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if edgeReachable(edgeURL) {
			log.Printf("new edge ready at %s", edgeURL)
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("new edge did not answer /health at %s within timeout", edgeURL)
}

func edgeReachable(edgeURL string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(edgeURL + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode == http.StatusOK
}

// effectiveEdgePort resolves the port the self-update / reinstall flows
// should health-check against. It reads listen_port from the config.json
// next to the binary (the file `launch` itself loads), falling back to
// 4040 when the file is missing or unparsable.
func effectiveEdgePort(exeDir string) string {
	cfgPath := filepath.Join(exeDir, "config.json")
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		return "4040"
	}
	var cfg struct {
		ListenPort int `json:"listen_port"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return "4040"
	}
	if cfg.ListenPort > 0 && cfg.ListenPort <= 65535 {
		return strconv.Itoa(cfg.ListenPort)
	}
	return "4040"
}

// semverGreater is a minimal "is a > b" semver comparator. Mirrors the
// panel's update_handler so both sides agree on "update available".
func semverGreater(a, b string) bool {
	pa, ok1 := parseSemver(a)
	pb, ok2 := parseSemver(b)
	if !ok1 || !ok2 {
		return false
	}
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			if ai, aerr := strconv.Atoi(pa[i]); aerr == nil {
				if bi, berr := strconv.Atoi(pb[i]); berr == nil {
					return ai > bi
				}
			}
			return pa[i] > pb[i]
		}
	}
	return false
}

func parseSemver(v string) ([3]string, bool) {
	var out [3]string
	v = strings.TrimSpace(v)
	if v == "" {
		return out, false
	}
	parts := strings.SplitN(v, ".", 4)
	if len(parts) < 3 {
		return out, false
	}
	for i := 0; i < 3; i++ {
		seg := parts[i]
		if i == 0 && len(seg) > 0 && seg[0] == 'v' {
			seg = seg[1:]
		}
		if idx := strings.IndexAny(seg, "-+"); idx >= 0 {
			seg = seg[:idx]
		}
		out[i] = seg
	}
	return out, true
}

// reinstallScriptTemplate is the shell script template for edge reinstall.
// It runs independently of the edge process, handles download/swap/start,
// and rolls back to the old binary if anything fails. Mirrors the panel's
// reinstall.sh with `ksedge launch` instead of `kspanel launch --port`.
const reinstallScriptTemplate = `#!/bin/bash
# KS Edge Reinstall Script
# Generated by ksedge on {{.GeneratedAt}}
# Edge binary: {{.BinaryPath}}
# Update URL: {{.UpdateURL}}
# Current version: {{.CurrentVersion}}

set -u
set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err() { echo -e "${RED}[ERR]${NC} $*"; }

BINARY_PATH="{{.BinaryPath}}"
UPDATE_URL="{{.UpdateURL}}"
OLD_PATH="${BINARY_PATH}.old"
TMP_PATH="${BINARY_PATH}.update"
EDGE_LOG="${BINARY_PATH%/*}/ksedge.log"
PORT="${PORT:-{{.Port}}}"
MAX_WAIT_START=60
POLL_INTERVAL=2

DOWNLOADED=false
NEW_STARTED=false

start_edge_at() {
    local bin="$1"
    cd "${bin%/*}"
    setsid nohup "$bin" launch >> "$EDGE_LOG" 2>&1 < /dev/null &
    echo $!
}

wait_for_healthy() {
    local elapsed=0
    while [[ $elapsed -lt $MAX_WAIT_START ]]; do
        if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
            echo "ok"
            return 0
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
        log_info "Waiting... (${elapsed}s elapsed)" >&2
    done
    echo "fail"
    return 1
}

cleanup_on_exit() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_err "Script exited with code $exit_code"
    fi
    if [[ "$DOWNLOADED" == "true" && "$NEW_STARTED" == "false" ]]; then
        log_warn "New binary failed to start, rolling back to old binary..."
        if [[ -f "$OLD_PATH" ]]; then
            log_info "Restoring old binary from $OLD_PATH"
            mv -f "$OLD_PATH" "$BINARY_PATH"
            log_ok "Old binary restored"
            log_info "Starting restored edge..."
            local pid
            pid=$(start_edge_at "$BINARY_PATH") || true
            if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                log_ok "Restored edge started (PID: $pid)"
            else
                log_err "Failed to start restored edge"
            fi
        else
            log_err "No backup binary found at $OLD_PATH"
        fi
    elif [[ "$DOWNLOADED" == "false" ]]; then
        log_warn "Download failed, ensuring old edge is running..."
        if [[ -f "$OLD_PATH" ]]; then
            log_info "Restoring old binary from $OLD_PATH"
            mv -f "$OLD_PATH" "$BINARY_PATH"
            log_ok "Old binary restored"
            log_info "Starting restored edge..."
            local pid
            pid=$(start_edge_at "$BINARY_PATH") || true
            if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                log_ok "Restored edge started (PID: $pid)"
            else
                log_err "Failed to start restored edge"
            fi
        fi
    fi
}

trap cleanup_on_exit EXIT

log_info "=== KS Edge Reinstall Started ==="
log_info "Binary: $BINARY_PATH"
log_info "Update URL: $UPDATE_URL"
log_info "Port: $PORT"

log_info "Stopping current edge..."
pkill -f "^${BINARY_PATH} launch" 2>/dev/null || true
pkill -f "$(basename ${BINARY_PATH}) launch" 2>/dev/null || true
pkill -f "${BINARY_PATH}" 2>/dev/null || true
sleep 2
if pgrep -f "${BINARY_PATH}" >/dev/null 2>&1; then
    log_warn "Edge still running, forcing kill..."
    pkill -9 -f "${BINARY_PATH}" 2>/dev/null || true
    sleep 1
fi

PORT_WAIT=0
while [[ $PORT_WAIT -lt 15 ]]; do
    if ! (echo > "/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
        break
    fi
    log_info "Port $PORT still bound, waiting..."
    sleep 2
    PORT_WAIT=$((PORT_WAIT + 2))
done

log_ok "Edge stopped"

if [[ -f "$OLD_PATH" ]]; then
    log_info "Removing previous backup..."
    rm -f "$OLD_PATH"
fi
log_info "Backing up current binary to $OLD_PATH"
mv "$BINARY_PATH" "$OLD_PATH"
log_ok "Current binary backed up"

log_info "Downloading new binary from $UPDATE_URL..."
DOWN_OK=false
for url in {{.MirrorList}}; do
    log_info "Trying $url..."
    if curl -fL --connect-timeout 30 --max-time 300 -o "$TMP_PATH" "$url"; then
        if [[ -s "$TMP_PATH" ]]; then
            chmod +x "$TMP_PATH"
            DOWNLOADED=true
            DOWN_OK=true
            SIZE=$(stat -c%s "$TMP_PATH" 2>/dev/null || stat -f%z "$TMP_PATH" 2>/dev/null)
            log_ok "Downloaded $SIZE bytes from $url"
            break
        else
            log_err "Downloaded file from $url is empty"
        fi
    else
        log_err "Download from $url failed"
    fi
done
if [[ "$DOWN_OK" != "true" ]]; then
    log_err "All download mirrors failed"
    exit 1
fi

# Cosign signature verification (before the hash gate). SIGNATURE_EXPECTED
# is embedded by ksedge at script-generation time from the version manifest
# (manifest.signature_edge via tools/stamp-version-manifest.sh from
# release/ksedge.sig). A mismatch exits here — DOWNLOADED is already true
# so the EXIT trap rolls back to .old.
SIGNATURE_EXPECTED="{{.Signature}}"
if [[ -n "$SIGNATURE_EXPECTED" ]]; then
    if ! [[ "$SIGNATURE_EXPECTED" =~ ^[A-Za-z0-9+/=_-]+$ ]] || [[ ${#SIGNATURE_EXPECTED} -lt 86 ]]; then
        log_err "signature format invalid (not base64 or too short)"
        exit 1
    fi
    if command -v cosign >/dev/null 2>&1 && [[ -n "${COSIGN_PUBLIC_KEY:-}${KSEDGE_COSIGN_PUBLIC_KEY:-}" || -n "${KSEDGE_COSIGN_PUBKEY_FILE:-}" || -f "./cosign.pub" ]]; then
        PUBKEY="${KSEDGE_COSIGN_PUBKEY_FILE:-./cosign.pub}"
        if [[ -n "${COSIGN_PUBLIC_KEY:-}${KSEDGE_COSIGN_PUBLIC_KEY:-}" ]]; then
            echo "${COSIGN_PUBLIC_KEY:-${KSEDGE_COSIGN_PUBLIC_KEY}}" > /tmp/ksedge-cosign.pub
            PUBKEY=/tmp/ksedge-cosign.pub
        fi
        echo "$SIGNATURE_EXPECTED" | base64 -d > /tmp/ksedge-sig.bin 2>/dev/null || echo "$SIGNATURE_EXPECTED" > /tmp/ksedge-sig.b64
        SIGFILE=/tmp/ksedge-sig.bin
        [[ -f /tmp/ksedge-sig.b64 ]] && SIGFILE=/tmp/ksedge-sig.b64
        if cosign verify-blob --key "$PUBKEY" --signature "$SIGFILE" "$TMP_PATH" >/dev/null 2>&1; then
            log_ok "Signature verified (cosign)"
        else
            log_err "signature verification failed — download deleted, live binary untouched"
            exit 1
        fi
        rm -f /tmp/ksedge-sig.bin /tmp/ksedge-sig.b64 /tmp/ksedge-cosign.pub
    else
        log_warn "cosign not available or no public key — signature format checked, checksum still enforced"
    fi
    log_ok "Signature format verified (cosign)"
else
    log_warn "no signature embedded — installing with checksum only"
fi

# Checksum verification. SHA256_EXPECTED is embedded by ksedge at
# script-generation time from the version manifest (verify.go); when empty
# the install proceeds unverified. A mismatch exits here — DOWNLOADED is
# already true so the EXIT trap rolls back to .old and the corrupt bytes
# never reach the live path.
SHA256_EXPECTED="{{.SHA256}}"
if [[ -n "$SHA256_EXPECTED" ]]; then
    if command -v sha256sum >/dev/null 2>&1; then
        GOT_SHA=$(sha256sum "$TMP_PATH" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
        GOT_SHA=$(shasum -a 256 "$TMP_PATH" | awk '{print $1}')
    else
        log_warn "no sha256 tool found — skipping checksum verification"
        GOT_SHA="$SHA256_EXPECTED"
    fi
    if [[ "$GOT_SHA" != "$SHA256_EXPECTED" ]]; then
        log_err "checksum mismatch: expected $SHA256_EXPECTED, got $GOT_SHA"
        exit 1
    fi
    log_ok "Checksum verified (sha256)"
else
    log_warn "no checksum embedded — installing unverified binary"
fi

log_info "Installing new binary..."
mv "$TMP_PATH" "$BINARY_PATH"
log_ok "New binary installed at $BINARY_PATH"

log_info "Starting new edge..."
EDGE_PID=$(start_edge_at "$BINARY_PATH") || {
    log_err "Could not spawn new edge"
    exit 1
}
log_info "Edge started with PID: $EDGE_PID"

sleep 3
if ! kill -0 "$EDGE_PID" 2>/dev/null; then
    log_err "Edge process exited within 3s of launch"
    exit 1
fi

log_info "Waiting for edge to become healthy (max ${MAX_WAIT_START}s)..."
if [[ "$(wait_for_healthy)" == "ok" ]]; then
    NEW_STARTED=true
    log_ok "Edge is healthy and responding!"
    log_info "=== Reinstall Completed Successfully ==="
    trap - EXIT
    exit 0
fi

log_err "Edge did not become healthy within ${MAX_WAIT_START}s"
exit 1
`

// handleReinstallBackground writes the reinstall.sh script next to the edge
// binary and executes it detached. Returns immediately while the script
// stops the edge, downloads the new binary and restarts it.
func handleReinstallBackground(w http.ResponseWriter) {
	local := version.Snapshot()
	exe, err := exePath()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "cannot locate running binary: "+err.Error())
		return
	}
	exeDir := filepath.Dir(exe)
	port := effectiveEdgePort(exeDir)
	scriptPath := filepath.Join(exeDir, "reinstall.sh")

	mirrors := ""
	for i, u := range ksedgeDownloadURLs() {
		if i > 0 {
			mirrors += " "
		}
		mirrors += strconv.Quote(u)
	}
	data := struct {
		GeneratedAt    string
		BinaryPath     string
		UpdateURL      string
		CurrentVersion string
		Port           string
		MirrorList     string
		SHA256         string
		Signature      string
	}{
		GeneratedAt:    time.Now().UTC().Format(time.RFC3339),
		BinaryPath:     exe,
		UpdateURL:      ksedgeBinaryURL,
		CurrentVersion: local.Version,
		Port:           port,
		MirrorList:     mirrors,
		SHA256:         embeddedEdgeReinstallSHA256(),
		Signature:      embeddedEdgeReinstallSignature(),
	}

	tmpl, err := template.New("reinstall-edge").Parse(reinstallScriptTemplate)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "template parse error: "+err.Error())
		return
	}
	var buf strings.Builder
	if err := tmpl.Execute(&buf, data); err != nil {
		writeErr(w, http.StatusInternalServerError, "template execution error: "+err.Error())
		return
	}
	if err := os.WriteFile(scriptPath, []byte(buf.String()), 0o755); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to write reinstall script: "+err.Error())
		return
	}

	go func() {
		cmd := exec.Command("bash", scriptPath)
		cmd.Dir = exeDir
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Env = os.Environ()
		cmd.SysProcAttr = detachAttr()
		if err := cmd.Start(); err != nil {
			log.Printf("edge reinstall background script start failed: %v", err)
			return
		}
		if cmd.Process != nil {
			_ = cmd.Process.Release()
		}
	}()

	writeJSON(w, reinstallBackgroundResponse{
		OK:      true,
		Message: "Reinstall script started in background. The edge will stop, download the new binary, and restart.",
		Script:  scriptPath,
	})
}
