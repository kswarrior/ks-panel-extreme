package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWave1ReproRealRouteSuffix(t *testing.T) {
	h := NewRouter()
	for _, tc := range []struct{ method, path string }{
		{"PUT", "/api/themes/abc"},
		{"PUT", "/api/themes/abc.js"},
		{"POST", "/api/themes/market/install"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		ct := rec.Header().Get("Content-Type")
		t.Logf("%s %s no-token => code=%d ct=%q body-prefix=%q", tc.method, tc.path, rec.Code, ct, truncate(rec.Body.String(), 60))
	}
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
