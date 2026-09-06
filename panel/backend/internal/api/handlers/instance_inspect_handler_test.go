package handlers

import (
	"encoding/json"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

// procState reads the process state letter from /proc/<pid>/stat, handling
// comm fields that contain spaces/parens by stripping up to the last ')'.
// Mirrors the aliveness logic of killVerifyScript so the test verifies the
// same truth the production path reports.
func procState(pid int) (string, bool) {
	b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
	if err != nil {
		return "", false
	}
	s := string(b)
	if i := strings.LastIndexByte(s, ')'); i >= 0 && i+2 < len(s) {
		return s[i+2 : i+3], true
	}
	return "", false
}

// runKillScript spawns `sleep` as a stand-in workload, runs the generated
// kill script through /bin/sh (the interpreter class the edge's driver Exec
// uses), and returns the verification JSON plus whether the victim truly died.
func runKillScript(t *testing.T, signal string) (stdout string, victimAlive bool) {
	t.Helper()

	victim := exec.Command("sleep", "30")
	if err := victim.Start(); err != nil {
		t.Fatalf("spawn victim: %v", err)
	}
	pid := victim.Process.Pid
	waitErr := make(chan error, 1)
	go func() { waitErr <- victim.Wait() }()
	defer func() {
		_ = victim.Process.Kill()
		select {
		case <-waitErr:
		case <-time.After(time.Second):
		}
	}()

	out, err := exec.Command("/bin/sh", "-c", killVerifyScript(int64(pid), signal)).CombinedOutput()
	if err != nil {
		t.Fatalf("script run: %v\noutput: %s", err, out)
	}

	state := "alive"
	select {
	case <-waitErr:
		state = "dead"
	default:
	}
	if st, ok := procState(pid); ok && st == "Z" {
		state = "dead" // zombie = terminated, awaiting reap
	}
	return strings.TrimSpace(string(out)), state == "alive"
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
		t.Errorf("victim survived TERM script; output=%s", stdout)
	}
}

func TestKillVerifyScriptKillReportsNoEscalation(t *testing.T) {
	stdout, alive := runKillScript(t, "KILL")
	var res struct {
		Killed    bool `json:"killed"`
		Escalated bool `json:"escalated"`
	}
	if err := json.Unmarshal([]byte(stdout), &res); err != nil {
		t.Fatalf("unparseable script output %q: %v", stdout, err)
	}
	if !res.Killed || res.Escalated {
		t.Errorf("expected killed=true escalated=false, got %s", stdout)
	}
	if alive {
		t.Errorf("victim survived KILL script; output=%s", stdout)
	}
}

// TestKillVerifyScriptSplicesAreTyped pins down the injection-safety
// property: pid arrives as int64 (formatted via %d — digits only, never raw
// query bytes) and signal is compared against validKillSignals before use.
func TestKillVerifyScriptSplicesAreTyped(t *testing.T) {
	s := killVerifyScript(4242, "TERM")
	if !strings.Contains(s, "kill -TERM 4242") {
		t.Errorf("expected literal 'kill -TERM 4242' splice, got:\n%s", s)
	}
	for _, sig := range []string{"TERM", "KILL", "HUP", "INT", "QUIT", "ABRT", "USR1", "USR2"} {
		if !validKillSignals[sig] {
			t.Errorf("signal %s missing from allowlist", sig)
		}
	}
	for _, bad := range []string{"", "sigkill", "TERM;reboot", "-9"} {
		// Mirror the handler's normalisation (TrimSpace + ToUpper) so the
		// assertion pins the real gate: none of these may be allow-listed.
		if validKillSignals[strings.ToUpper(strings.TrimSpace(bad))] {
			t.Errorf("invalid signal %q passed allowlist", bad)
		}
	}
}
