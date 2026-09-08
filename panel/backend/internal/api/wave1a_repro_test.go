package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWave1ALogoutCSRF(t *testing.T) {
	ctm := NewCSRFTokenManager()
	ok := httptest.NewRecorder()
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200); _, _ = w.Write([]byte("ok")) })
	h := CSRFMiddleware(ctm)(next)
	// cookie-only POST /api/auth/logout without token
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	// ensure no Bearer header
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("POST /api/auth/logout without token code=%d body=%q", rec.Code, rec.Body.String())
	if rec.Code == http.StatusForbidden {
		t.Logf("OK logout requires CSRF")
	} else {
		t.Fatalf("BUG_REPRO logout CSRF-exempt code=%d want 403", rec.Code)
	}
	// login must stay exempt
	req2 := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	t.Logf("POST /api/auth/login without token code=%d", rec2.Code)
	if rec2.Code != 200 {
		t.Fatalf("login must stay exempt, got %d", rec2.Code)
	}
	_ = ok
}
