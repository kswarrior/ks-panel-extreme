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

// githubAPIEdgeManifestURL serves the same version.json via the GitHub
// Contents API (Accept: raw). Its edge cache is 60s vs
// raw.githubusercontent's 300s, and raw.githubusercontent ignores the `?t=`
// query string (identical x-cache HIT + expires regardless of query, even
// with Cache-Control: no-cache), so the query buster never defeats the
// 5-minute stale window where the URL shows a newer release but the check
// reports up-to-date until the TTL expires.
const githubAPIEdgeManifestURL = "https://api.github.com/repos/kswarrior/ks-panel-extreme/contents/release/version.json?ref=main"

// fetchEdgeManifest re-fetches version.json with the same 15s client +
// 1MiB cap discipline as handleCheck. It tries the GitHub Contents API
// first (60s cache, much fresher) and falls back to raw.githubusercontent
// (300s cache) on any failure — including API rate limiting (60/hr
// unauthenticated) — so a throttled check degrades to the previous behavior
// instead of erroring.
func fetchEdgeManifest() (versionManifest, error) {
	if m, err := fetchEdgeManifestViaAPI(); err == nil && strings.TrimSpace(m.Version) != "" {
		return m, nil
	}
	return fetchEdgeManifestViaRaw()
}

// fetchEdgeManifestViaAPI GETs version.json through the GitHub Contents API
// with Accept: raw (raw file bytes, no base64 envelope). Non-200 (e.g.
// 403/429 rate limit) or empty version is an error for raw fallback.
func fetchEdgeManifestViaAPI() (versionManifest, error) {
	var m versionManifest
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, githubAPIEdgeManifestURL, nil)
	if err != nil {
		return m, fmt.Errorf("could not reach update server: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github.raw")
	req.Header.Set("User-Agent", "ksedge-update-check")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	httpResp, err := client.Do(req)
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
	if strings.TrimSpace(m.Version) == "" {
		return m, fmt.Errorf("malformed manifest: empty version")
	}
	return m, nil
}

// fetchEdgeManifestViaRaw GETs version.json from raw.githubusercontent. The
// `?t=` query is best-effort only (Fastly ignores it) and can serve up to
// 300s-stale data — hence API-first above. The no-cache request headers are
// likewise best-effort: Fastly still answers HIT with them set.
func fetchEdgeManifestViaRaw() (versionManifest, error) {
	var m versionManifest
	client := &http.Client{Timeout: 15 * time.Second}
	url := fmt.Sprintf("%s?t=%d", ksedgeVersionURL, time.Now().UnixNano())
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return m, fmt.Errorf("could not reach update server: %w", err)
	}
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	httpResp, err := client.Do(req)
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

// verifyEdgeSignature verifies the cosign signature for the downloaded
// ksedge binary BEFORE the pre-chmod hash gate. Signature bytes come from
// manifest.signature_edge (stamped from release/ksedge.sig).
//
// Empty signature → nil (no signature published; caller logs and relies on
// the SHA-256 gate). Non-empty → base64 must decode and be ≥64 bytes;
// when KSEDGE_COSIGN_PUBLIC_KEY / KSEDGE_COSIGN_PUBKEY_FILE (or the shared
// COSIGN_PUBLIC_KEY) is configured, ed25519 crypto is enforced. Pure check.
func verifyEdgeSignature(path, signature string) error {
	sig := strings.TrimSpace(signature)
	if sig == "" {
		return nil
	}
	compact := strings.Join(strings.Fields(sig), "")
	raw, err := base64.StdEncoding.DecodeString(compact)
	if err != nil {
		if raw2, err2 := base64.URLEncoding.DecodeString(compact); err2 == nil {
			raw = raw2
			err = nil
		} else if raw3, err3 := base64.RawStdEncoding.DecodeString(compact); err3 == nil {
			raw = raw3
			err = nil
		}
	}
	if err != nil {
		return fmt.Errorf("signature is not valid base64: %w", err)
	}
	if len(raw) < 64 {
		return fmt.Errorf("signature too short: got %d bytes, want >= 64", len(raw))
	}
	pub, hasKey := edgeCosignPublicKey()
	if !hasKey {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("open for signature verify: %w", err)
	}
	if len(pub) != ed25519.PublicKeySize {
		return fmt.Errorf("cosign public key must be %d bytes, got %d", ed25519.PublicKeySize, len(pub))
	}
	if !ed25519.Verify(ed25519.PublicKey(pub), data, raw) {
		return fmt.Errorf("signature verification failed: binary does not match cosign signature")
	}
	return nil
}

// edgeCosignPublicKey loads the optional ed25519 public key (KSEDGE_* with
// COSIGN_PUBLIC_KEY fallback). Returns (nil,false) when unset.
func edgeCosignPublicKey() ([]byte, bool) {
	for _, key := range []string{"KSEDGE_COSIGN_PUBLIC_KEY", "COSIGN_PUBLIC_KEY", "KSPANEL_COSIGN_PUBLIC_KEY"} {
		if p := strings.TrimSpace(os.Getenv(key)); p != "" {
			if strings.Contains(p, "BEGIN") {
				if blk, _ := pem.Decode([]byte(p)); blk != nil && len(blk.Bytes) >= ed25519.PublicKeySize {
					return blk.Bytes[len(blk.Bytes)-ed25519.PublicKeySize:], true
				}
			} else {
				compact := strings.Join(strings.Fields(p), "")
				if raw, err := base64.StdEncoding.DecodeString(compact); err == nil && len(raw) == ed25519.PublicKeySize {
					return raw, true
				}
				if raw, err := base64.URLEncoding.DecodeString(compact); err == nil && len(raw) == ed25519.PublicKeySize {
					return raw, true
				}
			}
		}
	}
	for _, key := range []string{"KSEDGE_COSIGN_PUBKEY_FILE", "KSPANEL_COSIGN_PUBKEY_FILE"} {
		if f := strings.TrimSpace(os.Getenv(key)); f != "" {
			if data, err := os.ReadFile(f); err == nil {
				if blk, _ := pem.Decode(data); blk != nil && len(blk.Bytes) >= ed25519.PublicKeySize {
					return blk.Bytes[len(blk.Bytes)-ed25519.PublicKeySize:], true
				}
				compact := strings.Join(strings.Fields(string(data)), "")
				if raw, err := base64.StdEncoding.DecodeString(compact); err == nil && len(raw) == ed25519.PublicKeySize {
					return raw, true
				}
			}
		}
	}
	return nil, false
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

// embeddedEdgeReinstallSignature best-effort resolves manifest.signature_edge
// to embed into reinstall.sh. Empty on failure (checksum-only install).
func embeddedEdgeReinstallSignature() string {
	m, err := fetchEdgeManifest()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(m.SignatureEdge)
}
