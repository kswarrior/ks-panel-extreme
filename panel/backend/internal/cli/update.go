package cli

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/version"
	"github.com/spf13/cobra"
)

// Manifest / binary sources mirror api/handlers.update_handler's
// kspanelVersionURL + kspanelBinaryURL (unexported there, and the CLI must
// work with no panel running, so the strings live here too — update both
// when the hosting moves).
const (
	cliUpdateManifestURL = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/release/version.json"
	cliUpdateBinaryURL   = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/release/kspanel"
	cliUpdateSidecarURL  = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/release/kspanel.sha256"
)

// cliVersionManifest carries only the manifest fields this command needs.
// Field names match release/version.json (see tools/stamp-version-manifest.sh).
type cliVersionManifest struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
	SHA256    string `json:"sha256"`
	SHA256URL string `json:"sha256_url"`
}

// updateCmd checks the release manifest against the local build and, with
// --apply, downloads + SHA-verifies + atomically swaps this binary.
//
// Examples:
// ./kspanel update                 # check only: local vs remote
// ./kspanel update --apply         # check + install when newer
// ./kspanel update --apply --force # reinstall even when versions match
var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Check for a newer kspanel release, optionally install it",
	Long: `Fetch the release manifest, compare its version against this binary,
and report whether an update is available. With --apply the new binary is
downloaded, SHA-256 verified against the manifest (refused when no checksum
resolves) and atomically swapped into place; restart the panel afterwards
so the new binary takes over. Works with the panel stopped — no login needed.`,
	RunE: runUpdate,
}

func init() {
	updateCmd.Flags().Bool("apply", false, "Download, verify and install the new binary when one is available")
	updateCmd.Flags().Bool("force", false, "Reinstall even when the versions already match (implies --apply)")
	updateCmd.Flags().String("url", "", "Override the manifest URL (default: release version.json)")
}

func runUpdate(cmd *cobra.Command, args []string) error {
	apply, _ := cmd.Flags().GetBool("apply")
	force, _ := cmd.Flags().GetBool("force")
	manifestURL, _ := cmd.Flags().GetString("url")
	if force {
		apply = true
	}
	if manifestURL == "" {
		manifestURL = cliUpdateManifestURL
	}

	local := version.Snapshot()
	manifest, err := fetchCLIManifest(manifestURL)
	if err != nil {
		return fmt.Errorf("fetch manifest: %w", err)
	}
	print.KV("local", fmt.Sprintf("%s (commit %s)", local.Version, local.Commit))
	print.KV("remote", fmt.Sprintf("%s (commit %s)", manifest.Version, manifest.Commit))
	newer, err := semverNewer(manifest.Version, local.Version)
	if err != nil {
		return fmt.Errorf("compare versions: %w", err)
	}
	if !newer {
		print.OK("update", fmt.Sprintf("already up to date (%s)", local.Version))
		if apply && !force {
			return nil
		}
		if !apply {
			return nil
		}
	}
	if !apply {
		print.Note("update", fmt.Sprintf("version %s available — rerun with --apply to install", manifest.Version))
		return nil
	}

	expected, err := resolveCLISHA256(manifest)
	if err != nil {
		return fmt.Errorf("resolve checksum: %w", err)
	}
	if expected == "" {
		return fmt.Errorf("refusing to install: no checksum resolvable for version %s (manifest carries no sha256 and no sidecar is reachable)", manifest.Version)
	}
	exe, err := swapCLIBinary(cliUpdateBinaryURL, expected)
	if err != nil {
		return err
	}
	print.OK("update", fmt.Sprintf("installed %s -> %s (previous kept as %s.old)", exe, manifest.Version, exe))
	print.Note("update", "restart the panel so the new binary takes over (./kspanel stop, then launch)")
	return nil
}

// cliAPIManifestURL serves the same version.json via the GitHub Contents API
// (Accept: raw, 60s edge cache) instead of raw.githubusercontent (300s edge
// cache which ignores the `?t=` query buster). Tried first for the default
// manifest URL only; a custom --url override is always fetched directly.
const cliAPIManifestURL = "https://api.github.com/repos/kswarrior/ks-panel-extreme/contents/release/version.json?ref=main"

// fetchCLIManifest GETs the manifest with a bounded client. The body is
// capped at 1 MiB — a manifest is a few hundred bytes; anything larger is
// not a manifest. For the default URL it tries the GitHub API first (much
// fresher) and falls back to raw.githubusercontent on any failure, including
// API rate limiting, so throttling degrades instead of erroring.
func fetchCLIManifest(manifestURL string) (*cliVersionManifest, error) {
	if manifestURL == cliUpdateManifestURL {
		if m, err := fetchCLIManifestViaAPI(); err == nil && strings.TrimSpace(m.Version) != "" {
			return m, nil
		}
	}
	return fetchCLIManifestViaURL(manifestURL)
}

// fetchCLIManifestViaAPI GETs version.json through the GitHub Contents API
// with Accept: raw (raw file bytes, same JSON shape, no base64 envelope).
func fetchCLIManifestViaAPI() (*cliVersionManifest, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodGet, cliAPIManifestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.raw")
	req.Header.Set("User-Agent", "kspanel-update-check")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d for %s", resp.StatusCode, cliAPIManifestURL)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var m cliVersionManifest
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("invalid manifest JSON: %w", err)
	}
	if strings.TrimSpace(m.Version) == "" {
		return nil, fmt.Errorf("manifest carries no version")
	}
	return &m, nil
}

// fetchCLIManifestViaURL GETs the manifest from the given raw URL directly.
func fetchCLIManifestViaURL(manifestURL string) (*cliVersionManifest, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(manifestURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d for %s", resp.StatusCode, manifestURL)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var m cliVersionManifest
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("invalid manifest JSON: %w", err)
	}
	if strings.TrimSpace(m.Version) == "" {
		return nil, fmt.Errorf("manifest carries no version")
	}
	return &m, nil
}

// resolveCLISHA256 mirrors the server's resolveExpectedSHA256 priority:
// manifest sha256, then sha256_url sidecar, then the conventional release
// sidecar. Empty (with nil error) means nothing resolved — the caller
// refuses the install.
func resolveCLISHA256(m *cliVersionManifest) (string, error) {
	if v := strings.ToLower(strings.TrimSpace(m.SHA256)); v != "" {
		if len(v) != 64 {
			return "", fmt.Errorf("manifest sha256 must be 64 hex chars, got %d", len(v))
		}
		if _, err := hex.DecodeString(v); err != nil {
			return "", fmt.Errorf("manifest sha256 is not valid hex: %w", err)
		}
		return v, nil
	}
	if u := strings.TrimSpace(m.SHA256URL); u != "" {
		if sum, err := fetchCLISidecar(u); err == nil {
			return sum, nil
		}
	}
	if sum, err := fetchCLISidecar(cliUpdateSidecarURL); err == nil {
		return sum, nil
	}
	return "", nil
}

// fetchCLISidecar reads a "<hex>  <name>" sha256sum line and returns the hex.
func fetchCLISidecar(sidecarURL string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(sidecarURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d for %s", resp.StatusCode, sidecarURL)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return "", err
	}
	fields := strings.Fields(string(body))
	if len(fields) == 0 {
		return "", fmt.Errorf("sidecar is empty")
	}
	sum := strings.ToLower(strings.TrimSpace(fields[0]))
	if len(sum) != 64 {
		return "", fmt.Errorf("sidecar has no 64-char hex digest")
	}
	if _, err := hex.DecodeString(sum); err != nil {
		return "", fmt.Errorf("sidecar digest is not valid hex: %w", err)
	}
	return sum, nil
}

// swapCLIBinary streams url into a temp file next to this executable,
// SHA-verifies it, then atomically swaps it into place (current binary is
// kept as <exe>.old). The running process is unaffected — Linux keeps the
// unlinked inode alive — but the new file only takes effect on restart.
func swapCLIBinary(binaryURL, expectedSHA string) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot locate binary: %w", err)
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}
	exeDir := filepath.Dir(exe)
	tmpPath := filepath.Join(exeDir, filepath.Base(exe)+".update")
	oldPath := exe + ".old"

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(binaryURL)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(tmpPath)
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(f, h), resp.Body); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("download failed: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("close temp file: %w", err)
	}
	if fi, serr := os.Stat(tmpPath); serr != nil || fi.Size() == 0 {
		os.Remove(tmpPath)
		return "", fmt.Errorf("downloaded file is empty or missing")
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != expectedSHA {
		os.Remove(tmpPath)
		return "", fmt.Errorf("checksum mismatch — download deleted, live binary untouched: expected %s, got %s", expectedSHA, got)
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("chmod temp file: %w", err)
	}
	os.Remove(oldPath)
	if err := os.Rename(exe, oldPath); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("back up current binary: %w", err)
	}
	if err := os.Rename(tmpPath, exe); err != nil {
		_ = os.Rename(oldPath, exe)
		return "", fmt.Errorf("swap new binary into place: %w (previous restored)", err)
	}
	return exe, nil
}

// semverNewer reports whether remote a is strictly newer than local b.
// Numeric x.y.z triples (leading "v" and "-tag" suffix tolerated); anything
// else fails closed with an error rather than guessing.
func semverNewer(a, b string) (bool, error) {
	pa, ok := parseCLISemver(a)
	if !ok {
		return false, fmt.Errorf("remote version %q is not x.y.z", a)
	}
	pb, ok := parseCLISemver(b)
	if !ok {
		return false, fmt.Errorf("local version %q is not x.y.z", b)
	}
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			return pa[i] > pb[i], nil
		}
	}
	return false, nil
}

func parseCLISemver(v string) ([3]int, bool) {
	var out [3]int
	s := strings.TrimSpace(strings.TrimPrefix(v, "v"))
	if i := strings.Index(s, "-"); i >= 0 {
		s = s[:i]
	}
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || n < 0 {
			return out, false
		}
		out[i] = n
	}
	return out, true
}
