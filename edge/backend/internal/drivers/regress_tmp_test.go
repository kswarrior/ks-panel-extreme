package drivers

import "testing"

// Regression F4: every spelling LXD echoes for limits.memory must parse;
// unparsable input returns 0 so callers skip the override.
func TestParseLXDMemory(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"2147483648", 2147483648},
		{"2GB", 2 << 30},
		{"2GiB", 2 << 30}, // previously parsed to 0
		{"512MB", 512 << 20},
		{"512MiB", 512 << 20},
		{"1024KB", 1 << 20},
		{"64KiB", 1 << 16},
		{"1TB", 1 << 40},
		{"1TiB", 1 << 40},
		{"1.5GB", 1610612736}, // decimal magnitude, previously failed
		{"64B", 64},
		{" 2gb ", 2 << 30},
		{"", 0},
		{"garbage", 0},
		{"0", 0},
	}
	for _, c := range cases {
		if got := parseLXDMemory(c.in); got != c.want {
			t.Errorf("parseLXDMemory(%q)=%d want %d", c.in, got, c.want)
		}
	}
}

// Regression F3: absent-container destroy errors are recognised.
func TestIsAlreadyGoneErr(t *testing.T) {
	for _, msg := range []string{
		"Error: No such container: mc-1",
		"Error response from daemon: No such object: mc-1",
	} {
		if !isAlreadyGoneErr(errString(msg)) {
			t.Errorf("isAlreadyGoneErr(%q)=false", msg)
		}
	}
	if isAlreadyGoneErr(errString("permission denied")) {
		t.Error("unrelated error matched")
	}
	if isAlreadyGoneErr(nil) {
		t.Error("nil matched")
	}
}

type errString string

func (e errString) Error() string { return string(e) }
