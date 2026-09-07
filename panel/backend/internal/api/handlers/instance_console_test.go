package handlers

import "testing"

// install_terminal_id / advanced.startup_terminal_id are the attach-by-ID
// handles for the Installation and Startup consoles. The deploy-time
// kickoffs keep the install stdin pipe open exactly when an install
// console is bound, so these pure helpers gate that decision (and the
// InstallStdinHandler's binding check) without touching the DB.
func TestInstallConsoleIDFromSpec(t *testing.T) {
	cases := []struct {
		name string
		spec map[string]any
		want string
	}{
		{"nil spec", nil, ""},
		{"empty spec", map[string]any{}, ""},
		{"missing key", map[string]any{"install": []any{}}, ""},
		{"null key", map[string]any{"install_terminal_id": nil}, ""},
		{"non-string key", map[string]any{"install_terminal_id": 42.0}, ""},
		{"empty string", map[string]any{"install_terminal_id": "   "}, ""},
		{"plain id", map[string]any{"install_terminal_id": "install-console"}, "install-console"},
		{"normalises like actions", map[string]any{"install_terminal_id": "Install Console"}, "install_console"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := installConsoleIDFromSpec(tc.spec); got != tc.want {
				t.Fatalf("installConsoleIDFromSpec(%v) = %q, want %q", tc.spec, got, tc.want)
			}
		})
	}
}

func TestKeepStdinForInstall(t *testing.T) {
	if keepStdinForInstall(nil) {
		t.Fatal("nil spec must not keep stdin")
	}
	if keepStdinForInstall(map[string]any{}) {
		t.Fatal("unbound install must not keep stdin (legacy closed-stdin path)")
	}
	if !keepStdinForInstall(map[string]any{"install_terminal_id": "install-console"}) {
		t.Fatal("bound install console must keep stdin")
	}
}

func TestInstallConsoleIDFromConfig(t *testing.T) {
	if got := installConsoleIDFromConfig(""); got != "" {
		t.Fatalf("empty config = %q, want empty", got)
	}
	if got := installConsoleIDFromConfig("{not json"); got != "" {
		t.Fatalf("bad json = %q, want empty", got)
	}
	got := installConsoleIDFromConfig(`{"install_terminal_id":"install-console","actions":[]}`)
	if got != "install-console" {
		t.Fatalf("config id = %q, want install-console", got)
	}
}
