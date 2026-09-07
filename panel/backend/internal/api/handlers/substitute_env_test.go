package handlers

import (
	"reflect"
	"testing"
)

func TestSubstituteOneBothSyntaxes(t *testing.T) {
	env := map[string]string{"IMAGE": "nginx:alpine", "PORT": "8080"}
	got := substituteOne("img={{IMAGE}} port=${PORT} keep={{MISSING}} and ${MISSING} and $PLAIN", env)
	want := "img=nginx:alpine port=8080 keep={{MISSING}} and ${MISSING} and $PLAIN"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if out := substituteOne("no markers here", env); out != "no markers here" {
		t.Fatalf("marker-free string changed: %q", out)
	}
}

func TestNormalizeEnvScopes(t *testing.T) {
	if out := normalizeEnvScopes(nil); len(out) != 0 {
		t.Fatalf("nil must mean everywhere, got %v", out)
	}
	if out := normalizeEnvScopes([]any{"all"}); len(out) != 0 {
		t.Fatalf("'all' must mean everywhere, got %v", out)
	}
	if out := normalizeEnvScopes([]any{"Install", "bogus", "", "ACTIONS"}); !reflect.DeepEqual(sortedCopy(out), []string{"actions", "install"}) {
		t.Fatalf("subset must be lowercased + unknowns dropped, got %v", out)
	}
	full := []any{"install", "actions", "image", "controls", "pages", "advanced"}
	if out := normalizeEnvScopes(full); len(out) != 0 {
		t.Fatalf("full set must collapse to everywhere, got %v", out)
	}
}

func sortedCopy(in []string) []string {
	out := append([]string(nil), in...)
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func TestSubstituteEnvVarsScoped(t *testing.T) {
	cfg := map[string]any{
		"image":             "reg/app:{{IMAGE}}",
		"install":           []any{map[string]any{"action": "shell", "command": "echo ${TAG} {{IMAGE}}"}},
		"actions":           []any{map[string]any{"id": "run", "command": "run ${TAG}"}},
		"instance_controls": map[string]any{"more_page": "{{LANDING}}"},
		"home_page":         "${LANDING}",
		"pages":             []any{map[string]any{"slug": "home", "label": "{{LANDING}}"}},
		"advanced":          map[string]any{"startup_command": "run {{TAG}}"},
		"env":               map[string]any{"CHAIN": "{{TAG}}-x"},
	}
	env := map[string]string{"IMAGE": "nginx:alpine", "TAG": "v2", "LANDING": "overview"}
	scopes := map[string][]string{
		"IMAGE":   {"image"},
		"TAG":     {"install", "actions"},
		"LANDING": {"controls", "pages"},
	}
	substituteEnvVars(cfg, env, scopes)

	if cfg["image"] != "reg/app:nginx:alpine" {
		t.Fatalf("image not substituted: %v", cfg["image"])
	}
	install := cfg["install"].([]any)[0].(map[string]any)
	// TAG allowed in install; IMAGE is image-only so it must stay intact there.
	if install["command"] != "echo v2 {{IMAGE}}" {
		t.Fatalf("install scoping wrong: %v", install["command"])
	}
	actions := cfg["actions"].([]any)[0].(map[string]any)
	if actions["command"] != "run v2" {
		t.Fatalf("actions scoping wrong: %v", actions["command"])
	}
	controls := cfg["instance_controls"].(map[string]any)
	if controls["more_page"] != "overview" || cfg["home_page"] != "overview" {
		t.Fatalf("controls scoping wrong: %v %v", controls["more_page"], cfg["home_page"])
	}
	pages := cfg["pages"].([]any)[0].(map[string]any)
	if pages["label"] != "overview" {
		t.Fatalf("pages scoping wrong: %v", pages["label"])
	}
	advanced := cfg["advanced"].(map[string]any)
	// TAG is not advanced-scoped, so the startup command must keep its placeholder.
	if advanced["startup_command"] != "run {{TAG}}" {
		t.Fatalf("advanced must not substitute TAG: %v", advanced["startup_command"])
	}
	// Legacy env-map chaining keeps working.
	if cfg["env"].(map[string]any)["CHAIN"] != "v2-x" {
		t.Fatalf("env chaining broken: %v", cfg["env"])
	}
}

func TestSubstituteEnvVarsLegacyNilScopes(t *testing.T) {
	cfg := map[string]any{
		"image":    "{{IMAGE}}",
		"advanced": map[string]any{"startup_command": "run {{TAG}}"},
	}
	env := map[string]string{"IMAGE": "alpine:3.19", "TAG": "v1"}
	substituteEnvVars(cfg, env, nil)
	if cfg["image"] != "alpine:3.19" || cfg["advanced"].(map[string]any)["startup_command"] != "run v1" {
		t.Fatalf("nil scopes must substitute everywhere: %v", cfg)
	}
}

func TestFilterEnvForScope(t *testing.T) {
	env := map[string]string{"A": "1", "B": "2", "C": "3"}
	scopes := map[string][]string{"A": {"install"}, "B": {"actions", "install"}}
	got := filterEnvForScope(env, scopes, "install")
	if !reflect.DeepEqual(got, map[string]string{"A": "1", "B": "2", "C": "3"}) {
		t.Fatalf("install filter wrong: %v", got)
	}
	got = filterEnvForScope(env, scopes, "actions")
	if !reflect.DeepEqual(got, map[string]string{"B": "2", "C": "3"}) {
		t.Fatalf("actions filter wrong: %v", got)
	}
	// Unknown/extra vars always pass through.
	got = filterEnvForScope(env, scopes, "image")
	if !reflect.DeepEqual(got, map[string]string{"C": "3"}) {
		t.Fatalf("image filter wrong: %v", got)
	}
}

func TestValidateTemplateSpecScopes(t *testing.T) {
	env := func(scopes any) map[string]any {
		m := map[string]any{"name": "IMAGE", "default": "x"}
		if scopes != nil {
			m["scopes"] = scopes
		}
		return m
	}
	cases := []struct {
		name    string
		scopes  any
		wantErr bool
	}{
		{"missing", nil, false},
		{"subset", []any{"install", "actions"}, false},
		{"all-token", []any{"all"}, false},
		{"empty-array", []any{}, false},
		{"string-not-array", "install", true},
		{"unknown-scope", []any{"install", "bogus"}, true},
		{"non-string-entry", []any{"install", 42}, true},
	}
	for _, c := range cases {
		spec := map[string]any{"env": []any{env(c.scopes)}}
		err := validateTemplateSpec(spec)
		if c.wantErr && err == nil {
			t.Errorf("%s: expected error, got nil", c.name)
		}
		if !c.wantErr && err != nil {
			t.Errorf("%s: unexpected error: %v", c.name, err)
		}
	}
}
