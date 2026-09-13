package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestDynamicMaxBodySizePinned proves the body cap fails closed: an
// oversize POST surfaces a read error (mapped to 413, never a silent
// 200 on a truncated body) while a small POST passes through intact.
func TestDynamicMaxBodySizePinned(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
	h := DynamicMaxBodySize()(next)

	// Small POST passes through intact.
	small := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader("hello"))
	smallRec := httptest.NewRecorder()
	h.ServeHTTP(smallRec, small)
	if smallRec.Code != http.StatusOK {
		t.Fatalf("small POST = %d, want 200", smallRec.Code)
	}
	if smallRec.Body.String() != "hello" {
		t.Fatalf("small POST body = %q, want %q", smallRec.Body.String(), "hello")
	}

	// Oversize POST (default 10 MiB cap) must 413, not silent 200.
	big := strings.Repeat("a", (10<<20)+1024)
	bigReq := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader(big))
	bigRec := httptest.NewRecorder()
	h.ServeHTTP(bigRec, bigReq)
	if bigRec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize POST = %d, want 413", bigRec.Code)
	}
}
