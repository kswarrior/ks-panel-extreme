package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// Verified downloads for the panel self-update / reinstall surface.
//
// The build publishes release/kspanel.sha256 (`<hex>  kspanel`, see
// rebuild.sh generate_checksums) and an optional cosign sidecar
// (release/kspanel.sig via SIGN_KEY). The version manifest may carry the
// same values inline so an update-apply can verify the downloaded bytes
// BEFORE chmod/swap:
//
//	{
//	  "version": "0.1.1",
//	  "sha256": "<64 hex chars of the kspanel binary>",
//	  "signature": "<optional cosign sig output, informational>",
///	  "sha256_url": "<optional explicit sidecar URL>"
//	}
//
// Verification chain in UpdateApplyHandler / ReinstallHandler (and the
// reinstall.sh template, which embeds the resolved hex at generation
// time):
//  1. re-fetch version.json fresh (15s client, 1MiB cap — the same
//     SSRF/timeout discipline as UpdateCheckHandler),
//  2. prefer manifest.sha256, else fetch manifest.sha256_url, else fetch
//     the conventional sidecar kspanelBaseURL/kspanel.sha256,
//  3. stream-hash the temp file and compare; on mismatch delete the temp
//     file, leave the live binary untouched, audit-log the failure and
//     answer 422.
// When no checksum is published anywhere the apply proceeds unverified
// but records that fact in the response log + audit row, so old manifests
// don't brick updates while new ones are enforced.

// fetchUpdateManifest re-fetches version.json with the same 15s client +
// 1MiB cap discipline as UpdateCheckHandler. Shared so check + apply +
// reinstall-script generation all read one source of truth.
func fetchUpdateManifest() (updateVersionManifest, error) {
	var m updateVersionManifest
	client := &http.Client{Timeout: 15 * time.Second}
	httpResp, err := client.Get(kspanelVersionURL)
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

// parseChecksumBody extracts the hex digest from a checksum sidecar body.
// Accepts both bare hex and the `sha256sum` "<hex>  <filename>" form the
// build publishes (release/*.sha256). Returns the lower-cased hex.
func parseChecksumBody(body []byte) (string, error) {
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

// fetchChecksumSidecar fetches a checksum sidecar URL with the same 15s
// client discipline as the manifest fetch. The body is capped at 64KiB —
// a sidecar is one line; anything larger is abusive and rejected.
func fetchChecksumSidecar(url string) (string, error) {
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
	return parseChecksumBody(body)
}

// resolveExpectedSHA256 returns the hex digest the downloaded binary must
// match: manifest.sha256 wins, then manifest.sha256_url, then the
// conventional sidecar next to the manifest. Empty string + nil error
// means "no checksum published" — the caller proceeds unverified and logs
// that fact instead of bricking updates against old manifests.
func resolveExpectedSHA256(m updateVersionManifest) (string, error) {
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
		return fetchChecksumSidecar(u)
	}
	// Conventional sidecar published next to the manifest by rebuild.sh.
	if sum, err := fetchChecksumSidecar(kspanelBaseURL + "/kspanel.sha256?download=true"); err == nil {
		return sum, nil
	} else {
		lastErr := err
		// Release-asset fallback: <binary>.sha256 next to the binary.
		if sum2, err2 := fetchChecksumSidecar(kspanelBinaryURL + ".sha256"); err2 == nil {
			return sum2, nil
		} else {
			_ = lastErr
			return "", nil
		}
	}
}

// verifyFileSHA256 streams path through SHA-256 and compares against the
// expected lower-cased hex digest. Pure check — it never mutates either
// file; the caller removes the temp file on mismatch.
func verifyFileSHA256(path, expectedHex string) error {
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

// recordUpdateVerifyFailure audit-logs a checksum failure so the audit
// feed shows WHY the live binary was left untouched.
func recordUpdateVerifyFailure(r *http.Request, action, detail string) {
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      action,
		TargetLabel: "self-update",
		Message:     detail,
	})
}

// embeddedReinstallSHA256 best-effort resolves the checksum to embed into
// a generated reinstall.sh. Empty string on any failure — the script then
// installs unverified (with a warning) instead of refusing to generate.
func embeddedReinstallSHA256() string {
	m, err := fetchUpdateManifest()
	if err != nil {
		return ""
	}
	sum, err := resolveExpectedSHA256(m)
	if err != nil {
		return ""
	}
	return sum
}
