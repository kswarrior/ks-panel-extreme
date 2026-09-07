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

func TestParseDotEnv(t *testing.T) {
	got, err := parseDotEnv("# comment\n\nexport APP_ENV=production\nDB_URL=postgres://db:5432/app\nQUOTED=\"a b\"\nSINGLE='x y'\nEMPTY=\nTRAILING=value # stripped\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]string{
		"APP_ENV": "production", "DB_URL": "postgres://db:5432/app",
		"QUOTED": "a b", "SINGLE": "x y", "EMPTY": "", "TRAILING": "value",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for _, bad := range []string{"NOEQUALS\n", "1BAD=x\n", "BAD NAME=x\n"} {
		if _, err := parseDotEnv(bad); err == nil {
			t.Errorf("expected error for %q", bad)
		}
	}
}

func TestResolveEnvWithFile(t *testing.T) {
	finalEnv := map[string]string{"TAG": "v2", "APP_ENV": "explicit-wins"}
	merged, err := resolveEnvWithFile("TAG={{TAG}}\nFROM_FILE=yes\nAPP_ENV=file-loses\n", finalEnv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := map[string]string{"TAG": "v2", "APP_ENV": "explicit-wins", "FROM_FILE": "yes"}
	if !reflect.DeepEqual(merged, want) {
		t.Fatalf("got %v want %v", merged, want)
	}
	if _, err := resolveEnvWithFile("BROKEN LINE\n", finalEnv); err == nil {
		t.Fatalf("expected error for malformed file")
	}
}

func TestValidateTemplateSpecEnvFile(t *testing.T) {
	if err := validateTemplateSpec(map[string]any{"env_file": "A=1\nB={{TAG}}\n"}); err != nil {
		t.Fatalf("valid env_file rejected: %v", err)
	}
	if err := validateTemplateSpec(map[string]any{"env_file": "NOEQUALS\n"}); err == nil {
		t.Fatalf("malformed env_file accepted")
	}
	if err := validateTemplateSpec(map[string]any{"env_file": 42}); err == nil {
		t.Fatalf("non-string env_file accepted")
	}
}

func TestValidateTemplateSpecEnvOptions(t *testing.T) {
	opt := func(m map[string]any) map[string]any {
		base := map[string]any{"name": "JAVA", "display": "select", "options_list": []any{m}}
		return map[string]any{"env": []any{base}}
	}
	if err := validateTemplateSpec(opt(map[string]any{
		"svg": "<svg></svg>", "label": "Temurin 21", "value": "21",
	})); err != nil {
		t.Fatalf("valid options row rejected: %v", err)
	}
	if err := validateTemplateSpec(opt(map[string]any{"label": "no value"})); err == nil {
		t.Fatalf("value-less option accepted")
	}
	if err := validateTemplateSpec(opt(map[string]any{"value": "x", "svg": "<ScRiPt>alert(1)</ScRiPt>"})); err == nil {
		t.Fatalf("script svg accepted")
	}
	if err := validateTemplateSpec(map[string]any{"env": []any{map[string]any{"name": "X", "options_list": "nope"}}}); err == nil {
		t.Fatalf("non-array options_list accepted")
	}
	many := make([]any, 0, 51)
	for i := 0; i < 51; i++ {
		many = append(many, map[string]any{"value": "v"})
	}
	if err := validateTemplateSpec(map[string]any{"env": []any{map[string]any{"name": "X", "options_list": many}}}); err == nil {
		t.Fatalf("oversized options_list accepted")
	}
}

func TestValidateTemplateSpecEnvCheckboxValues(t *testing.T) {
	withVals := func(extra map[string]any) map[string]any {
		base := map[string]any{"name": "FEAT", "display": "checkbox"}
		for k, v := range extra {
			base[k] = v
		}
		return map[string]any{"env": []any{base}}
	}
	if err := validateTemplateSpec(withVals(map[string]any{"checked_value": "--enable", "unchecked_value": ""})); err != nil {
		t.Fatalf("valid checkbox values rejected: %v", err)
	}
	if err := validateTemplateSpec(withVals(map[string]any{"checked_value": 7})); err == nil {
		t.Fatalf("non-string checked_value accepted")
	}
	if err := validateTemplateSpec(withVals(map[string]any{"unchecked_value": "a\nb"})); err == nil {
		t.Fatalf("newline unchecked_value accepted")
	}
}
