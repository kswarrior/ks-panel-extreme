package install

import (
	"context"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

type discardWriteCloser struct{ io.Writer }

func (d discardWriteCloser) Close() error { return nil }

// TestLiveStdoutWhileRunning proves a bound terminal pane can show a
// long-running action's console WHILE it runs (e.g. java's startup banner
// on mc-console). The engine must stream partial stdout into the step
// transcript on progress polls — not only the final blob after exit.
func TestLiveStdoutWhileRunning(t *testing.T) {
	outR, outW := io.Pipe()
	errR, errW := io.Pipe()
	release := make(chan struct{})
	sess := &ExecSession{
		Stdin:  discardWriteCloser{io.Discard},
		Stdout: outR,
		Stderr: errR,
		Wait: func() (int, error) {
			<-release
			return 0, nil
		},
		Close: func() error { return nil },
	}
	var mu sync.Mutex
	var snaps [][]StepStatus
	in := Input{
		Steps:     []Step{{Action: "shell", Command: "java -jar server.jar"}},
		KeepStdin: true,
		SessionExec: func(ctx context.Context, command []string) (*ExecSession, error) {
			return sess, nil
		},
		OnProgress: func(ss []StepStatus) {
			cp := make([]StepStatus, len(ss))
			copy(cp, ss)
			mu.Lock()
			snaps = append(snaps, cp)
			mu.Unlock()
		},
	}
	done := make(chan struct{})
	var state string
	var steps []StepStatus
	go func() {
		defer close(done)
		state, steps = RunWithStdin(context.Background(), in, nil, nil)
	}()
	// Simulate java writing its startup banner while still running.
	if _, err := io.WriteString(outW, "Starting minecraft server version 1.21\n"); err != nil {
		t.Fatalf("write stdout: %v", err)
	}
	// Give the engine time to stream the chunk into the transcript.
	time.Sleep(1500 * time.Millisecond)
	mu.Lock()
	found := false
	nSnaps := len(snaps)
	for _, s := range snaps {
		if len(s) > 0 && strings.Contains(s[0].Stdout, "Starting minecraft server") {
			found = true
			break
		}
	}
	mu.Unlock()
	close(release)
	_ = outW.Close()
	_ = errW.Close()
	<-done
	if state != StateDone {
		t.Fatalf("expected done, got %q", state)
	}
	if !found {
		t.Fatalf("no live stdout in progress snapshots while action running (got %d snapshots)", nSnaps)
	}
	if !strings.Contains(steps[0].Stdout, "Starting minecraft server") {
		t.Fatalf("final transcript missing output: %q", steps[0].Stdout)
	}
}
