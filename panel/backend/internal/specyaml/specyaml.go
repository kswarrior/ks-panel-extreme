package specyaml

import (
	"encoding/json"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// Parse decodes a template spec stored as YAML or JSON into a normalized
// map. YAML is a superset of JSON, so old JSON rows parse unchanged; the
// result is normalized through a JSON round-trip so downstream code only
// ever sees JSON types (numbers are float64, keys are strings) regardless
// of which syntax the author used.
//
// Empty / whitespace-only input yields an empty map and no error, matching
// the historical "{}" default.
func Parse(s string) (map[string]any, error) {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" || trimmed == "{}" || trimmed == "{}\n" {
		return map[string]any{}, nil
	}
	var doc any
	if err := yaml.Unmarshal([]byte(s), &doc); err != nil {
		return nil, fmt.Errorf("spec must be valid YAML/JSON: %s", err.Error())
	}
	if doc == nil {
		return map[string]any{}, nil
	}
	normalised, err := json.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("spec must be valid YAML/JSON: %s", err.Error())
	}
	var out map[string]any
	if err := json.Unmarshal(normalised, &out); err != nil {
		return nil, fmt.Errorf("spec must be a YAML/JSON object: %s", err.Error())
	}
	if out == nil {
		return map[string]any{}, nil
	}
	return out, nil
}

// Unmarshal decodes a YAML-or-JSON spec string into out (usually a struct
// with `json` tags). It goes through Parse + a JSON round-trip so `json`
// tags keep working — yaml.v3 alone would ignore them.
func Unmarshal(s string, out any) error {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return fmt.Errorf("spec must be valid YAML/JSON: empty document")
	}
	m, err := Parse(s)
	if err != nil {
		return err
	}
	b, err := json.Marshal(m)
	if err != nil {
		return fmt.Errorf("spec must be valid YAML/JSON: %s", err.Error())
	}
	if err := json.Unmarshal(b, out); err != nil {
		return fmt.Errorf("spec must be valid YAML/JSON: %s", err.Error())
	}
	return nil
}

// Marshal encodes a spec map/ struct as canonical YAML for storage.
// An empty/nil input yields "{}\n" (the YAML empty-object form) so NOT NULL
// DEFAULT '{}' columns and old "{}" readers keep working.
func Marshal(v any) (string, error) {
	if v == nil {
		return "{}\n", nil
	}
	if m, ok := v.(map[string]any); ok && len(m) == 0 {
		return "{}\n", nil
	}
	b, err := yaml.Marshal(v)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(string(b)) == "" || strings.TrimSpace(string(b)) == "null" {
		return "{}\n", nil
	}
	return string(b), nil
}

// MustMarshal is Marshal that falls back to "{}\n" on error. Use it on
// store paths where a marshal failure must never fail a deploy (the map
// came from an already-validated spec).
func MustMarshal(v any) string {
	s, err := Marshal(v)
	if err != nil || strings.TrimSpace(s) == "" {
		return "{}\n"
	}
	return s
}

// IsJSON reports whether s looks like a JSON document (object/array
// opener after trimming). Used by the JSON→YAML auto-migrator to find
// rows that still carry the legacy encoding. JSON is valid YAML, so
// this is only a formatting heuristic, never a validity check.
func IsJSON(s string) bool {
	t := strings.TrimSpace(s)
	return strings.HasPrefix(t, "{") || strings.HasPrefix(t, "[")
}

// NormalizeToYAML parses s (YAML or JSON) and re-emits canonical YAML.
// It is the single migration primitive: old JSON rows become YAML
// without semantic change; already-YAML rows round-trip to canonical
// form (idempotent when already canonical).
func NormalizeToYAML(s string) (string, error) {
	if strings.TrimSpace(s) == "" {
		return "{}\n", nil
	}
	m, err := Parse(s)
	if err != nil {
		return "", err
	}
	return Marshal(m)
}
