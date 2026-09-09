// Package edgeconfig owns the ksedge config.yaml file format shared by the
// panel-side writers: the admin "Create & setup" handler and the
// setup:localnode CLI. Both must emit byte-compatible files for the edge's
// config.Load, so all encoding lives here instead of drifting across
// call sites. The edge itself decodes with the same key names.
package edgeconfig

import (
	"fmt"

	"gopkg.in/yaml.v3"
)

// Encode serializes an edge config map to config.yaml bytes. Keys sort
// alphabetically (yaml.v3 map order) — deterministic, and order is
// insignificant to the YAML decoder on the edge.
func Encode(cfg map[string]any) ([]byte, error) {
	raw, err := yaml.Marshal(cfg)
	if err != nil {
		return nil, fmt.Errorf("encode edge config: %w", err)
	}
	return raw, nil
}

// Decode parses config.yaml bytes back into a generic map. Used by the
// setup:localnode port-fallback path, which rewrites panel_url in a file
// the installer itself just wrote.
func Decode(data []byte) (map[string]any, error) {
	var cfg map[string]any
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("decode edge config: %w", err)
	}
	return cfg, nil
}
