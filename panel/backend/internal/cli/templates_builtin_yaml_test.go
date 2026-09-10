package cli

import (
	"strings"
	"testing"

	"github.com/example/kspanel/internal/specyaml"
)

// TestBuiltinSpecsAreYAMLParseable pins the canned catalog to the new
// contract: every builtin Spec is YAML (legacy JSON would still parse, but
// the catalog itself must be authored as YAML), parses to the same shape
// the drivers consume, and carries the fields import:template needs.
func TestBuiltinSpecsAreYAMLParseable(t *testing.T) {
	if len(builtinTemplates) == 0 {
		t.Fatal("builtin catalog is empty")
	}
	seen := map[string]bool{}
	for _, b := range builtinTemplates {
		if b.Key == "" || b.Name == "" || b.Kind == "" {
			t.Fatalf("builtin missing key/name/kind: %#v", b)
		}
		if seen[b.Key] {
			t.Fatalf("duplicate builtin key %q", b.Key)
		}
		seen[b.Key] = true
		m, err := specyaml.Parse(b.Spec)
		if err != nil {
			t.Fatalf("builtin %q spec does not parse as YAML: %v", b.Key, err)
		}
		if specyaml.IsJSON(b.Spec) {
			t.Fatalf("builtin %q spec is still JSON — author it as YAML", b.Key)
		}
		if _, err := specyaml.NormalizeToYAML(b.Spec); err != nil {
			t.Fatalf("builtin %q spec does not normalize: %v", b.Key, err)
		}
		_ = m
	}
}

// TestBuiltinMinecraftSpecShape pins the canned minecraft template's
// multi-image demo: the exact YAML shipped above must carry both runtimes
// with Java 21 as the default.
func TestBuiltinMinecraftSpecShape(t *testing.T) {
	b := findBuiltinTemplate("minecraft")
	if b == nil {
		t.Fatal("minecraft builtin missing")
	}
	m, err := specyaml.Parse(b.Spec)
	if err != nil {
		t.Fatalf("minecraft spec does not parse: %v", err)
	}
	images, ok := m["images"].([]any)
	if !ok || len(images) != 2 {
		t.Fatalf("want 2 runtimes, got %#v", m["images"])
	}
	first, _ := images[0].(map[string]any)
	if first["name"] != "Java 21" || first["default"] != true {
		t.Fatalf("Java 21 must be the default runtime: %#v", images[0])
	}
	if !strings.Contains(b.Spec, "mc-console") {
		t.Fatalf("minecraft spec lost its terminal binding")
	}
}
