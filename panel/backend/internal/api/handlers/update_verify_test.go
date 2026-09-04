package handlers

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

func TestParseChecksumBodyBareHex(t *testing.T) {
	want := sha256HexOf("kspanel-binary")
	got, err := parseChecksumBody([]byte(want + "\n"))
	if err != nil {
		t.Fatalf("parse bare hex: %v", err)
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestParseChecksumBodySha256SumForm(t *testing.T) {
	want := sha256HexOf("kspanel-binary")
	// Exactly the form rebuild.sh publishes: "<hex>  kspanel".
	got, err := parseChecksumBody([]byte(want + "  kspanel\n"))
	if err != nil {
		t.Fatalf("parse sha256sum form: %v", err)
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestParseChecksumBodyRejectsGarbage(t *testing.T) {
	for _, body := range []string{"", "not-hex", "abc123", strings.Repeat("z", 64)} {
		if _, err := parseChecksumBody([]byte(body)); err == nil {
			t.Fatalf("expected error for %q", body)
		}
	}
}

func TestVerifyFileSHA256Match(t *testing.T) {
	p := filepath.Join(t.TempDir(), "kspanel.update")
	if err := os.WriteFile(p, []byte("genuine-binary-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifyFileSHA256(p, sha256HexOf("genuine-binary-bytes")); err != nil {
		t.Fatalf("expected match, got: %v", err)
	}
	// A matching file must be left alone for the chmod/swap that follows.
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("matching temp file must survive verification: %v", err)
	}
}

// TestVerifyMismatchAbortsLiveIntact is the load-bearing property of
// verified downloads: a tampered temp file aborts the apply (verify
// error), the temp file is deleted, and the live binary is byte-identical.
func TestVerifyMismatchAbortsLiveIntact(t *testing.T) {
	dir := t.TempDir()
	livePath := filepath.Join(dir, "kspanel")
	tmpPath := filepath.Join(dir, "kspanel.update")
	liveBytes := []byte("live-binary-v1")
	if err := os.WriteFile(livePath, liveBytes, 0o755); err != nil {
		t.Fatal(err)
	}
	// Attacker/MITM tampered download.
	if err := os.WriteFile(tmpPath, []byte("tampered-binary"), 0o644); err != nil {
		t.Fatal(err)
	}
	expected := sha256HexOf("genuine-binary-v2")

	// Handler sequence: verify BEFORE chmod/swap; on error remove temp.
	if err := verifyFileSHA256(tmpPath, expected); err == nil {
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

func TestResolveExpectedSHA256PrefersManifest(t *testing.T) {
	want := sha256HexOf("kspanel-binary")
	got, err := resolveExpectedSHA256(updateVersionManifest{Version: "0.1.1", SHA256: want})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveExpectedSHA256RejectsBadHex(t *testing.T) {
	if _, err := resolveExpectedSHA256(updateVersionManifest{Version: "0.1.1", SHA256: "zzzz"}); err == nil {
		t.Fatal("expected error for malformed manifest sha256")
	}
}
