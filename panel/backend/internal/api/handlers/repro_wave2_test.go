package handlers

import (
	"encoding/json"
	"testing"
)

func TestReproTemplateEnvGaps(t *testing.T) {
	cases := []struct {
		name string
		spec string
		wantFail bool
	}{
		{"invalid env name with spaces", `{"env":[{"name":"foo bar"}]}`, true},
		{"invalid env name semicolon", `{"env":[{"name":"a;b"}]}`, true},
		{"duplicate env names", `{"env":[{"name":"FOO"},{"name":"FOO"}]}`, true},
		{"duplicate action ids", `{"actions":[{"id":"a","name":"A"},{"id":"a","name":"B"}]}`, true},
		{"empty env name rejected already", `{"env":[{"name":""}]}`, true},
	}
	for _, tc := range cases {
		var m map[string]any
		if err := json.Unmarshal([]byte(tc.spec), &m); err != nil {
			t.Fatalf("%s: unmarshal: %v", tc.name, err)
		}
		err := validateTemplateSpec(m)
		if tc.wantFail && err == nil {
			t.Errorf("GAP %s: validateTemplateSpec PASSED but should FAIL (spec=%s)", tc.name, tc.spec)
		} else if !tc.wantFail && err != nil {
			t.Errorf("%s: unexpected fail: %v", tc.name, err)
		} else if err != nil {
			t.Logf("OK %s: rejected: %v", tc.name, err)
		} else {
			t.Logf("OK %s: passed", tc.name)
		}
	}
}

func TestReproThemeDownloadSanitize(t *testing.T) {
	evil := "evil\"\nSet-Cookie: x=1"
	safe := sanitizeDownloadFilename(evil)
	t.Logf("sanitized %q -> %q", evil, safe)
	for _, r := range safe {
		if r == '"' || r == '\n' || r == '\r' {
			t.Errorf("GAP sanitize leaves header-breaking char %q in %q", r, safe)
		}
	}
	// theme_handler DownloadThemeHandler uses raw t.Name (no sanitize) -> GAP
}
