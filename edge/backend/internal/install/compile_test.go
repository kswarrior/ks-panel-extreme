package install

import (
	"strings"
	"testing"
)

// TestCompileDownloadMkdirParent proves the download step creates the
// target's parent dir before invoking curl/wget. Without it a missing dir
// (e.g. /mc on a fresh container) fails as curl exit 23 ("Failure writing
// output") even though the URL itself is fine.
func TestCompileDownloadMkdirParent(t *testing.T) {
	script, err := compileStep(Step{
		Action:   "download",
		URL:      "https://example.com/server.jar",
		Filename: "/mc/server.jar",
	}, nil)
	if err != nil {
		t.Fatalf("compile download: %v", err)
	}
	want := `mkdir -p "$(dirname '/mc/server.jar')"`
	if !strings.Contains(script, want) {
		t.Fatalf("download script missing parent-dir creation %q, got:\n%s", want, script)
	}
	// The transfer itself must still be present after the mkdir line.
	if !strings.Contains(script, "curl -fsSL") || !strings.Contains(script, "wget") {
		t.Fatalf("download script lost curl/wget branch, got:\n%s", script)
	}
	if strings.Index(script, "mkdir -p") > strings.Index(script, "curl -fsSL") {
		t.Fatalf("mkdir must run before curl, got:\n%s", script)
	}
}

// TestCompileDownloadRequiresFields keeps the fail-fast contract: a
// download step without url+filename is a compile error, not a runtime one.
func TestCompileDownloadRequiresFields(t *testing.T) {
	for _, s := range []Step{
		{Action: "download", Filename: "/mc/server.jar"},
		{Action: "download", URL: "https://example.com/server.jar"},
	} {
		if _, err := compileStep(s, nil); err == nil {
			t.Fatalf("expected compile error for %+v", s)
		}
	}
}
