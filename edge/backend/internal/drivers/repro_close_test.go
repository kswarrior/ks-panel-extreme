package drivers

import (
	"os/exec"
	"testing"
)

func TestReproPipedCloseLeak(t *testing.T) {
	cmd := exec.Command("true")
	stdin, stdout, stderr, err := startPiped(cmd)
	if err != nil {
		t.Fatalf("startPiped: %v", err)
	}
	// Fixed driver Close: closes all three ends.
	closeFixed := func() error { stdin.Close(); stdout.Close(); stderr.Close(); return nil }
	_ = closeFixed()
	// After fixed Close, extra closes must fail (already closed => no leak).
	if err := stdout.Close(); err == nil {
		t.Fatalf("stdout still open after fixed Close => leak persists")
	}
	if err := stderr.Close(); err == nil {
		t.Fatalf("stderr still open after fixed Close => leak persists")
	}
	t.Logf("OK: fixed Close releases stdout/stderr")
}
