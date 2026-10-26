package models

import (
	"errors"
	"strings"
	"testing"
)

func manifestOpts() ManifestValidationOptions {
	return ManifestValidationOptions{
		PanelVersion:    "1.2.3",
		EngineVersion:   CurrentEngineVersion,
		SDKVersion:      CurrentSDKVersion,
		RequireIdentity: true,
	}
}

func TestValidateManifestKeepsV1AndV2Working(t *testing.T) {
	v1 := []byte(`{"name":"Legacy","slug":"legacy","version":"1.0.0"}`)
	if _, err := ValidateManifest(v1, manifestOpts()); err != nil {
		t.Fatalf("v1 manifest rejected: %v", err)
	}
	v2 := []byte(`{"name":"V2","slug":"v2","version":"1.0.0","engineVersion":2,"settings":[{"key":"enabled","type":"toggle"}]}`)
	if _, err := ValidateManifest(v2, manifestOpts()); err != nil {
		t.Fatalf("v2 manifest rejected: %v", err)
	}
}

func TestValidateManifestRequiresAPIV3ForNewFields(t *testing.T) {
	raw := []byte(`{"name":"Old","slug":"old","version":"1.0.0","engineVersion":2,"requires":{"dep":"^1.0.0"}}`)
	if _, err := ValidateManifest(raw, manifestOpts()); err == nil || !strings.Contains(err.Error(), "apiVersion 3") {
		t.Fatalf("expected apiVersion 3 gate, got %v", err)
	}
	v3 := []byte(`{"name":"New","slug":"new","version":"1.0.0","apiVersion":3,"requires":{"dep":"^1.0.0"},"provides":["slot:new"],"publisher":"Acme","tags":["tools"]}`)
	if _, err := ValidateManifest(v3, manifestOpts()); err != nil {
		t.Fatalf("v3 manifest rejected: %v", err)
	}
	// engineVersion: 3 is the documented shorthand for apiVersion 3.
	shorthand := []byte(`{"name":"Short","slug":"short","version":"1.0.0","engineVersion":3,"requires":{"dep":"*"}}`)
	if _, err := ValidateManifest(shorthand, manifestOpts()); err != nil {
		t.Fatalf("engineVersion 3 shorthand rejected: %v", err)
	}
}

func TestValidateManifestDependencies(t *testing.T) {
	base := `"name":"Dep","slug":"dep","version":"1.0.0","apiVersion":3`
	valid := []string{
		`{` + base + `,"requires":{"other":"^1.2.3"}}`,
		`{` + base + `,"requires":{"mods":{"other":">=1.0.0"},"panel":">=1.0.0","engine":">=2","sdk":"*"}}`,
		`{` + base + `,"requires":{}}`,
	}
	for _, raw := range valid {
		if _, err := ValidateManifest([]byte(raw), manifestOpts()); err != nil {
			t.Errorf("valid requires rejected: %v (%s)", err, raw)
		}
	}
	invalid := []string{
		`{` + base + `,"requires":{"dep":"*"}}`,
		`{` + base + `,"requires":{"BAD SLUG":"*"}}`,
		`{` + base + `,"requires":{"other":"nope"}}`,
		`{` + base + `,"requires":{"other":123}}`,
		`{` + base + `,"requires":{"mods":{"other":"*"},"typo":"*"}}`,
	}
	for _, raw := range invalid {
		if _, err := ValidateManifest([]byte(raw), manifestOpts()); err == nil {
			t.Errorf("invalid requires accepted: %s", raw)
		}
	}
}

func TestValidateManifestCompatibility(t *testing.T) {
	base := `{"name":"Compat","slug":"compat","version":"1.0.0","apiVersion":3`
	if _, err := ValidateManifest([]byte(base+`,"requires":{"panel":">=1.0.0"}}`), manifestOpts()); err != nil {
		t.Fatalf("compatible panel rejected: %v", err)
	}
	_, err := ValidateManifest([]byte(base+`,"requires":{"panel":">=9.0.0"}}`), manifestOpts())
	var incompat *IncompatibilityError
	if !errors.As(err, &incompat) || incompat.Component != "panel" {
		t.Fatalf("expected panel incompatibility, got %v", err)
	}
	_, err = ValidateManifest([]byte(base+`,"requires":{"engine":">=3"}}`), manifestOpts())
	if !errors.As(err, &incompat) || incompat.Component != "engine" {
		t.Fatalf("expected engine incompatibility, got %v", err)
	}
	_, err = ValidateManifest([]byte(base+`,"requires":{"sdk":">=2"}}`), manifestOpts())
	if !errors.As(err, &incompat) || incompat.Component != "sdk" {
		t.Fatalf("expected sdk incompatibility, got %v", err)
	}
}

func TestValidateManifestProvidesConflicts(t *testing.T) {
	base := `{"name":"Owner","slug":"owner","version":"1.0.0","apiVersion":3`
	valid := []string{
		base + `,"provides":["slot:instance.detail.tabs","component:widget","page:/reports"]}`,
		base + `,"conflicts":["other-mod","slot:other"]}`,
	}
	for _, raw := range valid {
		if _, err := ValidateManifest([]byte(raw), manifestOpts()); err != nil {
			t.Errorf("valid ownership rejected: %v (%s)", err, raw)
		}
	}
	invalid := []string{
		base + `,"provides":["slot:one","slot:one"]}`,
		base + `,"provides":["UPPER"]}`,
		base + `,"conflicts":["owner"]}`,
		base + `,"provides":["slot:one"],"conflicts":["slot:one"]}`,
		base + `,"conflicts":["slot:one","slot:one"]}`,
	}
	for _, raw := range invalid {
		if _, err := ValidateManifest([]byte(raw), manifestOpts()); err == nil {
			t.Errorf("invalid ownership accepted: %s", raw)
		}
	}
}

func TestModRequiresUnmarshalBothForms(t *testing.T) {
	var flat ModRequires
	if err := flat.UnmarshalJSON([]byte(`{"a":"^1.0.0","b":"*"}`)); err != nil {
		t.Fatalf("flat form: %v", err)
	}
	if flat.Mods["a"] != "^1.0.0" || flat.Mods["b"] != "*" {
		t.Fatalf("flat form parsed wrong: %+v", flat)
	}
	var structured ModRequires
	if err := structured.UnmarshalJSON([]byte(`{"mods":{"a":">=1"},"panel":">=1.1","engine":">=2","sdk":"*"}`)); err != nil {
		t.Fatalf("structured form: %v", err)
	}
	if structured.Mods["a"] != ">=1" || structured.Panel != ">=1.1" || structured.Engine != ">=2" || structured.SDK != "*" {
		t.Fatalf("structured form parsed wrong: %+v", structured)
	}
	if err := structured.UnmarshalJSON([]byte(`{"unknown":"*"}`)); err != nil {
		// Unknown keys in the flat form are dependency slugs, not an error.
		t.Fatalf("flat unknown key: %v", err)
	}
	if err := structured.UnmarshalJSON([]byte(`{"mods":{},"typo":"*"}`)); err == nil {
		t.Fatal("structured unknown key should be rejected")
	}
}
