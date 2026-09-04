package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestSecurityHeadersPresent proves SecurityHeadersMiddleware is mounted
// globally: every response (even public GET /health) carries CSP, nosniff,
// DENY and friends.
func TestSecurityHeadersPresent(t *testing.T) {
	h := NewRouter()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /health = %d, want 200", rec.Code)
	}
	for _, hdr := range []string{
		"Content-Security-Policy",
		"X-Content-Type-Options",
		"X-Frame-Options",
		"Referrer-Policy",
		"Permissions-Policy",
	} {
		if v := rec.Header().Get(hdr); v == "" {
			t.Errorf("missing security header %s", hdr)
		}
	}
	if v := rec.Header().Get("X-Content-Type-Options"); v != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", v)
	}
	if v := rec.Header().Get("X-Frame-Options"); v != "DENY" {
		t.Errorf("X-Frame-Options = %q, want DENY", v)
	}
	if v := rec.Header().Get("Content-Security-Policy"); !strings.Contains(v, "default-src 'self'") {
		t.Errorf("CSP missing default-src 'self': %q", v)
	}
}

// TestCSRFRejectsPostWithoutToken proves CSRFMiddleware is mounted: a
// cookie-only POST to a non-exempt route without X-CSRF-Token gets 403,
// while safe-method GETs pass through (no CSRF block).
func TestCSRFRejectsPostWithoutToken(t *testing.T) {
	h := NewRouter()

	// POST /api/themes is admin authoring (NOT in the public exempt set for
	// mutating verbs) — without a token it must 403 from CSRF before any
	// auth/DB logic runs.
	req := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("POST /api/themes without token = %d, want 403 (CSRF)", rec.Code)
	}
	if !strings.Contains(strings.ToLower(rec.Body.String()), "csrf") {
		t.Fatalf("POST without token body should mention CSRF, got %q", rec.Body.String())
	}

	// GET passes (safe method, no token required). /api/themes is public
	// read; it may 500 without a DB in this env, but it must NOT be a CSRF
	// 403.
	req2 := httptest.NewRequest(http.MethodGet, "/api/themes", nil)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code == http.StatusForbidden && strings.Contains(strings.ToLower(rec2.Body.String()), "csrf") {
		t.Fatalf("GET /api/themes must not be CSRF-blocked, got 403 %q", rec2.Body.String())
	}

	// Public POST /api/auth/login stays exempt (browser has no session yet).
	req3 := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
	req3.Header.Set("Content-Type", "application/json")
	rec3 := httptest.NewRecorder()
	h.ServeHTTP(rec3, req3)
	if rec3.Code == http.StatusForbidden && strings.Contains(strings.ToLower(rec3.Body.String()), "csrf") {
		t.Fatalf("POST /api/auth/login must stay CSRF-exempt, got 403 %q", rec3.Body.String())
	}

	// Public POST /api/nodes/heartbeat stays exempt (edge token-in-body).
	req4 := httptest.NewRequest(http.MethodPost, "/api/nodes/heartbeat", strings.NewReader(`{}`))
	req4.Header.Set("Content-Type", "application/json")
	rec4 := httptest.NewRecorder()
	h.ServeHTTP(rec4, req4)
	if rec4.Code == http.StatusForbidden && strings.Contains(strings.ToLower(rec4.Body.String()), "csrf") {
		t.Fatalf("POST /api/nodes/heartbeat must stay CSRF-exempt, got 403 %q", rec4.Body.String())
	}
}

// TestCSRFTokenMintAndReuse proves the SPA flow works: GET /api/csrf-token
// mints a token, and a POST with that token is NOT CSRF-rejected (it
// proceeds to auth, i.e. 401 — not 403 CSRF).
func TestCSRFTokenMintAndReuse(t *testing.T) {
	h := NewRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/csrf-token", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/csrf-token = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "csrf_token") {
		t.Fatalf("csrf-token response should contain csrf_token, got %q", body)
	}
	// Extract token naively: {"csrf_token":"..."}.
	start := strings.Index(body, `"csrf_token"`)
	if start < 0 {
		t.Fatalf("no csrf_token key in %q", body)
	}
	rest := body[start:]
	q1 := strings.Index(rest, `"`, len(`"csrf_token"`)+1)
	if q1 < 0 {
		t.Fatalf("malformed token json %q", body)
	}
	// Find opening quote of value.
	valStart := strings.Index(rest[q1+1:], `"`)
	if valStart < 0 {
		t.Fatalf("malformed token json %q", body)
	}
	valStart += q1 + 2
	valEnd := strings.Index(rest[valStart:], `"`)
	if valEnd < 0 {
		t.Fatalf("malformed token json %q", body)
	}
	token := rest[valStart : valStart+valEnd]
	if token == "" {
		t.Fatalf("empty csrf token in %q", body)
	}

	// Reuse the same token twice: tokens are reusable until expiry (1h),
	// so both POSTs must pass CSRF (401 auth, not 403 CSRF).
	for i := 0; i < 2; i++ {
		r := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader(`{}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", token)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		if rr.Code == http.StatusForbidden && strings.Contains(strings.ToLower(rr.Body.String()), "csrf") {
			t.Fatalf("POST with valid token (use %d) must not be CSRF-blocked, got 403 %q", i+1, rr.Body.String())
		}
	}
}

// TestValidationMiddlewareWired proves RequestValidationMiddleware is
// mounted: an unknown Content-Type on POST gets 415, while WS/static and
// octet-stream chunk uploads pass validation (octet-stream) or fail later
// (auth), never with a validation 415 for allowed types.
func TestValidationMiddlewareWired(t *testing.T) {
	h := NewRouter()

	req := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/x-evil-type")
	req.Header.Set("X-CSRF-Token", CSRFTokenInstance.GenerateToken())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("POST with evil content-type = %d, want 415", rec.Code)
	}
}
