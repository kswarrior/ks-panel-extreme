package handlers

// TEMPORARY wave-1 repro. Deleted before the final diff.

import (
	"encoding/json"
	"testing"
)

func TestReproFetchDotBypass(t *testing.T) {
	for _, src := range []string{
		`window.fetch('/api/users').then(function(r){})`,
		`self.fetch('/x')`,
		`globalThis.fetch('/x')`,
	} {
		if err := validateReactSource(src); err == nil {
			t.Errorf("BYPASS: %q passed validateReactSource (want rejection, must use sdk.fetchPanel)", src)
		}
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
}

func TestReproExecAllowanceDivergence(t *testing.T) {
	specJSON := `{"pages":[{"slug":"console","original_slug":"terminal","enabled":true,"actions":[{"type":"shell","command":"uptime"}]}]}`
	var spec map[string]any
	if err := json.Unmarshal([]byte(specJSON), &spec); err != nil {
		t.Fatal(err)
	}
	// What ExecutePageActionHandler (/:id/actions) uses: exact-slug list.
	allowed := false
	for _, p := range getEnabledPages(spec) {
		if p == "terminal" {
			allowed = true
		}
	}
	// What the SPA + ExecuteCustomPageActionHandler use: slug/original/sub.
	row := findSpecPageRow(parseSpecRows(specJSON), "terminal")
	t.Logf("getEnabledPages=%v row==nil:%v", getEnabledPages(spec), row == nil)
	if row != nil && !allowed {
		t.Errorf("DIVERGENCE: findSpecPageRow allows 'terminal' (renamed builtin) but getEnabledPages denies it, so POST /:id/actions 403s a page the SPA renders")
	}
}
