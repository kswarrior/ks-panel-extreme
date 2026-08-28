package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRouterMountsOAuthRoutes proves the OAuth route patterns mount without
// chi's radix-tree conflicts (which would panic at server start) and that a
// request reaches the handler (502-free dispatch, method enforced).
func TestRouterMountsOAuthRoutes(t *testing.T) {
	var h http.Handler
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				t.Fatalf("router mount panicked (route conflict?): %v", rec)
			}
		}()
		h = NewRouter()
	}()

	// The public providers endpoint is dispatched all the way into the
	// handler: it opens the DB, which fails in this env — but as a 500 from
	// INSIDE the handler, proving routing + middleware chain work. A 404 or
	// 405 here would mean the route never mounted.
	req := httptest.NewRequest(http.MethodGet, "/api/auth/oauth/providers", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed {
		t.Fatalf("/api/auth/oauth/providers did not reach its handler: %d", rec.Code)
	}

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/auth/oauth/google/start"},
		{http.MethodGet, "/api/auth/oauth/apple/callback"},
		{http.MethodPost, "/api/auth/oauth/apple/callback"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader("code=x&state=y"))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code == http.StatusNotFound {
			t.Errorf("%s %s not mounted (404)", tc.method, tc.path)
		}
	}
}
