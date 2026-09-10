package specyaml

import (
	"strings"
	"testing"
)

func TestParseJSON(t *testing.T) {
	m, err := Parse(`{"env":[{"name":"MAX_MEM","default":"2G"}],"install_timeout_sec":90}`)
	if err != nil {
		t.Fatalf("Parse JSON: %v", err)
	}
	env, ok := m["env"].([]any)
	if !ok || len(env) != 1 {
		t.Fatalf("env mismatch: %#v", m["env"])
	}
	// Numbers normalize to float64 exactly like encoding/json.
	if f, ok := m["install_timeout_sec"].(float64); !ok || f != 90 {
		t.Fatalf("number type mismatch: %#v", m["install_timeout_sec"])
	}
}

func TestParseYAML(t *testing.T) {
	m, err := Parse("env:\n- name: MAX_MEM\n  default: \"2G\"\ninstall_timeout_sec: 90\n")
	if err != nil {
		t.Fatalf("Parse YAML: %v", err)
	}
	env, ok := m["env"].([]any)
	if !ok || len(env) != 1 {
		t.Fatalf("env mismatch: %#v", m["env"])
	}
	em, _ := env[0].(map[string]any)
	if em["default"] != "2G" {
		t.Fatalf("env default mismatch (quoting lost?): %#v", env[0])
	}
	if f, ok := m["install_timeout_sec"].(float64); !ok || f != 90 {
		t.Fatalf("YAML int must normalize to float64: %#v", m["install_timeout_sec"])
	}
}

func TestParseYAMLBlockScalar(t *testing.T) {
	m, err := Parse("install:\n- action: shell\n  command: |\n    curl -fsSLO https://example.com/server.jar\n    java -jar server.jar nogui\n")
	if err != nil {
		t.Fatalf("Parse YAML block: %v", err)
	}
	steps, ok := m["install"].([]any)
	if !ok || len(steps) != 1 {
		t.Fatalf("install mismatch: %#v", m["install"])
	}
	cmd, _ := steps[0].(map[string]any)["command"].(string)
	if !strings.Contains(cmd, "curl -fsSLO https://example.com/server.jar\n") {
		t.Fatalf("literal-block newlines lost: %q", cmd)
	}
}

func TestParseEmpty(t *testing.T) {
	for _, s := range []string{"", "   ", "{}", "{}\n"} {
		m, err := Parse(s)
		if err != nil {
			t.Fatalf("Parse(%q): %v", s, err)
		}
		if len(m) != 0 {
			t.Fatalf("Parse(%q) must be empty, got %#v", s, m)
		}
	}
}

func TestParseRejectsGarbage(t *testing.T) {
	if _, err := Parse("\t: : : not a manifest : :"); err == nil {
		t.Fatal("expected error for malformed input")
	} else if !strings.Contains(err.Error(), "YAML") {
		t.Fatalf("error should name the formats: %v", err)
	}
}

func TestUnmarshalRespectsJSONTags(t *testing.T) {
	var out struct {
		Actions []struct {
			ID             string `json:"id"`
			AutoStopDelayS any    `json:"auto_stop_delay_s"`
		} `json:"actions"`
	}
	if err := Unmarshal("actions:\n- id: mc\n  auto_stop_delay_s: 30\n", &out); err != nil {
		t.Fatalf("Unmarshal YAML: %v", err)
	}
	if len(out.Actions) != 1 || out.Actions[0].ID != "mc" {
		t.Fatalf("json tags ignored: %#v", out)
	}
	// Same input as JSON must decode identically.
	var out2 struct {
		Actions []struct {
			ID             string `json:"id"`
			AutoStopDelayS any    `json:"auto_stop_delay_s"`
		} `json:"actions"`
	}
	if err := Unmarshal(`{"actions":[{"id":"mc","auto_stop_delay_s":30}]}`, &out2); err != nil {
		t.Fatalf("Unmarshal JSON: %v", err)
	}
	if len(out2.Actions) != 1 || out2.Actions[0].ID != "mc" {
		t.Fatalf("json decode mismatch: %#v", out2)
	}
}

func TestMarshalRoundTrip(t *testing.T) {
	m, err := Parse(`{"a":1,"b":{"c":[true,false],"d":"x"}}`)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	y, err := Marshal(m)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if IsJSON(y) {
		t.Fatalf("Marshal must emit YAML, got: %q", y)
	}
	back, err := Parse(y)
	if err != nil {
		t.Fatalf("re-Parse: %v", err)
	}
	if len(back) != len(m) {
		t.Fatalf("round-trip lost keys: %#v", back)
	}
	if _, err := Marshal(map[string]any{}); err != nil {
		t.Fatalf("Marshal empty: %v", err)
	}
	if s, _ := Marshal(nil); strings.TrimSpace(s) != "{}" {
		t.Fatalf("Marshal nil must be {}, got %q", s)
	}
}

func TestNormalizeToYAML(t *testing.T) {
	y, err := NormalizeToYAML(`{"ports":[{"host":25565,"container":25565}]}`)
	if err != nil {
		t.Fatalf("NormalizeToYAML: %v", err)
	}
	if IsJSON(y) {
		t.Fatalf("normalized spec must be YAML, got: %q", y)
	}
	m, err := Parse(y)
	if err != nil {
		t.Fatalf("re-Parse: %v", err)
	}
	ports, ok := m["ports"].([]any)
	if !ok || len(ports) != 1 {
		t.Fatalf("ports lost: %#v", m["ports"])
	}
	// Already-YAML input round-trips idempotently.
	y2, err := NormalizeToYAML(y)
	if err != nil {
		t.Fatalf("re-normalize: %v", err)
	}
	if y2 != y {
		t.Fatalf("YAML normalize must be idempotent:\n%s\n---\n%s", y, y2)
	}
}

func TestIsJSON(t *testing.T) {
	if !IsJSON(`{"a":1}`) || !IsJSON(`  [{},{}]`) {
		t.Fatal("JSON not detected")
	}
	if IsJSON("a: 1\n") || IsJSON("") || IsJSON("ports:\n- 80\n") {
		t.Fatal("YAML misdetected as JSON")
	}
	// "{}\n" IS JSON-shaped (starts with {) — the empty-object default the
	// old code stored. The migrator treats it as JSON and canonicalizes it
	// to the same empty map; assert the parse, not the heuristic.
	if m, err := Parse("{}\n"); err != nil || len(m) != 0 {
		t.Fatalf("empty object must parse empty: %#v %v", m, err)
	}
}
