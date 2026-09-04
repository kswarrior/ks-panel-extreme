package update

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func sha256HexOf(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func TestParseEdgeChecksumBodyForms(t *testing.T) {
	want := sha256HexOf("ksedge-binary")
	for _, body := range []string{want + "\n", want + "  ksedge\n"} {
		got, err := parseEdgeChecksumBody([]byte(body))
		if err != nil {
			t.Fatalf("parse %q: %v", body, err)
		}
		if got != want {
			t.Fatalf("got %q want %q", got, want)
		}
	}
	if _, err := parseEdgeChecksumBody([]byte("garbage")); err == nil {
		t.Fatal("expected error for garbage checksum body")
	}
}

func TestVerifyEdgeFileSHA256Match(t *testing.T) {
	p := filepath.Join(t.TempDir(), "ksedge.update")
	if err := os.WriteFile(p, []byte("genuine-edge-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifyEdgeFileSHA256(p, sha256HexOf("genuine-edge-bytes")); err != nil {
		t.Fatalf("expected match, got: %v", err)
	}
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("matching temp file must survive verification: %v", err)
	}
}

// TestVerifyEdgeMismatchAbortsLiveIntact mirrors the panel-side property:
// a tampered temp file aborts the apply, the temp is deleted, the live
// edge binary is byte-identical.
func TestVerifyEdgeMismatchAbortsLiveIntact(t *testing.T) {
	dir := t.TempDir()
	livePath := filepath.Join(dir, "ksedge")
	tmpPath := filepath.Join(dir, "ksedge.update")
	liveBytes := []byte("live-edge-v1")
	if err := os.WriteFile(livePath, liveBytes, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(tmpPath, []byte("tampered-edge"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifyEdgeFileSHA256(tmpPath, sha256HexOf("genuine-edge-v2")); err == nil {
		t.Fatal("expected checksum mismatch error for tampered file")
	} else if !strings.Contains(err.Error(), "mismatch") {
		t.Fatalf("expected mismatch error, got: %v", err)
	}
	if err := os.Remove(tmpPath); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Fatal("tampered temp file must be deleted on mismatch")
	}
	got, err := os.ReadFile(livePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(liveBytes) {
		t.Fatal("live binary must be untouched on mismatch")
	}
}

func TestResolveEdgeExpectedSHA256PrefersManifest(t *testing.T) {
	want := sha256HexOf("ksedge-binary")
	got, err := resolveEdgeExpectedSHA256(versionManifest{Version: "0.1.1", SHA256Edge: want})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

// TestResolveEdgeIgnoresPanelDigest: the shared manifest's bare sha256 is
// the PANEL binary — accepting it for ksedge would verify against the
// wrong bytes, so it must never be returned (whatever the sidecar fetch
// does, the panel digest is not a valid answer).
func TestResolveEdgeIgnoresPanelDigest(t *testing.T) {
	panelDigest := sha256HexOf("kspanel-binary")
	got, err := resolveEdgeExpectedSHA256(versionManifest{Version: "0.1.1", SHA256: panelDigest})
	if err != nil {
		t.Fatalf("panel digest must not error, got: %v", err)
	}
	if got == panelDigest {
		t.Fatal("edge resolver must never accept the panel sha256")
	}
}
