package cli

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func testSidecarServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
}

func TestUpdateCmdRegistered(t *testing.T) {
	found := false
	for _, c := range rootCmd.Commands() {
		if c.Name() == "update" {
			found = true
		}
	}
	if !found {
		t.Fatal("update command must be registered on rootCmd")
	}
}

func TestSemverNewer(t *testing.T) {
	cases := []struct {
		remote, local string
		newer         bool
	}{
		{"1.0.99", "1.0.98", true},
		{"1.1.0", "1.0.99", true},
		{"2.0.0", "1.9.9", true},
		{"v1.0.99", "1.0.98", true},
		{"1.0.99", "1.0.99", false},
		{"1.0.98", "1.0.99", false},
		{"1.0.99-beta", "1.0.98", true},
	}
	for _, c := range cases {
		got, err := semverNewer(c.remote, c.local)
		if err != nil {
			t.Fatalf("semverNewer(%q, %q): %v", c.remote, c.local, err)
		}
		if got != c.newer {
			t.Errorf("semverNewer(%q, %q) = %v, want %v", c.remote, c.local, got, c.newer)
		}
	}
}

func TestSemverNewerRejectsGarbage(t *testing.T) {
	for _, v := range []string{"", "main", "1.0", "1.0.0.0", "a.b.c", "1.-2.3"} {
		if _, err := semverNewer(v, "1.0.0"); err == nil {
			t.Errorf("remote %q accepted", v)
		}
		if _, err := semverNewer("1.0.0", v); err == nil {
			t.Errorf("local %q accepted", v)
		}
	}
}

func TestFetchCLISidecarRejectsShortDigest(t *testing.T) {
	// Unit-guard the sidecar validation shape without network: an empty
	// body must error, never panic on Fields()[0].
	srv := testSidecarServer(t, "not-hex\n")
	defer srv.Close()
	if _, err := fetchCLISidecar(srv.URL); err == nil {
		t.Fatal("expected error for non-hex sidecar")
	}
}
