// Package edgeconfig owns the ksedge config.toml file format shared by the
// panel-side writers: the admin "Create & setup" handler and the
// setup:localnode CLI. Both must emit byte-compatible files for the edge's
// config.Load, so all encoding lives here instead of drifting across
// call sites. The edge itself decodes with the same key names.
package edgeconfig

import (
	"bytes"
	"fmt"

	"github.com/BurntSushi/toml"
)

// Encode serializes an edge config map to config.toml bytes. Keys sort
// alphabetically (toml encoder map order) — deterministic, and order is
// insignificant to the TOML decoder on the edge.
func Encode(cfg map[string]any) ([]byte, error) {
	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(cfg); err != nil {
		return nil, fmt.Errorf("encode edge config: %w", err)
	}
	return buf.Bytes(), nil
}

// Decode parses config.toml bytes back into a generic map. Used by the
// setup:localnode port-fallback path, which rewrites panel_url in a file
// the installer itself just wrote.
func Decode(data []byte) (map[string]any, error) {
	var cfg map[string]any
	if _, err := toml.Decode(string(data), &cfg); err != nil {
		return nil, fmt.Errorf("decode edge config: %w", err)
	}
	return cfg, nil
}
