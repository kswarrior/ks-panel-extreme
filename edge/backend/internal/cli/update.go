package cli

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/example/ksedge/internal/version"
	"github.com/spf13/cobra"
)

// Manifest / binary sources mirror internal/update's ksedgeVersionURL +
// ksedgeBinaryURL (unexported there, and the CLI must work with no edge
// running, so the strings live here too — update both when the hosting
// moves).
const (
	cliUpdateManifestURL = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/release/version.json"
	cliUpdateBinaryURL   = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/release/ksedge"
	cliUpdateSidecarURL  = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/release/ksedge.sha256"
)

// cliVersionManifest carries only the manifest fields this command needs.
// Field names match release/version.json (see tools/stamp-version-manifest.sh).
type cliVersionManifest struct {
	Version    string `json:"version"`
	Commit     string `json:"commit"`
	BuildDate  string `json:"build_date"`
	SHA256Edge string `json:"sha256_edge"`
	SHA256URL  string `json:"sha256_url"`
}

// updateCmd checks the release manifest against the local build and, with
// --apply, downloads + SHA-verifies + atomically swaps this binary.
//
// ./ksedge update                 # check only: local vs remote
// ./ksedge update --apply         # check + install when newer
// ./ksedge update --apply --force # reinstall even when versions match
func updateCmd() *cobra.Command {
	var apply, force bool
	var manifestURL string
	cmd := &cobra.Command{
		Use:   "update",
		Short: "Check for a newer ksedge release, optionally install it",
		Long: `Fetch the release manifest, compare its version against this binary,
and report whether an update is available. With --apply the new binary is
downloaded, SHA-256 verified against the manifest (refused when no checksum
resolves) and atomically swapped into place; restart the edge afterwards
so the new binary takes over. Works with the edge stopped — no token needed.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runEdgeUpdate(apply, force, manifestURL)
		},
	}
	cmd.Flags().BoolVar(&apply, "apply", false, "Download, verify and install the new binary when one is available")
	cmd.Flags().BoolVar(&force, "force", false, "Reinstall even when the versions already match (implies --apply)")
	cmd.Flags().StringVar(&manifestURL, "url", "", "Override the manifest URL (default: release version.json)")
	return cmd
}

func runEdgeUpdate(apply, force bool, manifestURL string) error {
	if force {
		apply = true
	}
	if manifestURL == "" {
		manifestURL = cliUpdateManifestURL
	}

	local := version.Snapshot()
	manifest, err := fetchEdgeManifest(manifestURL)
	if err != nil {
		return fmt.Errorf("fetch manifest: %w", err)
	}
	log.Printf("local:  %s (commit %s)", local.Version, local.Commit)
	log.Printf("remote: %s (commit %s)", manifest.Version, manifest.Commit)
	newer, err := semverNewer(manifest.Version, local.Version)
	if err != nil {
		return fmt.Errorf("compare versions: %w", err)
	}
	if !newer {
		log.Printf("already up to date (%s)", local.Version)
		if apply && !force {
			return nil
		}
		if !apply {
			return nil
		}
	}
	if !apply {
		log.Printf("version %s available — rerun with --apply to install", manifest.Version)
		return nil
	}

	expected, err := resolveEdgeSHA256(manifest)
	if err != nil {
		return fmt.Errorf("resolve checksum: %w", err)
	}
	if expected == "" {
		return fmt.Errorf("refusing to install: no checksum resolvable for version %s (manifest carries no sha256_edge and no sidecar is reachable)", manifest.Version)
	}
	exe, err := swapEdgeBinary(cliUpdateBinaryURL, expected)
	if err != nil {
		return err
	}
	log.Printf("installed %s -> %s (previous kept as %s.old)", exe, manifest.Version, exe)
	log.Printf("restart the edge so the new binary takes over")
	return nil
}

// fetchEdgeManifest GETs the manifest with a bounded client. The body is
// capped at 1 MiB — a manifest is a few hundred bytes; anything larger is
// not a manifest.
func fetchEdgeManifest(manifestURL string) (*cliVersionManifest, error) {
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

// resolveEdgeSHA256 mirrors the edge updater's priority: manifest
// sha256_edge, then sha256_url sidecar, then the conventional release
// sidecar. Empty (with nil error) means nothing resolved — the caller
// refuses the install.
func resolveEdgeSHA256(m *cliVersionManifest) (string, error) {
	if v := strings.ToLower(strings.TrimSpace(m.SHA256Edge)); v != "" {
		if len(v) != 64 {
			return "", fmt.Errorf("manifest sha256_edge must be 64 hex chars, got %d", len(v))
		}
		if _, err := hex.DecodeString(v); err != nil {
			return "", fmt.Errorf("manifest sha256_edge is not valid hex: %w", err)
		}
		return v, nil
	}
	if u := strings.TrimSpace(m.SHA256URL); u != "" {
		if sum, err := fetchEdgeSidecar(u); err == nil {
			return sum, nil
		}
	}
	if sum, err := fetchEdgeSidecar(cliUpdateSidecarURL); err == nil {
		return sum, nil
	}
	return "", nil
}

// fetchEdgeSidecar reads a "<hex>  <name>" sha256sum line and returns the hex.
func fetchEdgeSidecar(sidecarURL string) (string, error) {
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

// swapEdgeBinary streams url into a temp file next to this executable,
// SHA-verifies it, then atomically swaps it into place (current binary is
// kept as <exe>.old). The running process is unaffected — Linux keeps the
// unlinked inode alive — but the new file only takes effect on restart.
func swapEdgeBinary(binaryURL, expectedSHA string) (string, error) {
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
	pa, ok := parseEdgeSemver(a)
	if !ok {
		return false, fmt.Errorf("remote version %q is not x.y.z", a)
	}
	pb, ok := parseEdgeSemver(b)
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

func parseEdgeSemver(v string) ([3]int, bool) {
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
