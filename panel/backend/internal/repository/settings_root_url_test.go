package repository

import "testing"

// Table tests for the panel root-URL normalize/validate pair (Settings >
// General > Root URL). Pure unit tests — no DB needed.
func TestNormalizePanelRootURL(t *testing.T) {
	for _, tc := range []struct {
		in, want string
	}{
		{"", ""},
		{"panel", "panel"},
		{"Panel", "panel"},
		{"  /panel/  ", "panel"},
		{"///", ""},
	} {
		if got := NormalizePanelRootURL(tc.in); got != tc.want {
			t.Errorf("NormalizePanelRootURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestValidatePanelRootURL(t *testing.T) {
	for _, tc := range []struct {
		in    string
		valid bool
	}{
		{"", true},
		{"panel", true},
		{"my-panel2", true},
		// UPPER normalizes to "upper" (Normalize lowercases) so it validates
		// like the Settings handler's Normalize-then-Validate path.
		{"UPPER", true},
		{"has space", false},
		{"api", false},
		{"health", false},
		{"favicon.ico", false},
		{"assets", false},
		{"-lead", false},
		{"0123456789012345678901234567890123", false}, // 34 chars
	} {
		err := ValidatePanelRootURL(NormalizePanelRootURL(tc.in))
		if (err == nil) != tc.valid {
			t.Errorf("ValidatePanelRootURL(%q) err = %v, want valid=%v", tc.in, err, tc.valid)
		}
	}
}
