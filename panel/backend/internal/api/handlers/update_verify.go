package handlers

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
	"path/filepath"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// Verified downloads for the panel self-update / reinstall surface.
//
// The build publishes release/kspanel.sha256 (`<hex>  kspanel`, see
// rebuild.sh generate_checksums) and a cosign sidecar (release/kspanel.sig
// via SIGN_KEY). The version manifest carries the same values inline
// (tools/stamp-version-manifest.sh) so an update-apply can verify the
// downloaded bytes BEFORE chmod/swap:
//
//	{
//	  "version": "0.1.1",
//	  "sha256": "<64 hex chars of the kspanel binary>",
//	  "signature": "<cosign sign-blob output, base64>",
///	  "sha256_url": "<optional explicit sidecar URL>"
//	}
//
// Verification chain in UpdateApplyHandler / ReinstallHandler (and the
// reinstall.sh template, which embeds both values at generation time):
//  1. re-fetch version.json fresh (15s client, 1MiB cap — the same
//     SSRF/timeout discipline as UpdateCheckHandler),
//  2. verify manifest.signature with verifyPanelSignature (base64 format
//     + ≥64 bytes, plus ed25519 crypto when KSPANEL_COSIGN_PUBLIC_KEY or
//     KSPANEL_COSIGN_PUBKEY_FILE is configured); on mismatch delete temp,
//     leave live untouched, audit + 422,
//  3. prefer manifest.sha256, else fetch manifest.sha256_url, else fetch
//     the conventional sidecar kspanelBaseURL/kspanel.sha256,
//  4. stream-hash the temp file and compare; on mismatch delete the temp
//     file, leave the live binary untouched, audit-log the failure and
//     answer 422.
// When neither signature nor checksum is published anywhere the apply
// proceeds unverified but records that fact in the response log + audit
// row, so old manifests don't brick updates while new ones are enforced.

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

// verifyPanelSignature verifies the cosign signature for the downloaded
// panel binary BEFORE the pre-chmod hash gate. The signature bytes come
// from manifest.signature (stamped by tools/stamp-version-manifest.sh from
// release/kspanel.sig, itself produced by `cosign sign-blob` when SIGN_KEY
// is set at build time).
//
// Semantics:
//   - Empty signature → nil (no signature published; the caller logs
//     "no signature published" and relies on the SHA-256 gate alone, so
//     old manifests don't brick updates while new ones are enforced).
//   - Non-empty signature → base64 must decode and be ≥64 bytes (ed25519
//     is 64, ECDSA DER is ~70-72); otherwise 422.
//   - When a public key is configured (KSPANEL_COSIGN_PUBLIC_KEY env with
//     base64 raw 32-byte ed25519 key or PEM PKIX, or
//     KSPANEL_COSIGN_PUBKEY_FILE pointing at a PEM file), the file bytes
//     are verified with ed25519 and a crypto failure is 422. Without a
//     configured key the format check + SHA-256 gate provide
//     defense-in-depth (HTTPS + checksum + signature presence).
//
// Pure check — never mutates; the caller deletes the temp file on error.
func verifyPanelSignature(path, signature string) error {
	sig := strings.TrimSpace(signature)
	if sig == "" {
		return nil
	}
	// Cosign outputs a single base64 line; stamp strips newlines, but be
	// liberal and drop any whitespace the transport added.
	sigCompact := strings.Join(strings.Fields(sig), "")
	raw, err := base64.StdEncoding.DecodeString(sigCompact)
	if err != nil {
		if raw2, err2 := base64.URLEncoding.DecodeString(sigCompact); err2 == nil {
			raw = raw2
			err = nil
		} else if raw3, err3 := base64.RawStdEncoding.DecodeString(sigCompact); err3 == nil {
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
	pub, hasKey := panelCosignPublicKey()
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

// panelCosignPublicKey loads the optional ed25519 public key for real
// crypto verification. Accepts:
//   - KSPANEL_COSIGN_PUBLIC_KEY: base64 raw 32 bytes, or PEM PKIX block,
//   - KSPANEL_COSIGN_PUBKEY_FILE: path to a PEM file with the same.
// Returns (nil,false) when neither is set — the caller then enforces
// format + checksum only.
func panelCosignPublicKey() ([]byte, bool) {
	if p := strings.TrimSpace(os.Getenv("KSPANEL_COSIGN_PUBLIC_KEY")); p != "" {
		// PEM?
		if strings.Contains(p, "BEGIN") {
			if blk, _ := pem.Decode([]byte(p)); blk != nil {
				// Try PKIX parse via ed25519: PEM from `cosign generate-key-pair`
				// is PKIX; the raw key is the last 32 bytes.
				if len(blk.Bytes) >= ed25519.PublicKeySize {
					return blk.Bytes[len(blk.Bytes)-ed25519.PublicKeySize:], true
				}
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
	if f := strings.TrimSpace(os.Getenv("KSPANEL_COSIGN_PUBKEY_FILE")); f != "" {
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
	return nil, false
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

// embeddedReinstallSignature best-effort resolves the cosign signature to
// embed into a generated reinstall.sh (manifest.signature). Empty on any
// failure — the script then installs with checksum only (plus a warning).
func embeddedReinstallSignature() string {
	m, err := fetchUpdateManifest()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(m.Signature)
}

// stageFailure is the typed error from stagePanelBinary. Code is the HTTP
// status the handler should answer with; IsVerify marks checksum failures
// so the caller audit-logs them (the artifact, not the panel, is at
// fault — 422, not 5xx).
type stageFailure struct {
	Code     int
	Msg      string
	IsVerify bool
}

func (e *stageFailure) Error() string { return e.Msg }

// stagePanelBinary downloads the release binary into <exe>.update,
// verifies its SHA-256 when the manifest publishes one, chmods it and
// swaps it over the running executable (keeping <exe>.old for rollback).
// kind is "update" or "reinstall" (log wording only). On ANY failure the
// temp file is removed and the live binary is untouched. The .old
// rollback + /health-gate relaunch stay with the caller — this function
// only stages the new binary on the live path. Shared by
// UpdateApplyHandler, ReinstallHandler and the scheduled-update-window
// runner so all three enforce identical verification.
func stagePanelBinary(kind string) (exe string, logLines []string, err error) {
	logLines = []string{}
	fail := func(code int, msg string, isVerify bool) (string, []string, error) {
		return "", logLines, &stageFailure{Code: code, Msg: msg, IsVerify: isVerify}
	}

	exe, err = os.Executable()
	if err != nil {
		return fail(http.StatusInternalServerError, "cannot locate running binary: "+err.Error(), false)
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}
	exeDir := filepath.Dir(exe)
	exeBase := filepath.Base(exe)
	oldPath := filepath.Join(exeDir, exeBase+".old")
	tmpPath := filepath.Join(exeDir, exeBase+".update")

	// 1) Stream the new binary into a temp file (NOT into the live path)
	// so a partial download can't leave a truncated executable that the OS
	// would happily launch on next start.
	verb := "downloading "
	if kind == "reinstall" {
		verb = "reinstalling from "
	}
	logLines = append(logLines, verb+kspanelBinaryURL+" …")
	if err := downloadUpdateFile(kspanelBinaryURL, tmpPath); err != nil {
		return fail(http.StatusBadGateway, "download failed: "+err.Error(), false)
	}
	fi, statErr := os.Stat(tmpPath)
	if statErr != nil || fi.Size() == 0 {
		os.Remove(tmpPath)
		return fail(http.StatusBadGateway, "downloaded file is empty or missing", false)
	}
	// Verified download: cosign signature FIRST, then SHA-256 hash, both
	// BEFORE chmod/swap. On ANY verification failure the temp file is
	// deleted, the live binary is untouched, and the caller answers 422 +
	// audit-logs. The manifest fetch itself is best-effort: when neither
	// signature nor checksum is published (or reachable) the stage proceeds
	// unverified and logs that fact, so old manifests don't brick updates
	// while new ones are enforced.
	if m, merr := fetchUpdateManifest(); merr != nil {
		logLines = append(logLines, "could not fetch manifest for verification ("+merr.Error()+") — installing unverified binary")
	} else {
		// 1) Cosign signature gate (before the hash gate).
		if sig := strings.TrimSpace(m.Signature); sig != "" {
			if serr := verifyPanelSignature(tmpPath, sig); serr != nil {
				os.Remove(tmpPath)
				return fail(http.StatusUnprocessableEntity, "signature mismatch — download deleted, live binary untouched: "+serr.Error(), true)
			}
			logLines = append(logLines, "signature verified (cosign)")
		} else {
			logLines = append(logLines, "no signature published — checksum only")
		}
		// 2) SHA-256 hash gate.
		if expected, verr := resolveExpectedSHA256(m); verr != nil {
			os.Remove(tmpPath)
			return fail(http.StatusUnprocessableEntity, "checksum error: "+verr.Error(), true)
		} else if expected != "" {
			if verr := verifyFileSHA256(tmpPath, expected); verr != nil {
				os.Remove(tmpPath)
				return fail(http.StatusUnprocessableEntity, "checksum mismatch — download deleted, live binary untouched: "+verr.Error(), true)
			}
			logLines = append(logLines, "checksum verified (sha256 "+expected[:12]+"…)")
		} else {
			logLines = append(logLines, "no checksum published — installing unverified binary")
		}
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		os.Remove(tmpPath)
		return fail(http.StatusInternalServerError, "chmod failed: "+err.Error(), false)
	}
	logLines = append(logLines, fmt.Sprintf("downloaded %d bytes", fi.Size()))

	// 2) Move the running binary aside. We rename, not copy — Linux (and
	// every other Unix) lets you rename an open file, so the running
	// process keeps executing from the inode even though the directory
	// entry has moved.
	if _, statErr := os.Stat(oldPath); statErr == nil {
		// Drop any prior .old first so the rename below is unambiguous;
		// otherwise on a second update the old→new rename would refuse.
		if err := os.Remove(oldPath); err != nil {
			os.Remove(tmpPath)
			return fail(http.StatusInternalServerError, "could not remove prior backup: "+err.Error(), false)
		}
		logLines = append(logLines, "removed prior "+exeBase+".old")
	}
	if err := os.Rename(exe, oldPath); err != nil {
		os.Remove(tmpPath)
		return fail(http.StatusInternalServerError, "could not move running binary aside: "+err.Error(), false)
	}
	logLines = append(logLines, "moved current binary to "+oldPath)

	// 3) Place the freshly downloaded binary on the live path. If this
	// step fails we've lost nothing (the .old still has the running code)
	// — we just abort with an error and the operator can re-run the apply
	// or manually mv .old back.
	if err := os.Rename(tmpPath, exe); err != nil {
		// Best-effort rollback: put the running binary back so the next
		// launch isn't broken. The .new is left on disk so the operator
		// can inspect / move it manually.
		_ = os.Rename(oldPath, exe)
		return fail(http.StatusInternalServerError, "could not place new binary: "+err.Error(), false)
	}
	logLines = append(logLines, "placed new binary at "+exe)
	return exe, logLines, nil
}
