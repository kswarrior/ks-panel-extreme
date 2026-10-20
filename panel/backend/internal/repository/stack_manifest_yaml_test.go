package repository

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeStackManifestYAML(t *testing.T) {
	raw := []byte(`
name: YAML Stack
slug: yaml-stack
runtime: nodejs
locationType: node
nodeId: 7
permissionsRequested:
  - capability: metrics.read
    access_level: read
installSteps:
  - action: shell
    command: echo hello
`)
	normalized, err := NormalizeStackManifest(raw)
	if err != nil {
		t.Fatalf("NormalizeStackManifest: %v", err)
	}
	if !json.Valid(normalized) {
		t.Fatalf("normalized manifest is not JSON: %s", normalized)
	}
	var doc map[string]any
	if err := json.Unmarshal(normalized, &doc); err != nil {
		t.Fatalf("unmarshal normalized manifest: %v", err)
	}
	if doc["name"] != "YAML Stack" || doc["slug"] != "yaml-stack" {
		t.Fatalf("unexpected normalized manifest: %s", normalized)
	}
	if doc["locationType"] != "node" || doc["nodeId"] != float64(7) {
		t.Fatalf("node location fields were not preserved: %s", normalized)
	}
}

func TestParseStackManifestYAML(t *testing.T) {
	raw := []byte(`
name: YAML Stack
slug: yaml-stack
frontend:
  page_style: simple
  theme:
    mode: custom
backend:
  runtime: python
  entrypoint: app.py
permissionsRequested:
  - capability: notify
    access_level: write
`)
	in, err := ParseStackManifest(raw)
	if err != nil {
		t.Fatalf("ParseStackManifest: %v", err)
	}
	if in.Name != "YAML Stack" || in.Slug != "yaml-stack" {
		t.Fatalf("unexpected identity: %+v", in)
	}
	if in.Runtime != "python" || in.Entrypoint != "app.py" {
		t.Fatalf("nested backend block not applied: %+v", in)
	}
	if in.PageStyle != "simple" || in.ThemeMode != "custom" {
		t.Fatalf("nested frontend block not applied: %+v", in)
	}
	if len(in.PermissionsRequested) != 1 || in.PermissionsRequested[0].Capability != "notify" {
		t.Fatalf("permissions not parsed: %+v", in.PermissionsRequested)
	}
}

func TestParseStackManifestRejectsBadYAML(t *testing.T) {
	_, err := ParseStackManifest([]byte("name: [unclosed"))
	if err == nil || !strings.Contains(err.Error(), "neither valid JSON nor valid YAML") {
		t.Fatalf("want YAML parse error, got %v", err)
	}
}
