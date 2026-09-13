package drivers

import (
	"errors"
	"testing"
)

// Scratch verification for the multipass flag-injection guard. Deleted after
// the run; not part of the delivered diff.
func TestScratchMultipassGuard(t *testing.T) {
	for _, n := range []string{"--all", "--purge", "--force", "-x"} {
		if err := checkMultipassName("instance", n); err == nil {
			t.Errorf("checkMultipassName(%q) = nil, want rejection", n)
		} else {
			t.Logf("reject %q: %v", n, err)
		}
	}
	for _, n := range []string{"desirable-earwig", "vm1", "primary", "a"} {
		if err := checkMultipassName("instance", n); err != nil {
			t.Errorf("checkMultipassName(%q) = %v, want nil", n, err)
		} else {
			t.Logf("accept %q", n)
		}
	}
	if err := checkMultipassName("instance", ""); err == nil {
		t.Error("empty name accepted, want rejection")
	}
	if err := checkMultipassName("snapshot", "--all"); err == nil {
		t.Error("dash snapshot name accepted, want rejection")
	}
	if !isUnknownFlagErr(errors.New("multipass exited exit status 1: Unknown option 'force'.")) {
		t.Error("Qt unknown-option message not detected")
	}
	if isUnknownFlagErr(errors.New("stop failed: Cannot shut down suspended instance vm2.")) {
		t.Error("genuine stop failure misclassified as unknown flag")
	}
}
