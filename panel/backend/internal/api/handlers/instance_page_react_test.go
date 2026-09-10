package handlers

import (
	"strings"
	"testing"
)

// ---- validateReactSource ----------------------------------------------------

func TestValidateReactSourceAllowsPlainCreateElement(t *testing.T) {
	src := `function Page(sdk) {
  return React.createElement('div', {className: 'ks-page'},
    React.createElement('button', {onClick: function() { sdk.runAction('ping'); }}, 'Ping'));
}`
	if err := validateReactSource(src); err != nil {
		t.Fatalf("expected plain React source to pass, got %v", err)
	}
}

func TestValidateReactSourceRejectsHostEscapes(t *testing.T) {
	for _, src := range []string{
		`eval("evil")`,
		`var f = new Function("x", "return x")`,
		`fetch("/api/users").then()`,
		`var x = new XMLHttpRequest()`,
		`document.cookie`,
		`localStorage.getItem("k")`,
		`require("fs")`,
		`import x from "axios"`,
	} {
		if err := validateReactSource(src); err == nil {
			t.Fatalf("expected rejection for %q", src)
		}
	}
}

func TestValidateReactSourceRejectsOversize(t *testing.T) {
	src := strings.Repeat("x", maxInstancePageReactSourceBytes+1)
	if err := validateReactSource(src); err == nil {
		t.Fatal("expected oversize source to fail")
	}
}

// ---- validateInstancePage react gate ---------------------------------------

func TestValidateInstancePageReactRequiresSource(t *testing.T) {
	req := instancePageDTO{Name: "R", Slug: "r-page", Kind: "custom", ContentType: "react"}
	if _, err := validateInstancePage(req); err == nil {
		t.Fatal("expected react page without source_tsx to fail")
	}
	req.SourceTSX = `function Page() { return React.createElement('div', null, 'hi'); }`
	if _, err := validateInstancePage(req); err != nil {
		t.Fatalf("expected react page with source to pass, got %v", err)
	}
}

func TestValidateInstancePageAcceptsReactContentType(t *testing.T) {
	if !validContentTypes["react"] {
		t.Fatal("validContentTypes must include react")
	}
}
