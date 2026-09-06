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
	// Simulate current driver Close: only stdin.Close()
	_ = stdin.Close()
	// stdout/stderr should still be open => leak. Closing them now must succeed (nil error).
	if err := stdout.Close(); err != nil {
		t.Fatalf("stdout already closed (no leak?) err=%v", err)
	}
	if err := stderr.Close(); err != nil {
		t.Fatalf("stderr already closed (no leak?) err=%v", err)
	}
	t.Fatalf("BUG: non-TTY Close leaves stdout/stderr open (both needed explicit Close => fd leak)")
}
