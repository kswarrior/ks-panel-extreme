package api

import "testing"

func TestMainAuditStaticAssetGuard(t *testing.T) {
	if isStaticAsset("/api/themes/abc.js") {
		t.Fatalf("BUG-REPRO: /api/*.js treated as static asset (WAF/rate-limit bypass)")
	}
	if !isStaticAsset("/assets/app-abc.js") {
		t.Fatalf("REGRESSION: real SPA bundle no longer treated as asset")
	}
	if isCSRFStaticAsset("/api/themes/abc.js") {
		t.Fatalf("BUG-REPRO: CSRF helper still matches /api/*.js")
	}
	t.Logf("OK: /api/ jailed, bundles unaffected")
}
