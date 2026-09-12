package drivers

import (
	"strings"
	"testing"
)

func TestTempKVMRepro(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"20", "size=20"},
		{"20G", "size=20"},
		{"20g", "size=20"},
		{"20GB", "size=20"},
		{"20GiB", "size=20"},
		{" 20G ", "size=20"},
	} {
		args, err := buildKVMDeployArgs("n", map[string]any{"image": "x.iso", "disk_size": tc.in})
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		got := ""
		for i := 0; i < len(args)-1; i++ {
			if args[i] == "--disk" {
				got = args[i+1]
			}
		}
		if got != tc.want {
			t.Logf("IN %q GOT %q WANT %q", tc.in, got, tc.want)
		}
		_ = strings.TrimSpace("")
	}
	// Destroy swallow check: document current code path
	t.Log("destroy-err-swallow: kvm.go:177-179 empty if-body swallows all virsh destroy errors")
	// Snapshot check: document raw-output return
	t.Log("snapshot-create returns raw virsh stdout instead of snapName (kvm.go:365-374)")
	// Exec dead-code check
	t.Log("exec non-TTY startPiped block unreachable after !tty early return (kvm.go:205-267)")
}
