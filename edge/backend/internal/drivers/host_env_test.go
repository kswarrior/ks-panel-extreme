package drivers

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIsValidHostEnvName(t *testing.T) {
	valid := []string{"FOO", "_a", "A1"}
	for _, k := range valid {
		if !isValidHostEnvName(k) {
			t.Fatalf("isValidHostEnvName(%q) = false, want true", k)
		}
	}
	hostile := []string{
		"BAD\ntouch /tmp/pwned\n#",
		"C; rm -rf /",
		"A=B",
		"",
		"1ABC",
		"has space",
	}
	for _, k := range hostile {
		if isValidHostEnvName(k) {
			t.Fatalf("isValidHostEnvName(%q) = true, want false", k)
		}
	}
}

func TestWriteHostRunScriptSkipsHostileEnvKeys(t *testing.T) {
	dir := t.TempDir()
	env := map[string]string{
		"FOO":                    "bar",
		"_a":                     "1",
		"A1":                     "2",
		"BAD\ntouch /tmp/pwned\n#": "evil",
		"C; rm -rf /":             "evil",
		"A=B":                    "evil",
		"":                       "evil",
		"1ABC":                   "evil",
		"has space":              "evil",
	}
	if err := writeHostRunScript(dir, "true", env); err != nil {
		t.Fatalf("writeHostRunScript: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "run.sh"))
	if err != nil {
		t.Fatalf("read run.sh: %v", err)
	}
	script := string(raw)
	for _, k := range []string{"FOO", "_a", "A1"} {
		line := "export " + k + "=" + shellEscapeEnv(env[k])
		if !strings.Contains(script, line) {
			t.Fatalf("run.sh missing %q in:\n%s", line, script)
		}
	}
	for _, line := range strings.Split(script, "\n") {
		if !strings.HasPrefix(line, "export ") {
			continue
		}
		for _, bad := range []string{"touch /tmp/pwned", "rm -rf", "has space", "1ABC", "A=B", "C;"} {
			if strings.Contains(line, bad) {
				t.Fatalf("export line contains hostile %q: %q", bad, line)
			}
		}
	}
	if strings.Contains(script, "touch /tmp/pwned") {
		t.Fatalf("run.sh contains injected payload:\n%s", script)
	}
}

func TestFlattenHostEnvSkipsHostileKeys(t *testing.T) {
	env := map[string]string{
		"FOO":                    "bar",
		"_a":                     "1",
		"A1":                     "2",
		"BAD\ntouch /tmp/pwned\n#": "evil",
		"C; rm -rf /":             "evil",
		"A=B":                    "evil",
		"":                       "evil",
		"1ABC":                   "evil",
		"has space":              "evil",
	}
	flat := flattenHostEnv(env)
	got := map[string]bool{}
	for _, kv := range flat {
		got[kv] = true
	}
	for _, k := range []string{"FOO", "_a", "A1"} {
		if !got[k+"="+env[k]] {
			t.Fatalf("flattenHostEnv missing %q (got %v)", k, flat)
		}
	}
	for _, kv := range flat {
		for _, bad := range []string{"touch /tmp/pwned", "rm -rf", "has space", "1ABC", "A=B", "C;"} {
			if strings.Contains(kv, bad) {
				t.Fatalf("flattenHostEnv contains hostile %q: %q", bad, kv)
			}
		}
		if strings.HasPrefix(kv, "=") {
			t.Fatalf("flattenHostEnv contains empty key entry: %q", kv)
		}
	}
}
