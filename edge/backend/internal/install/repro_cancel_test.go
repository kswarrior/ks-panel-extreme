package install

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestReproCancelAbortsRetries(t *testing.T) {
	var calls int64
	exec := func(ctx context.Context, command []string) (string, string, int, error) {
		atomic.AddInt64(&calls, 1)
		return "", "fail", 1, nil
	}
	in := Input{Name: "x", Kind: "docker", Steps: []Step{{Action: "shell", Command: "exit 1", Retries: "5"}}}
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(100 * time.Millisecond); cancel() }()
	start := time.Now()
	state, _ := Run(ctx, in, exec, nil)
	el := time.Since(start)
	n := atomic.LoadInt64(&calls)
	t.Logf("state=%s calls=%d elapsed=%s", state, n, el)
	if n != 1 {
		t.Fatalf("BUG: cancelled workflow retried %d times, want 1 (abort on cancel)", n)
	}
}
