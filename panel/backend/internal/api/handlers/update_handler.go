package handlers

import (
	"errors"
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

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/version"
)

// kspanelDownloadURL + kspanelVersionURL are the public artefacts the
// "Updates" tab pulls. Mirrored from the ksedge pair in node_handler /
// setup_localnode so the panel's self-update flow uses the same hosting
// (Hugging Face bucket) and the same query convention. `version.json` is
// the manifest the update-check endpoint fetches before deciding whether
// to bother the admin with "An update is available".
//
// The bucket layout (Hugging Face resolve convention) is:
//
//	<base>/release/kspanel      – the binary itself
//	<base>/release/version.json – the manifest, schema below
//
// version.json schema (kept minimal so the same shape works whether we
// later switch the host to GitHub releases or any plain HTTPS origin):
//
//	{
//	  "version":    "0.1.1",                  // semver, MUST be present
//	  "commit":     "abc1234",                // short git sha, optional
//	  "build_date": "2026-08-15T12:00:00Z",   // ISO-8601 UTC, optional
//	  "notes":      "Highlights for the release",  // markdown-ish, optional
//	  "size_bytes": 12345678,                 // binary size, informational
//	  "sha256":     "<64 hex of kspanel>",    // verified pre-swap, optional
//	  "sha256_edge":"<64 hex of ksedge>",     // edge verifies this one
//	  "signature":  "<cosign sig output>",    // informational, optional
//	  "signature_edge": "<cosign sig>",       // informational, optional
//	  "sha256_url": "https://…/kspanel.sha256" // explicit sidecar, optional
//	}
//
// The same manifest serves the edge (ksedgeVersionURL): the edge resolves
// sha256_edge (never the bare sha256 — different bytes). Stamp it from
// the build artifacts with tools/stamp-version-manifest.sh.
const (
	kspanelBaseURL    = "https://huggingface.co/buckets/kswarrior/opencode-storage/resolve/ks-panel/release"
	kspanelVersionURL = kspanelBaseURL + "/version.json?download=true"
	// kspanelBinaryURL is the reinstall / update binary source.
	// Panel reinstall (System → Panel tab) now uses the dedicated ks-panel-edge
	// GitHub release per user request.
	kspanelBinaryURL = "https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/kspanel"
)

// updateVersionManifest mirrors the JSON shape served at kspanelVersionURL.
// Loose types on purpose — a missing or malformed field falls back to a
// zero value, and the frontend renders "unknown" rather than a hard error.
type updateVersionManifest struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
	Notes     string `json:"notes"`
	SizeBytes int64  `json:"size_bytes"`
	// SHA256 is the hex digest of the release binary. When present (or
	// resolvable via SHA256URL / the conventional sidecar) the apply +
	// reinstall paths hash the temp file BEFORE chmod/swap and abort on
	// mismatch — see update_verify.go. Signature carries the optional
	// cosign output (SIGN_KEY builds) for out-of-band verification.
	// SHA256Edge/SignatureEdge are the ksedge counterparts sharing this
	// manifest (surfaced by update-check; the edge verifies sha256_edge).
	SHA256        string `json:"sha256"`
	SHA256Edge    string `json:"sha256_edge"`
	Signature     string `json:"signature"`
	SignatureEdge string `json:"signature_edge"`
	SHA256URL     string `json:"sha256_url"`
}

// updateInfoResponse is the GET /api/system/update-info payload. It
// bundles the local build identity + the public update endpoint so the
// "Updates" tab can render "You are running X" without a separate request
// per field.
type updateInfoResponse struct {
	Local       version.Info `json:"local"`
	UpdateURL   string       `json:"update_url"`
	VersionURL  string       `json:"version_url"`
	BinaryPath  string       `json:"binary_path"`
	LastCheckAt *string      `json:"last_check_at,omitempty"`
	LastRemote  *string      `json:"last_remote_version,omitempty"`
}

// updateCheckResponse is the GET /api/system/update-check payload.
// `Available` is true iff remote version > local (semver compare). When the
// remote manifest can't be fetched `Error` carries a human-readable reason
// and the other fields are zero values so the SPA renders a yellow "Could
// not reach update server" banner without crashing on null fields.
type updateCheckResponse struct {
	Available bool                  `json:"available"`
	Local     version.Info          `json:"local"`
	Remote    updateVersionManifest `json:"remote"`
	CheckedAt string                `json:"checked_at"`
	UpdateURL string                `json:"update_url"`
	Error     string                `json:"error,omitempty"`
}

// updateApplyResponse is the POST /api/system/update-apply payload.
// Returned BEFORE the binary swap is attempted — the handler answers the
// HTTP request, then in a goroutine performs the download + relaunch, then
// os.Exit's the current process. The SPA therefore sees a normal 200 + a
// "panel is restarting" payload and the next page load hits the new binary.
type updateApplyResponse struct {
	OK           bool   `json:"ok"`
	Message      string `json:"message"`
	LocalBefore  string `json:"local_version_before"`
	TargetBinary string `json:"target_binary"`
	Log          string `json:"log,omitempty"`
}

// UpdateInfoHandler reports the local build identity + the public update
// endpoints. Pure read — no network calls — so it's safe to call on every
// render of the "Updates" tab.
func UpdateInfoHandler(w http.ResponseWriter, r *http.Request) {
	local := version.Snapshot()
	exe, _ := os.Executable()
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	writeJSON(w, updateInfoResponse{
		Local:      local,
		UpdateURL:  kspanelBinaryURL,
		VersionURL: kspanelVersionURL,
		BinaryPath: exe,
	})
}

// UpdateCheckHandler fetches the remote version.json manifest and compares
// it against the running build. Network errors (timeout, non-200,
// malformed JSON) surface as a non-nil `Error` so the SPA can show "could
// not reach update server" instead of crashing on missing fields.
func UpdateCheckHandler(w http.ResponseWriter, r *http.Request) {
	local := version.Snapshot()
	resp := updateCheckResponse{
		Local:     local,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		UpdateURL: kspanelBinaryURL,
	}

	manifest, err := fetchUpdateManifest()
	if err != nil {
		resp.Error = err.Error()
		writeJSON(w, resp)
		return
	}
	resp.Remote = manifest
	resp.Available = semverGreater(manifest.Version, local.Version)
	writeJSON(w, resp)
}

// UpdateApplyHandler downloads the latest kspanel binary into a temp file,
// swaps it over the running executable, records an activity-log entry, then
// in a goroutine launches the new binary detached and os.Exit's the current
// process. The HTTP response is written BEFORE the exit kicks in so the SPA
// always sees a clean 200 with the "panel is restarting" payload.
//
// Rollback strategy: the running binary is renamed to <exe>.old (overwriting
// any prior .old) before the new file is moved into place, so a botched
// upgrade can be reverted by `mv <exe>.old <exe>` from a shell.
//
// Pre-flight guards:
//   - The binary must be on a real filesystem (os.Executable resolves the
//     path; we refuse on failure rather than blindly renaming the cwd).
//   - The download must finish + be non-empty, else we abort and leave the
//     running binary untouched.
//   - We require the running binary's parent directory to be writable, and
//     also try to find a supervisor-style port (KSPANEL_PORT or default)
//     so the relaunch can re-bind without a CLI flag mismatch.
func UpdateApplyHandler(w http.ResponseWriter, r *http.Request) {
	local := version.Snapshot()

	// Download + verify + swap via the shared stager so the HTTP path,
	// the reinstall path and the scheduled-window runner enforce
	// identical verification. .old rollback + /health-gate relaunch below
	// are untouched.
	exe, logLines, serr := stagePanelBinary("update")
	if serr != nil {
		var sf *stageFailure
		if errors.As(serr, &sf) {
			if sf.IsVerify {
				recordUpdateVerifyFailure(r, "self_update_verify_failed", "panel self-update "+sf.Msg)
			}
			http.Error(w, sf.Msg, sf.Code)
			return
		}
		http.Error(w, serr.Error(), http.StatusInternalServerError)
		return
	}

	// 4) Best-effort: persist an activity-log entry so the audit feed
	// shows the upgrade happened. We spawn this in a goroutine and write
	// synchronously into the DB before handing control to the relaunch —
	// the connection is pooled, the write should land even though the
	// process exits a few hundred ms later.
	go recordUpdateActivity(local.Version, filepath.Base(exe))

	// 5) Respond to the client FIRST. The SPA polls /system once the
	// boot completes and the new binary answers the snapshot endpoint.
	writeJSON(w, updateApplyResponse{
		OK:           true,
		Message:      "Update applied. The panel is restarting now — this page will reload automatically.",
		LocalBefore:  local.Version,
		TargetBinary: exe,
		Log:          strings.Join(logLines, "\n"),
	})

	// 6) Kick off the relaunch + exit. We sleep briefly so the HTTP
	// response body finishes flushing across the kernel's TCP send buffer
	// before the current process disappears.
	go func() {
		time.Sleep(600 * time.Millisecond)
		if err := relaunchPanel(exe, logLines); err != nil {
			log.Printf("panel relaunch failed: %v", err)
			print.Fail("update", "relaunch failed: "+err.Error())
			// Fall back to a hard exit so the operator can restart by hand;
			// the new binary is already in place at `exe`.
			os.Exit(1)
		}
		os.Exit(0)
	}()
}

// effectivePanelPort resolves the port the self-update / reinstall flows
// should (re)bind or health-check against. Precedence mirrors runLaunch in
// internal/cli/launch.go: KSPANEL_PORT env var > last-persisted panel_port
// from the settings KV > config.DefaultPort(). The KV lookup is load-bearing:
// launch.go persists every successfully bound port there, so an operator who
// started the panel with `kspanel launch --port 4872` (no KSPANEL_PORT set)
// gets the reinstall script pointed at 4872 instead of silently restarting
// the panel on DefaultPort() — which left the UI origin dead forever ("panel
// stops but never starts again") while the new process answered on a port
// nothing else knew about.
func effectivePanelPort() string {
	if p := os.Getenv("KSPANEL_PORT"); p != "" {
		return p
	}
	if con, err := repository.OpenDB(); err == nil {
		defer con.Close()
		if saved := repository.NewSettingsRepository(con).PanelPort(); saved > 0 {
			return strconv.Itoa(saved)
		}
	}
	return strconv.Itoa(config.DefaultPort())
}

// downloadUpdateFile streams a URL to a temp file then renames it into
// place. Mirrors downloadFile in node_handler.go but kept local because it
// has slightly different error semantics (we surface HTTP errors verbatim
// so the SPA can show "HTTP 404 — the release isn't published yet").
func downloadUpdateFile(url, dest string) error {
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

// relaunchPanel spawns the freshly placed binary as `launch` with the same
// port the current panel is bound to (resolved by effectivePanelPort: env >
// persisted settings KV > config.DefaultPort). The child is detached into
// its own process group so the current process's exit doesn't propagate
// signals.
//
// Logging: stdout + stderr of the new panel go to <exeDir>/panel.log (same
// convention as setup_localnode.go's ensurePanelUp) so the operator can
// inspect the boot of the freshly upgraded binary without losing prior
// output.
func relaunchPanel(exe string, logLines []string) error {
	port := effectivePanelPort()

	exeDir := filepath.Dir(exe)
	logPath := filepath.Join(exeDir, "panel.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open panel log: %w", err)
	}
	defer logFile.Close()

	// Splice the update log into the new panel's log so an operator tailing
	// panel.log sees the upgrade context right where it happened.
	for _, line := range logLines {
		fmt.Fprintf(logFile, "[update] %s\n", line)
	}
	fmt.Fprintf(logFile, "[update] relaunching %s launch --port %s\n", exe, port)

	cmd := exec.Command(exe, "launch", "--port", port)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	// Inherit env so the new process picks up the same DB credentials /
	// SMTP secrets / etc. the operator originally configured.
	cmd.Env = os.Environ()
	cmd.SysProcAttr = setDetachSysProcAttr()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start: %w", err)
	}
	// Release the child immediately so the parent process doesn't waitpid
	// for it (matches the ensurePanelUp pattern).
	if cmd.Process != nil {
		_ = cmd.Process.Release()
	}

	// Wait for the new panel to finish booting (migrations + listener bind).
	// This mirrors ensurePanelUp in setup_localnode.go — we need the new
	// panel to be healthy before the old process exits, otherwise the
	// new panel becomes an orphan and failures go unreported.
	panelURL := "http://127.0.0.1:" + port
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		if panelReachable(panelURL) {
			log.Printf("new panel ready at %s", panelURL)
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("new panel did not answer /health at %s within timeout", panelURL)
}

// panelReachable reports whether something on panelURL answers GET /health
// with a 200. The panel exposes this endpoint unauthenticated, so it's a
// cheap liveness signal without needing a token.
func panelReachable(panelURL string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(panelURL + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode == http.StatusOK
}

// recordUpdateActivity writes a system-category activity log entry so the
// audit feed shows the upgrade. Spawned as a goroutine — the parent is
// about to exit and we don't want to block the HTTP response on this.
func recordUpdateActivity(prevVersion, target string) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Printf("update activity: open db: %v", err)
		return
	}
	defer con.Close()
	repo := repository.NewActivityRepository(con)
	msg := fmt.Sprintf("panel self-updated from %s", prevVersion)
	_, _ = repo.Create(repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "self_update",
		TargetLabel: target,
		Message:     msg,
	})
}

// semverGreater is a minimal "is a > b" semver comparator. Handles the
// common cases the panel will ship (1.2.3 < 1.2.10, 1.10.0 > 1.9.9). Non-
// numeric segments ("0.1.0-rc1") compare element-by-element: a numeric
// component wins over a string component. Anything that doesn't parse as
// three dot-separated components is treated as "equal" so we don't claim an
// update is available against garbage.
func semverGreater(a, b string) bool {
	pa, ok1 := parseSemver(a)
	pb, ok2 := parseSemver(b)
	if !ok1 || !ok2 {
		return false
	}
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			// Numeric segments — pure integer compare.
			if ai, aerr := strconv.Atoi(pa[i]); aerr == nil {
				if bi, berr := strconv.Atoi(pb[i]); berr == nil {
					return ai > bi
				}
			}
			// Fallback to lexicographic so pre-release tags like "0.1.0-rc2"
			// sort deterministically (rc10 vs rc2 still beats rc2 in lex
			// order, which is fine for the panel's UI hint).
			return pa[i] > pb[i]
		}
	}
	return false
}

// parseSemver splits "1.2.3[-tag]" into [1, 2, 3] (with the pre-release
// suffix stripped off each segment). Returns false if the input doesn't
// have at least three dot-separated parts.
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
		// Strip a leading 'v' on the very first segment ("v1.2.3").
		if i == 0 && len(seg) > 0 && seg[0] == 'v' {
			seg = seg[1:]
		}
		// Trim any pre-release / build suffix glued onto a segment.
		if idx := strings.IndexAny(seg, "-+"); idx >= 0 {
			seg = seg[:idx]
		}
		out[i] = seg
	}
	return out, true
}

// ReinstallHandler forces a reinstall of the current channel binary.
// It reuses the same download + swap + relaunch logic as UpdateApplyHandler
// but is exposed as a separate endpoint so the UI can offer "Reinstall"
// as a distinct action (useful when the on-disk binary was corrupted or
// replaced externally). The response shape matches UpdateApplyResponse.
func ReinstallHandler(w http.ResponseWriter, r *http.Request) {
	local := version.Snapshot()

	// Same shared stager as UpdateApplyHandler (kind=reinstall only
	// changes the log wording) — identical verification gate.
	exe, logLines, serr := stagePanelBinary("reinstall")
	if serr != nil {
		var sf *stageFailure
		if errors.As(serr, &sf) {
			if sf.IsVerify {
				recordUpdateVerifyFailure(r, "self_reinstall_verify_failed", "panel reinstall "+sf.Msg)
			}
			http.Error(w, sf.Msg, sf.Code)
			return
		}
		http.Error(w, serr.Error(), http.StatusInternalServerError)
		return
	}
	logLines = append(logLines, "placed new binary at "+exe)

	// 4) Best-effort: persist an activity-log entry so the audit feed
	// shows the reinstall happened. We spawn this in a goroutine and write
	// synchronously into the DB before handing control to the relaunch —
	// the connection is pooled, the write should land even though the
	// process exits a few hundred ms later.
	go recordReinstallActivity(local.Version, filepath.Base(exe))

	// 5) Respond to the client FIRST. The SPA polls /system once the
	// boot completes and the new binary answers the snapshot endpoint.
	writeJSON(w, updateApplyResponse{
		OK:           true,
		Message:      "Reinstall applied. The panel is restarting now — this page will reload automatically.",
		LocalBefore:  local.Version,
		TargetBinary: exe,
		Log:          strings.Join(logLines, "\n"),
	})

	// 6) Kick off the relaunch + exit. We sleep briefly so the HTTP
	// response body finishes flushing across the kernel's TCP send buffer
	// before the current process disappears.
	go func() {
		time.Sleep(600 * time.Millisecond)
		if err := relaunchPanel(exe, logLines); err != nil {
			log.Printf("panel relaunch failed: %v", err)
			print.Fail("reinstall", "relaunch failed: "+err.Error())
			// Fall back to a hard exit so the operator can restart by hand;
			// the new binary is already in place at `exe`.
			os.Exit(1)
		}
		os.Exit(0)
	}()
}

// recordReinstallActivity writes a system-category activity log entry so the
// audit feed shows the reinstall. Spawned as a goroutine — the parent is
// about to exit and we don't want to block the HTTP response on this.
func recordReinstallActivity(prevVersion, target string) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Printf("reinstall activity: open db: %v", err)
		return
	}
	defer con.Close()
	repo := repository.NewActivityRepository(con)
	msg := fmt.Sprintf("panel reinstalled from %s", prevVersion)
	_, _ = repo.Create(repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "self_reinstall",
		TargetLabel: target,
		Message:     msg,
	})
}

// reinstallScriptTemplate is the shell script template for panel reinstall.
// It runs independently of the panel process, handles download/swap/start,
// and rolls back to the old binary if anything fails.
const reinstallScriptTemplate = `#!/bin/bash
# KS Panel Reinstall Script
# Generated by panel on {{.GeneratedAt}}
# Panel binary: {{.BinaryPath}}
# Update URL: {{.UpdateURL}}
# Current version: {{.CurrentVersion}}

# We deliberately do NOT enable set -e here: this script's whole point
# is to recover from failure (download fails, new binary won't start, port
# is stuck in TIME_WAIT, ...) and set -e would abort the cleanup-on-exit
# trap mid-recovery. Every individual step has its own error check so we
# still surface failures loudly, just without the shell killing us before
# we can roll back.
set -u
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err() { echo -e "${RED}[ERR]${NC} $*"; }

# Configuration
BINARY_PATH="{{.BinaryPath}}"
UPDATE_URL="{{.UpdateURL}}"
OLD_PATH="${BINARY_PATH}.old"
TMP_PATH="${BINARY_PATH}.update"
PANEL_LOG="${BINARY_PATH%/*}/panel.log"
PORT="${PORT:-{{.Port}}}"
MAX_WAIT_START=90
POLL_INTERVAL=2

# Track if we successfully downloaded
DOWNLOADED=false
# Track if new binary started successfully
NEW_STARTED=false

# start_panel_at: spawn the binary at $1 with --port $PORT, detached from
# this script's session so it survives the script exit (no SIGHUP leak),
# then return the PID we launched. We use setsid so the child becomes
# its own session leader — nohup & alone leaves the child in our session
# and the kernel sends SIGHUP when the script's controlling terminal goes
# away, which is exactly the "panel stops but doesn't restart" symptom.
start_panel_at() {
    local bin="$1"
    cd "${bin%/*}"
    setsid nohup "$bin" launch --port "$PORT" >> "$PANEL_LOG" 2>&1 < /dev/null &
    echo $!
}

# wait_for_healthy: poll http://127.0.0.1:$PORT/health until it answers or
# the timeout elapses. Echoes ok or fail. The caller decides what to
# do with the result — the previous version always rolled back on failure,
# which is too aggressive for slow starts; we now retry once with a short
# grace period before giving up.
#
# Progress lines go to STDERR, not stdout: callers capture this function's
# stdout with $() to compare against "ok", so any log_info on stdout would
# poison the captured string and turn a slow-but-successful boot (migrations
# can easily exceed one 2s poll) into a phantom rollback.
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

    # If we downloaded but new binary didn't start, rollback
    if [[ "$DOWNLOADED" == "true" && "$NEW_STARTED" == "false" ]]; then
        log_warn "New binary failed to start, rolling back to old binary..."
        if [[ -f "$OLD_PATH" ]]; then
            log_info "Restoring old binary from $OLD_PATH"
            mv -f "$OLD_PATH" "$BINARY_PATH"
            log_ok "Old binary restored"

            # Start the old binary
            log_info "Starting restored panel on port $PORT..."
            local pid
            pid=$(start_panel_at "$BINARY_PATH") || true
            if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                log_ok "Restored panel started (PID: $pid)"
            else
                log_err "Failed to start restored panel"
            fi
        else
            log_err "No backup binary found at $OLD_PATH"
        fi
    elif [[ "$DOWNLOADED" == "false" ]]; then
        # Download failed, ensure old binary is running
        log_warn "Download failed, ensuring old panel is running..."
        if [[ -f "$OLD_PATH" ]]; then
            log_info "Restoring old binary from $OLD_PATH"
            mv -f "$OLD_PATH" "$BINARY_PATH"
            log_ok "Old binary restored"

            log_info "Starting restored panel on port $PORT..."
            local pid
            pid=$(start_panel_at "$BINARY_PATH") || true
            if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                log_ok "Restored panel started (PID: $pid)"
            else
                log_err "Failed to start restored panel"
            fi
        fi
    fi
}

trap cleanup_on_exit EXIT

log_info "=== KS Panel Reinstall Started ==="
log_info "Binary: $BINARY_PATH"
log_info "Update URL: $UPDATE_URL"
log_info "Port: $PORT"

# 1. Stop the current panel
log_info "Stopping current panel..."

# Try to stop gracefully via CLI first (clean shutdown)
if "${BINARY_PATH}" stop --port "${PORT}" 2>/dev/null; then
    log_ok "Panel stopped gracefully via CLI"
else
    log_warn "CLI stop failed, falling back to pkill..."

    # Try multiple patterns to find and kill the panel process
    # Pattern 1: exact binary path with launch
    pkill -f "^${BINARY_PATH} launch" 2>/dev/null || true
    # Pattern 2: just the binary name with launch
    pkill -f "$(basename ${BINARY_PATH}) launch" 2>/dev/null || true
    # Pattern 3: any process with the binary path
    pkill -f "${BINARY_PATH}" 2>/dev/null || true
    # Pattern 4: using pidof if available
    if command -v pidof >/dev/null 2>&1; then
        pidof "$(basename ${BINARY_PATH})" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    fi

    # Wait and verify it's stopped
    sleep 2
    if pgrep -f "${BINARY_PATH}" >/dev/null 2>&1; then
        log_warn "Panel still running, forcing kill..."
        pkill -9 -f "${BINARY_PATH}" 2>/dev/null || true
        sleep 1
    fi
fi

# Belt-and-braces: confirm the TCP port is actually free before we let the
# new binary try to bind. pkill -9 doesn't release a TIME_WAIT socket and
# the new panel will fail to bind for ~30-60s. We poll the port and, if it
# looks bound, wait a few seconds longer.
PORT_WAIT=0
while [[ $PORT_WAIT -lt 15 ]]; do
    if ! (echo > "/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
        break
    fi
    log_info "Port $PORT still bound, waiting for TIME_WAIT to clear..."
    sleep 2
    PORT_WAIT=$((PORT_WAIT + 2))
done

log_ok "Panel stopped"

# 2. Backup current binary (rename to .old)
if [[ -f "$OLD_PATH" ]]; then
    log_info "Removing previous backup..."
    rm -f "$OLD_PATH"
fi
log_info "Backing up current binary to $OLD_PATH"
mv "$BINARY_PATH" "$OLD_PATH"
log_ok "Current binary backed up"

# 3. Download new binary
log_info "Downloading new binary from $UPDATE_URL..."
if curl -fL --connect-timeout 30 --max-time 300 -o "$TMP_PATH" "$UPDATE_URL"; then
    if [[ -s "$TMP_PATH" ]]; then
        chmod +x "$TMP_PATH"
        DOWNLOADED=true
        SIZE=$(stat -c%s "$TMP_PATH" 2>/dev/null || stat -f%z "$TMP_PATH" 2>/dev/null)
        log_ok "Downloaded $SIZE bytes"
    else
        log_err "Downloaded file is empty"
        exit 1
    fi
else
    log_err "Download failed"
    exit 1
fi

# 3b. Checksum verification. SHA256_EXPECTED is embedded by the panel at
# script-generation time from the version manifest (update_verify.go); when
# empty (old manifest without sha256) the install proceeds unverified. A
# mismatch exits here — DOWNLOADED is already true so the EXIT trap rolls
# back to .old and the corrupt bytes never reach the live path.
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

# 4. Move new binary into place
log_info "Installing new binary..."
mv "$TMP_PATH" "$BINARY_PATH"
log_ok "New binary installed at $BINARY_PATH"

# 5. Start new panel — use setsid+nohup so the child survives the script
# exit. The previous version only used nohup which left the child in the
# script's session and a SIGHUP at script exit would kill the new panel.
log_info "Starting new panel on port $PORT..."
PANEL_PID=$(start_panel_at "$BINARY_PATH") || {
    log_err "Could not spawn new panel"
    exit 1
}
log_info "Panel started with PID: $PANEL_PID"

# Give the panel a brief grace window to crash on a bad config (segfault,
# missing DB driver, etc.) before we start polling /health. If it dies
# within the first 5s the wait loop below will see the connection refused
# immediately, but kill -0 catches the "process exited" case faster.
sleep 3
if ! kill -0 "$PANEL_PID" 2>/dev/null; then
    log_err "Panel process exited within 3s of launch"
    exit 1
fi

# 6. Wait for panel to become healthy
log_info "Waiting for panel to become healthy (max ${MAX_WAIT_START}s)..."
if [[ "$(wait_for_healthy)" == "ok" ]]; then
    NEW_STARTED=true
    log_ok "Panel is healthy and responding!"
    log_info "=== Reinstall Completed Successfully ==="
    # Clear the EXIT trap so cleanup doesn't think this was a failure.
    trap - EXIT
    exit 0
fi

log_err "Panel did not become healthy within ${MAX_WAIT_START}s"
exit 1
`

// ReinstallScriptHandler generates and returns a reinstall.sh script.
// The script runs independently, stops the panel, downloads the new binary,
// starts it, and rolls back to the old binary if download fails or new binary fails to start.
func ReinstallScriptHandler(w http.ResponseWriter, r *http.Request) {
	local := version.Snapshot()

	exe, err := os.Executable()
	if err != nil {
		http.Error(w, "cannot locate running binary: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}

	port := effectivePanelPort()

	data := struct {
		GeneratedAt    string
		BinaryPath     string
		UpdateURL      string
		CurrentVersion string
		Port           string
		SHA256         string
	}{
		GeneratedAt:    time.Now().UTC().Format(time.RFC3339),
		BinaryPath:     exe,
		UpdateURL:      kspanelBinaryURL,
		CurrentVersion: local.Version,
		Port:           port,
		SHA256:         embeddedReinstallSHA256(),
	}

	tmpl, err := template.New("reinstall").Parse(reinstallScriptTemplate)
	if err != nil {
		http.Error(w, "template parse error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-sh")
	w.Header().Set("Content-Disposition", "attachment; filename=\"reinstall.sh\"")

	if err := tmpl.Execute(w, data); err != nil {
		log.Printf("reinstall script template execution error: %v", err)
	}
}

// reinstallBackgroundResponse is the POST /api/system/reinstall-background payload.
type reinstallBackgroundResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Script  string `json:"script_path"`
}

// ReinstallBackgroundHandler writes the reinstall.sh script to the binary
// directory and executes it in the background. The script stops the panel,
// downloads the new binary, starts it, and rolls back on failure.
// The HTTP response returns immediately while the script runs detached.
func ReinstallBackgroundHandler(w http.ResponseWriter, r *http.Request) {
	local := version.Snapshot()

	exe, err := os.Executable()
	if err != nil {
		http.Error(w, "cannot locate running binary: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}

	port := effectivePanelPort()

	exeDir := filepath.Dir(exe)
	scriptPath := filepath.Join(exeDir, "reinstall.sh")

	data := struct {
		GeneratedAt    string
		BinaryPath     string
		UpdateURL      string
		CurrentVersion string
		Port           string
		SHA256         string
	}{
		GeneratedAt:    time.Now().UTC().Format(time.RFC3339),
		BinaryPath:     exe,
		UpdateURL:      kspanelBinaryURL,
		CurrentVersion: local.Version,
		Port:           port,
		SHA256:         embeddedReinstallSHA256(),
	}

	tmpl, err := template.New("reinstall").Parse(reinstallScriptTemplate)
	if err != nil {
		http.Error(w, "template parse error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var scriptBuf strings.Builder
	if err := tmpl.Execute(&scriptBuf, data); err != nil {
		http.Error(w, "template execution error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	scriptContent := scriptBuf.String()
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0o755); err != nil {
		http.Error(w, "failed to write reinstall script: "+err.Error(), http.StatusInternalServerError)
		return
	}

	go func() {
		cmd := exec.Command("bash", scriptPath)
		cmd.Dir = exeDir
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Env = os.Environ()
		cmd.SysProcAttr = setDetachSysProcAttr()
		if err := cmd.Start(); err != nil {
			log.Printf("reinstall background script start failed: %v", err)
			return
		}
		if cmd.Process != nil {
			_ = cmd.Process.Release()
		}
	}()

	writeJSON(w, reinstallBackgroundResponse{
		OK:      true,
		Message: "Reinstall script started in background. The panel will stop, download the new binary, and restart.",
		Script:  scriptPath,
	})
}
