package edgeconfig

import (
	"fmt"
	"testing"
)

func TestRoundTrip(t *testing.T) {
	in := map[string]any{
		"uuid":               "panel-local-7",
		"name":               `edge "tokyo" #1`,
		"panel_url":          "https://panel.example.com:5050",
		"token":              "kse_abc\"#def",
		"listen_port":        4040,
		"heartbeat_interval": 60,
		"use_tls_upstream":   true,
		"skip_verify":        false,
		"instances_dir":      "/var/lib/kspanel/instances",
		"connection_mode":    "reverse_tunnel",
	}
	raw, err := Encode(in)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	out, err := Decode(raw)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	// Generic-map decode widens numbers to int64 — compare by rendering.
	for k, want := range in {
		got, ok := out[k]
		if !ok {
			t.Fatalf("key %q missing after round-trip:\n%s", k, raw)
		}
		if fmt.Sprintf("%v", got) != fmt.Sprintf("%v", want) {
			t.Fatalf("key %q mismatch: %#v != %#v\n%s", k, got, want, raw)
		}
	}
}

func TestDecodeRejectsGarbage(t *testing.T) {
	if _, err := Decode([]byte("panel_url = [unclosed\n")); err == nil {
		t.Fatal("expected error for malformed TOML")
	}
}
