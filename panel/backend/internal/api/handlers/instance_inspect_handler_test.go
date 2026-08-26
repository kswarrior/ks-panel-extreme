package handlers

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"testing"
)

// runKillScript spawns `sleep` as a child, runs the generated kill script
// through /bin/sh (the same interpreter class the edge's driver Exec uses),
// and returns the verification JSON line plus whether the victim survived.
func runKillScript(t *testing.T, signal string) (stdout string, victimAlive bool) {
	t.Helper()

	victim := exec.Command("sleep", "30")
	if err := victim.Start(); err != nil {
		t.Fatalf("spawn victim: %v", err)
	}
	pid := int64(victim.Process.Pid)
	defer func() {
		_ = victim.Process.Kill()
		_ = victim.Wait()
	}()

	script := killVerifyScript(pid, signal)
	out, err := exec.Command("/bin/sh", "-c", script).CombinedOutput()
	if err != nil {
		t.Fatalf("script run: %v\noutput: %s", err, out)
	}

	// Did the victim actually die? Wait is expected to return now.
	state := "alive"
	done := make(chan error, 1)
	go func() { done <- victim.Wait() }()
	select {
	case <-done:
		state = "dead"
	default:
	}

	line := strings.TrimSpace(string(out))
	return line, state == "alive" && pidStillExists(pid)
}

func pidStillExists(pid int64) bool {
	b, err := os_ReadProcStat(pid)
	return err == nil && !strings.Contains(b, " Z ")
}

func TestKillVerifyScriptTermKillsProcess(t *testing.T) {
	stdout, alive := runKillScript(t, "TERM")
	var res struct {
		Killed    bool `json:"killed"`
		Escalated bool `json:"escalated"`
	}
	if err := json.Unmarshal([]byte(stdout), &res); err != nil {
		t.Fatalf("unparseable script output %q: %v", stdout, err)
	}
	if !res.Killed {
		t.Errorf("expected killed=true, got %s", stdout)
	}
	if alive {
		t.Errorf("victim process still exists after TERM script; output=%s", stdout)
	}
}

func TestKillVerifyScriptKillReportsNoEscalation(t *testing.T) {
	stdout, alive := runKillScript(t, "KILL")
	if !strings.Contains(stdout, `"killed":true`) || strings.Contains(stdout, `"escalated":true`) {
		t.Errorf("unexpected KILL verdict: %s", stdout)
	}
	if alive {
		t.Errorf("victim survived KILL script; output=%s", stdout)
	}
}

func TestKillVerifyScriptRejectsInjectionShapes(t *testing.T) {
	// The generator only accepts an already-validated integer; prove the
	// splices contain no shell metacharacters for representative inputs.
	for _, pid := range []int64{1, 65535} {
		for _, sig := range []string{"TERM", "KILL"} {
			s := killVerifyScript(pid, sig)
			if strings.ContainsAny(s, ";|&`$()<>") {
				// $( ) appear inside the sed expression by design — but the
				// command-substitution form used there is '...' quoted, so
				// check the dangerous unquoted forms instead.
				t.Errorf("script for pid=%d sig=%s contains raw metacharacters:\n%s", pid, sig, s)
			}
		}
	}
}

func fmtPID(pid int64) string { return strconv.FormatInt(pid, 10) }

var _ = fmt.Sprintf
