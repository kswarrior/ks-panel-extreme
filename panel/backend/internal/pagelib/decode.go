package pagelib

import (
	"bytes"
	"encoding/json"
	"fmt"

	"gopkg.in/yaml.v3"
)

// stringifiedListFields are page keys the DB/API carry as JSON-encoded
// STRINGS but the YAML authoring format expresses as native lists. They are
// re-encoded to JSON strings here so every downstream consumer (validation,
// persistence, Studio export) keeps seeing the exact wire shape it does for
// legacy *.json library files.
var stringifiedListFields = []string{
	"actions",
	"sub_pages",
	"components",
	"configure",
	"content_blocks",
}

// NormalizePageBytes converts a raw instance-page file to the canonical JSON
// encoding every import path understands. Legacy *.json files pass through
// untouched (fast path, byte-identical); *.yaml/*.yml authoring files are
// parsed and re-encoded, with native lists for the stringifiedListFields
// folded back to JSON strings. An error is returned when the input is
// neither valid JSON nor a YAML mapping.
func NormalizePageBytes(data []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("empty page file")
	}
	if trimmed[0] == '{' {
		var obj map[string]any
		if err := json.Unmarshal(data, &obj); err != nil {
			return nil, fmt.Errorf("invalid JSON page: %w", err)
		}
		if obj == nil {
			return nil, fmt.Errorf("page must be a JSON object")
		}
		return data, nil
	}
	var doc any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("invalid page file (not JSON or YAML): %w", err)
	}
	obj, ok := doc.(map[string]any)
	if !ok || obj == nil {
		return nil, fmt.Errorf("page must be a mapping of page fields")
	}
	for _, key := range stringifiedListFields {
		v, present := obj[key]
		if !present || v == nil {
			continue
		}
		if _, isString := v.(string); isString {
			continue
		}
		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("page field %q is not encodable: %w", key, err)
		}
		obj[key] = string(encoded)
	}
	out, err := json.Marshal(obj)
	if err != nil {
		return nil, fmt.Errorf("page is not encodable as JSON: %w", err)
	}
	return out, nil
}
