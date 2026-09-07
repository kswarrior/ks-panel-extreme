package handlers

import (
	"strings"
	"testing"
)

func TestValidateConfigFilesNativeArray(t *testing.T) {
	spec := map[string]any{
		"config_files": []any{
			map[string]any{
				"file":   "server.properties",
				"parser": "properties",
				"find":   map[string]any{"server-port": "25565", "motd": "hello"},
			},
			map[string]any{
				"file":   "config.yml",
				"parser": "yaml",
				"find":   map[string]any{"server.port": "25565"},
			},
		},
	}
	if err := validateConfigFiles(spec); err != nil {
		t.Fatalf("valid spec rejected: %v", err)
	}
	entries, err := normalizeConfigFiles(spec)
	if err != nil {
		t.Fatalf("normalize failed: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("want 2 entries, got %d", len(entries))
	}
}

func TestValidateConfigFilesRejectsTraversal(t *testing.T) {
	spec := map[string]any{
		"config_files": []any{
			map[string]any{"file": "../escape", "parser": "file", "find": map[string]any{"a": "b"}},
		},
	}
	if err := validateConfigFiles(spec); err == nil {
		t.Fatal("traversal should fail")
	}
	spec2 := map[string]any{
		"config_files": []any{
			map[string]any{"file": "/absolute", "parser": "file", "find": map[string]any{"a": "b"}},
		},
	}
	if err := validateConfigFiles(spec2); err == nil {
		t.Fatal("absolute path should fail")
	}
}

func TestNormalizePteroNestedShape(t *testing.T) {
	spec := map[string]any{
		"config": map[string]any{
			"files": map[string]any{
				"server.properties": map[string]any{
					"parser": "properties",
					"find":   map[string]any{"server-port": "25565"},
				},
			},
		},
	}
	entries, err := normalizeConfigFiles(spec)
	if err != nil {
		t.Fatalf("ptero shape failed: %v", err)
	}
	if len(entries) != 1 || entries[0].File != "server.properties" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
}

func TestApplyProperties(t *testing.T) {
	content := "# comment\nserver-port=25565\nmotd=old\n"
	out, changed, err := ApplyConfigContent("properties", content, map[string]any{"server-port": "25566", "max-players": "20"})
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("expected changed")
	}
	if !strings.Contains(out, "server-port=25566") || !strings.Contains(out, "max-players=20") || !strings.Contains(out, "# comment") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestApplyJSONDotIndexWildcard(t *testing.T) {
	content := `{"server":{"port":25565},"listeners":[{"port":1},{"port":2}]}`
	out, changed, err := ApplyConfigContent("json", content, map[string]any{
		"server.port":       "25566",
		"listeners[0].port": float64(8080),
		"listeners[*].port": "9090",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("expected changed")
	}
	if !strings.Contains(out, "25566") || !strings.Contains(out, "9090") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestApplyYAMLNested(t *testing.T) {
	content := "server:\n  port: 25565\n  host: localhost\n"
	out, changed, err := ApplyConfigContent("yaml", content, map[string]any{"server.port": "25566"})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "25566") {
		t.Fatalf("unexpected output changed=%v:\n%s", changed, out)
	}
}

func TestApplyINISection(t *testing.T) {
	content := "[server]\nport = 25565\n"
	out, changed, err := ApplyConfigContent("ini", content, map[string]any{"server.port": "25566", "server.host": "0.0.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "25566") || !strings.Contains(out, "0.0.0.0") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestApplyTOMLBeatsPtero(t *testing.T) {
	content := "[server]\nport = 25565\n"
	out, changed, err := ApplyConfigContent("toml", content, map[string]any{"server.port": "25566"})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "25566") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestApplyFileParser(t *testing.T) {
	content := "port 25565\nhost localhost\n"
	out, changed, err := ApplyConfigContent("file", content, map[string]any{"port": "25566"})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "25566") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestApplyXMLTagAndAttr(t *testing.T) {
	content := `<server port="25565"><motd>old</motd></server>`
	out, changed, err := ApplyConfigContent("xml", content, map[string]any{"motd": "new", "server@port": "25566"})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "25566") || !strings.Contains(out, "new") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestApplyMultiReplace(t *testing.T) {
	content := "host=127.0.0.1\n"
	out, changed, err := ApplyConfigContent("properties", content, map[string]any{
		"host": map[string]any{"127.0.0.1": "0.0.0.0", "localhost": "0.0.0.0"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "0.0.0.0") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestValidateConfigFilesMultiReplaceMap(t *testing.T) {
	// Builder serializes multi-replace as a real object value.
	spec := map[string]any{
		"config_files": []any{
			map[string]any{
				"file":   "config.yml",
				"parser": "yaml",
				"find": map[string]any{
					"servers.*.address": map[string]any{"127.0.0.1": "0.0.0.0"},
				},
			},
		},
	}
	if err := validateConfigFiles(spec); err != nil {
		t.Fatalf("multi-replace map rejected: %v", err)
	}
	out, changed, err := ApplyConfigContent("yaml", "servers:\n  a:\n    address: 127.0.0.1\n", map[string]any{
		"servers.*.address": map[string]any{"127.0.0.1": "0.0.0.0"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !strings.Contains(out, "0.0.0.0") {
		t.Fatalf("multi-replace did not apply:\n%s", out)
	}
}
