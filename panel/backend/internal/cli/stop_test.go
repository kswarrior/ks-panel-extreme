package cli

import (
	"os"
	"testing"
)

func TestPidBelongsToUs(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Skip("no executable path")
	}
	if !pidBelongsToUs(os.Getpid(), exe) {
		t.Fatal("self PID must belong to us")
	}
	if pidBelongsToUs(999999999, exe) {
		t.Fatal("bogus PID must not belong to us")
	}
	if pidBelongsToUs(1, exe) {
		t.Log("pid 1 matched exe (running as init?) — acceptable")
	}
}
