package handlers

import (
	"testing"

	"github.com/example/kspanel/internal/models"
)

// install_terminal_id is the attach-by-ID handle for the Installation
// terminal. The deploy-time kickoffs keep the install stdin pipe open
// exactly when an install terminal is bound, so these pure helpers gate
// that decision (and the InstallStdinHandler's binding check) without
// touching the DB.
func TestInstallTerminalIDFromSpec(t *testing.T) {
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
			if got := installTerminalIDFromSpec(tc.spec); got != tc.want {
				t.Fatalf("installTerminalIDFromSpec(%v) = %q, want %q", tc.spec, got, tc.want)
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
		t.Fatal("bound install terminal must keep stdin")
	}
}

func TestInstallTerminalIDFromConfig(t *testing.T) {
	if got := installTerminalIDFromConfig(""); got != "" {
		t.Fatalf("empty config = %q, want empty", got)
	}
	if got := installTerminalIDFromConfig("{not json"); got != "" {
		t.Fatalf("bad json = %q, want empty", got)
	}
	got := installTerminalIDFromConfig(`{"install_terminal_id":"install-console","actions":[]}`)
	if got != "install-console" {
		t.Fatalf("config id = %q, want install-console", got)
	}
}

// edgeWorkflowName must always return the logical instance name, even when a
// docker container ID sits in ExternalID. The edge keys workflows by
// "<kind>:<name>" from InstallStart (logical name); addressing by
// ExternalID misses the record ("no workflow for docker:<container-id>")
// and breaks terminal input + the live workflow stream. Regression test.
func TestEdgeWorkflowName(t *testing.T) {
	if got := edgeWorkflowName(nil); got != "" {
		t.Fatalf("nil instance = %q, want empty", got)
	}
	inst := &models.Instance{Name: "my-mc", ExternalID: "6a7e8ef1a61731436232caccc61a7781a8d0538eb808e1327c2731f737f12081"}
	if got := edgeWorkflowName(inst); got != "my-mc" {
		t.Fatalf("edgeWorkflowName = %q, want logical name %q", got, "my-mc")
	}
	inst.ExternalID = ""
	if got := edgeWorkflowName(inst); got != "my-mc" {
		t.Fatalf("edgeWorkflowName without external id = %q, want %q", got, "my-mc")
	}
}
