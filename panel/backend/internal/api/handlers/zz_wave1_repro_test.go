package handlers

// TEMPORARY wave-1 repro. Deleted before the final diff.

import (
	"testing"
)

func TestReproFetchDotBypass(t *testing.T) {
	for _, src := range []string{
		`window.fetch('/api/users').then(function(r){})`,
		`self.fetch('/x')`,
		`globalThis.fetch('/x')`,
		`fetch('/api/users')`,
	} {
		if err := validateReactSource(src); err == nil {
			t.Errorf("BYPASS: %q passed validateReactSource (want rejection, must use sdk.fetchPanel)", src)
		}
	}
	// The sanctioned bridge must keep working.
	ok := `sdk.fetchPanel('/api/instances', {}).then(function(r){ return React.createElement('div', null, 'x'); })`
	if err := validateReactSource(ok); err != nil {
		t.Errorf("REGRESSION: sdk.fetchPanel rejected: %v", err)
	}
}

func TestReproProtoPollution(t *testing.T) {
	src := `function P(){ var o = {}; o.__proto__.polluted = 1; return React.createElement('div', null, 'x'); }`
	if err := validateReactSource(src); err == nil {
		t.Errorf("BYPASS: __proto__ payload passed validateReactSource (want rejection)")
	}
}

func TestReproSubBundleInjection(t *testing.T) {
	raw := `[{"path":"edit","name":"Editor","content_type":"html","content_html":"<div>hi</div>","bundle_js":"eval('evil'); window.fetch('/api/users')"}]`
	if err := validateSubPages(raw); err == nil {
		t.Errorf("BYPASS: sub-page bundle_js with eval/fetch passed validateSubPages (want rejection)")
	}
	// Build-stamped bundles (== validated source) must keep passing.
	rawOK := `[{"path":"edit","name":"Editor","content_type":"react","source_tsx":"function P(){return React.createElement('div',null,'x');}","bundle_js":"function P(){return React.createElement('div',null,'x');}"}]`
	if err := validateSubPages(rawOK); err != nil {
		t.Errorf("REGRESSION: build-stamped sub bundle rejected: %v", err)
	}
}

func TestReproExecAllowanceDivergence(t *testing.T) {
	// Both execute paths must now resolve through findSpecPageRow (exact slug,
	// original_slug, nested sub-page) — the single gate the SPA uses.
	specJSON := `{"pages":[{"slug":"console","original_slug":"terminal","enabled":true,"actions":[{"type":"shell","command":"uptime"}]}]}`
	row := findSpecPageRow(parseSpecRows(specJSON), "terminal")
	if row == nil {
		t.Errorf("REGRESSION: renamed builtin 'terminal' no longer resolves via findSpecPageRow")
	}
	if row != nil && !savedActionMatches(row.actions[0], "shell", "uptime", "", "", nil, nil) {
		t.Errorf("REGRESSION: spec-row saved action no longer matches")
	}
}
