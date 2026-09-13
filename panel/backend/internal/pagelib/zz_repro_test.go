package pagelib

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReproCrossSourceStemDup(t *testing.T) {
	// embedded library ships ports.yaml; plant a disk legacy ports.json with same stem
	if err := os.MkdirAll("instance_pages/pages", 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	defer os.RemoveAll("instance_pages")
	if err := os.WriteFile(filepath.Join("instance_pages/pages/ports.json"), []byte(`{"name":"P","slug":"ports","content_type":"markdown","content_markdown":"x"}`), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	names := ListNames()
	ports := 0
	for _, n := range names {
		if strings.ToLower(strings.TrimSuffix(strings.TrimSuffix(n, ".json"), ".yaml")) == "ports" || strings.HasPrefix(strings.ToLower(n), "ports.") {
			ports++
			t.Logf("ports entry: %q", n)
		}
	}
	t.Logf("all names: %v", names)
	if ports != 1 {
		t.Errorf("BUG: stem 'ports' surfaces %d times (want 1 canonical), names=%v", ports, names)
	}
}
