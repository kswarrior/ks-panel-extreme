package update

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Verified downloads for the edge self-update / reinstall surface.
//
// Mirrors the panel's update_verify.go: the build publishes
// release/ksedge.sha256 (`<hex>  ksedge`, see rebuild.sh) and a cosign
// sidecar (release/ksedge.sig via SIGN_KEY). The version manifest carries
// the same values inline (tools/stamp-version-manifest.sh):
//
//	{
//	  "version": "0.1.1",
//	  "sha256_edge": "<64 hex of ksedge>",
//	  "signature_edge": "<cosign sign-blob output, base64>",
///	  "sha256_url": "<optional explicit sidecar URL>"
//	}
//
// handleApply (both update + reinstall modes) re-fetches the manifest
// fresh, verifies manifest.signature_edge with verifyEdgeSignature BEFORE
// the hash gate, then resolves the expected digest (manifest.sha256_edge,
// else manifest.sha256_url, else the conventional sidecar), hashes the temp
// file BEFORE chmod/swap and aborts with 422 + deleted temp + untouched
// live binary on either mismatch. When neither signature nor checksum is
// published anywhere the apply proceeds unverified and logs that fact, so
// old manifests don't brick edge updates while new ones are enforced.
// The bare manifest.sha256 is the PANEL digest and is NEVER accepted here.

// fetchEdgeManifest re-fetches version.json with the same 15s client +
// 1MiB cap discipline as handleCheck.
func fetchEdgeManifest() (versionManifest, error) {
	var m versionManifest
	client := &http.Client{Timeout: 15 * time.Second}
	httpResp, err := client.Get(ksedgeVersionURL)
	if err != nil {
		return m, fmt.Errorf("could not reach update server: %w", err)
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		return m, fmt.Errorf("update server returned HTTP %d", httpResp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(httpResp.Body, 1<<20))
	if err != nil {
		return m, fmt.Errorf("read manifest: %w", err)
	}
	if err := json.Unmarshal(body, &m); err != nil {
		return m, fmt.Errorf("malformed manifest: %w", err)
	}
	return m, nil
}

// parseEdgeChecksumBody extracts the hex digest from a checksum sidecar
// body (bare hex or `sha256sum` "<hex>  <filename>" form).
func parseEdgeChecksumBody(body []byte) (string, error) {
	first := strings.Fields(strings.TrimSpace(string(body)))
	if len(first) == 0 {
		return "", fmt.Errorf("empty checksum body")
	}
	hexStr := strings.ToLower(strings.TrimSpace(first[0]))
	if len(hexStr) != 64 {
		return "", fmt.Errorf("checksum must be 64 hex chars, got %d", len(hexStr))
	}
	if _, err := hex.DecodeString(hexStr); err != nil {
		return "", fmt.Errorf("checksum is not valid hex: %w", err)
	}
	return hexStr, nil
}

// fetchEdgeChecksumSidecar fetches a checksum sidecar with the same 15s
// discipline as the manifest fetch, capped at 64KiB.
func fetchEdgeChecksumSidecar(url string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	httpResp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("could not reach checksum server: %w", err)
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checksum server returned HTTP %d", httpResp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(httpResp.Body, 64<<10))
	if err != nil {
		return "", fmt.Errorf("read checksum: %w", err)
	}
	return parseEdgeChecksumBody(body)
}

// resolveEdgeExpectedSHA256 returns the hex digest the downloaded ksedge
// binary must match: manifest.sha256_edge wins, then manifest.sha256_url,
// then the conventional ksedge sidecar. The bare manifest.sha256 is the
// PANEL binary's digest and is NEVER accepted here (different bytes).
// Empty string + nil error means "no checksum published" — the caller
// proceeds unverified and logs that fact.
func resolveEdgeExpectedSHA256(m versionManifest) (string, error) {
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
		return fetchEdgeChecksumSidecar(u)
	}
	if sum, err := fetchEdgeChecksumSidecar(ksedgeBaseURL + "/ksedge.sha256?download=true"); err == nil {
		return sum, nil
	}
	return "", nil
}

// verifyEdgeFileSHA256 streams path through SHA-256 and compares against
// the expected hex digest. Pure check — the caller removes the temp file
// on mismatch.
func verifyEdgeFileSHA256(path, expectedHex string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open for verify: %w", err)
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return fmt.Errorf("hash download: %w", err)
	}
	got := hex.EncodeToString(h.Sum(nil))
	if got != strings.ToLower(strings.TrimSpace(expectedHex)) {
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedHex, got)
	}
	return nil
}

// embeddedEdgeReinstallSHA256 best-effort resolves the checksum to embed
// into a generated edge reinstall.sh. Empty on any failure — the script
// then installs unverified (with a warning) instead of refusing.
func embeddedEdgeReinstallSHA256() string {
	m, err := fetchEdgeManifest()
	if err != nil {
		return ""
	}
	sum, err := resolveEdgeExpectedSHA256(m)
	if err != nil {
		return ""
	}
	return sum
}
