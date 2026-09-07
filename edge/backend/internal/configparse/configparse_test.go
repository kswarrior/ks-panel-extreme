package configparse

import (
	"strings"
	"testing"
)

func TestEdgeApplyAllParsers(t *testing.T) {
	cases := []struct {
		parser  string
		content string
		find    map[string]any
		want    string
	}{
		{"properties", "a=1\n", map[string]any{"a": "2"}, "a=2"},
		{"json", `{"a":1}`, map[string]any{"a": "2"}, `"a": 2`},
		{"yaml", "a: 1\n", map[string]any{"a": "2"}, "a:"},
		{"ini", "[s]\na=1\n", map[string]any{"s.a": "2"}, "a = 2"},
		{"toml", "a=1\n", map[string]any{"a": "2"}, "a = 2"},
		{"file", "port 1\n", map[string]any{"port": "2"}, "port 2"},
		{"xml", `<r><a>1</a></r>`, map[string]any{"a": "2"}, ">2<"},
	}
	for _, c := range cases {
		out, changed, err := ApplyConfigContent(c.parser, c.content, c.find)
		if err != nil {
			t.Fatalf("%s: %v", c.parser, err)
		}
		if !changed || !strings.Contains(out, c.want) {
			t.Fatalf("%s: want %q in %q", c.parser, c.want, out)
		}
	}
}

func TestEdgeValidatePath(t *testing.T) {
	if err := validateConfigFilePath("../x"); err == nil {
		t.Fatal("traversal must fail")
	}
	if err := validateConfigFilePath("/abs"); err == nil {
		t.Fatal("absolute must fail")
	}
	if err := validateConfigFilePath("server.properties"); err != nil {
		t.Fatalf("valid path rejected: %v", err)
	}
}
