package drivers

import (
	"context"
	"os/exec"
	"testing"
	"time"
)

func TestStopHostPidRespectsContextCancellation(t *testing.T) {
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}
	pid := cmd.Process.Pid
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()
	if !pidAlive(pid) {
		t.Fatalf("sleep pid %d not alive", pid)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	stopHostPid(ctx, pid, 10*time.Second)
	elapsed := time.Since(start)
	if elapsed >= 2*time.Second {
		t.Fatalf("stopHostPid with cancelled context took %v, want < 2s", elapsed)
	}
}
