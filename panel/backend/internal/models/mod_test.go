package models

import (
	"strings"
	"testing"
)

func TestEffectiveUIBundlePath(t *testing.T) {
	if got := (ModManifestV2{}).EffectiveUIBundlePath(); got != DefaultUIBundlePath {
		t.Fatalf("default path: got %q, want %q", got, DefaultUIBundlePath)
	}
	if got := (ModManifestV2{UIBundle: "  ui/main.js  "}).EffectiveUIBundlePath(); got != "ui/main.js" {
		t.Fatalf("custom path: got %q, want %q", got, "ui/main.js")
	}
}

func TestValidateUIBundle(t *testing.T) {
	valid := []ModManifestV2{
		{},
		{UIBundle: "frontend/bundle.js"},
		{UIBundle: "ui/nested/main.js", UIBundleSource: "var x = 1;"},
		{UIBundleSource: strings.Repeat("a", MaxUIBundleSourceBytes)},
	}
	for _, m := range valid {
		if err := ValidateUIBundle(m); err != nil {
			t.Errorf("ValidateUIBundle(%+v) = %v, want nil", m, err)
		}
	}

	invalid := []ModManifestV2{
		{UIBundle: "../evil.js"},
		{UIBundle: ".."},
		{UIBundle: "/etc/passwd"},
		{UIBundle: "a/../../b.js"},
		{UIBundle: "a/./b.js"},
		{UIBundle: `a\b.js`},
		{UIBundle: "a\x00b.js"},
		{UIBundle: strings.Repeat("a", 257)},
		{UIBundleSource: strings.Repeat("a", MaxUIBundleSourceBytes+1)},
	}
	for _, m := range invalid {
		if err := ValidateUIBundle(m); err == nil {
			t.Errorf("ValidateUIBundle(%+v) = nil, want error", m)
		}
	}
}
