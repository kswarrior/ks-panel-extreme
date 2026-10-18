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

// TestValidateSettings covers the v2 settings-schema gate: key shape +
// uniqueness, type vocabulary, select options, defaults vs their own type and
// the count cap. A schema that passes here is what the settings API + the
// ks.settings binding enforce writes against.
func TestValidateSettings(t *testing.T) {
	valid := []ModManifestV2{
		{},
		{Settings: []ModSettingDefinition{
			{Key: "api_key", Type: "password", Label: "API key"},
			{Key: "region", Type: "select", Options: []string{"eu", "us"}, Default: "eu"},
			{Key: "retries", Type: "number", Default: "3"},
			{Key: "enabled", Type: "toggle", Default: "true"},
			{Key: "greeting", Type: "text"},
		}},
	}
	for _, m := range valid {
		if err := ValidateSettings(m); err != nil {
			t.Errorf("ValidateSettings(%+v) = %v, want nil", m.Settings, err)
		}
	}

	invalid := []struct {
		name string
		def  ModSettingDefinition
	}{
		{"uppercase key", ModSettingDefinition{Key: "API_KEY", Type: "text"}},
		{"dash in key", ModSettingDefinition{Key: "api-key", Type: "text"}},
		{"empty key", ModSettingDefinition{Key: "", Type: "text"}},
		{"key too long", ModSettingDefinition{Key: strings.Repeat("a", 65), Type: "text"}},
		{"unknown type", ModSettingDefinition{Key: "k", Type: "date"}},
		{"select without options", ModSettingDefinition{Key: "k", Type: "select"}},
		{"select empty option", ModSettingDefinition{Key: "k", Type: "select", Options: []string{""}}},
		{"select duplicate option", ModSettingDefinition{Key: "k", Type: "select", Options: []string{"a", "a"}}},
		{"options on text", ModSettingDefinition{Key: "k", Type: "text", Options: []string{"a"}}},
		{"bad number default", ModSettingDefinition{Key: "k", Type: "number", Default: "abc"}},
		{"bad toggle default", ModSettingDefinition{Key: "k", Type: "toggle", Default: "yes"}},
		{"select default not in options", ModSettingDefinition{Key: "k", Type: "select", Options: []string{"a"}, Default: "b"}},
		{"password default", ModSettingDefinition{Key: "k", Type: "password", Default: "hunter2"}},
		{"label too long", ModSettingDefinition{Key: "k", Type: "text", Label: strings.Repeat("l", 129)}},
		{"description too long", ModSettingDefinition{Key: "k", Type: "text", Description: strings.Repeat("d", 513)}},
	}
	for _, tc := range invalid {
		if err := ValidateSettings(ModManifestV2{Settings: []ModSettingDefinition{tc.def}}); err == nil {
			t.Errorf("%s: expected rejection for %+v", tc.name, tc.def)
		}
	}

	if err := ValidateSettings(ModManifestV2{Settings: []ModSettingDefinition{
		{Key: "dup", Type: "text"}, {Key: "dup", Type: "text"},
	}}); err == nil {
		t.Error("duplicate keys: expected rejection")
	}

	tooMany := make([]ModSettingDefinition, MaxSettingsPerMod+1)
	for i := range tooMany {
		tooMany[i] = ModSettingDefinition{Key: "k" + string(rune('a'+i%26)) + string(rune('a'+(i/26)%26)), Type: "text"}
	}
	if err := ValidateSettings(ModManifestV2{Settings: tooMany}); err == nil {
		t.Errorf("expected rejection above the %d-setting cap", MaxSettingsPerMod)
	}
}

// TestValidateSettingValue covers per-value type checks shared by the PUT
// endpoint and the sandbox binding.
func TestValidateSettingValue(t *testing.T) {
	sel := ModSettingDefinition{Key: "s", Type: "select", Options: []string{"eu", "us"}}
	cases := []struct {
		def   ModSettingDefinition
		value string
		ok    bool
	}{
		{ModSettingDefinition{Type: "text"}, "anything at all", true},
		{ModSettingDefinition{Type: "password"}, "s3cret!", true},
		{ModSettingDefinition{Type: "number"}, "3.5", true},
		{ModSettingDefinition{Type: "number"}, "-2", true},
		{ModSettingDefinition{Type: "number"}, "abc", false},
		{ModSettingDefinition{Type: "toggle"}, "true", true},
		{ModSettingDefinition{Type: "toggle"}, "false", true},
		{ModSettingDefinition{Type: "toggle"}, "1", false},
		{sel, "eu", true},
		{sel, "apac", false},
		{ModSettingDefinition{Type: "text"}, strings.Repeat("x", MaxModSettingValueBytes+1), false},
	}
	for _, tc := range cases {
		err := ValidateSettingValue(tc.def, tc.value)
		if (err == nil) != tc.ok {
			t.Errorf("ValidateSettingValue(%+v, %q) = %v, want ok=%v", tc.def, tc.value, err, tc.ok)
		}
	}
}
