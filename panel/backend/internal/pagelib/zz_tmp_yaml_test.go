package pagelib

// TEMPORARY verification (deleted after run): NormalizePageBytes must accept
// the edited library yamls (terminal full-bleed + tokenized dots,
// minecraft-properties tokenized option styles).
import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTmpEditedLibraryYamlsNormalize(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "instance_pages", "pages")
	for _, n := range []string{"terminal.yaml", "minecraft-properties.yaml", "automation.yaml", "env.yaml", "files.yaml", "ports.yaml", "react-dashboard.yaml"} {
		raw, err := os.ReadFile(filepath.Join(root, n))
		if err != nil {
			t.Fatalf("%s: read: %v", n, err)
		}
		out, err := NormalizePageBytes(raw)
		if err != nil {
			t.Fatalf("%s: normalize: %v", n, err)
		}
		if len(out) == 0 {
			t.Fatalf("%s: empty normalized output", n)
		}
	}
	term, _ := os.ReadFile(filepath.Join(root, "terminal.yaml"))
	if !strings.Contains(string(term), "ks-terminal-bleed") {
		t.Fatal("terminal.yaml missing bleed block")
	}
	mc, _ := os.ReadFile(filepath.Join(root, "minecraft-properties.yaml"))
	if !strings.Contains(string(mc), "var(--ks-dropdown-bg, #1f2937)") {
		t.Fatal("minecraft-properties.yaml option style not tokenized")
	}
}
