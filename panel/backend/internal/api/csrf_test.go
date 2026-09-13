package api

import "testing"

// TestIsCSRFExemptPathPinned locks the public-exempt matrix: login/
// register stay exempt (no session yet), logout requires the token
// (live session), OAuth start/callback stay exempt (Apple form_post),
// future /api/auth/* endpoints fail closed, POST /api/themes requires
// a token, and the token mint itself stays exempt.
func TestIsCSRFExemptPathPinned(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/auth/login", true},
		{"/api/auth/logout", false},
		{"/api/auth/register", true},
		{"/api/auth/oauth/google/start", true},
		{"/api/auth/oauth/apple/callback", true},
		{"/api/auth/evil-future", false},
		{"/api/themes", false},
		{"/api/csrf-token", true},
	}
	for _, tc := range cases {
		if got := isCSRFExemptPath(tc.path); got != tc.want {
			t.Errorf("isCSRFExemptPath(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}
