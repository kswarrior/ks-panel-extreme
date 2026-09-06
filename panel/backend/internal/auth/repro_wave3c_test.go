package auth

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReproLockoutBodyRestore(t *testing.T) {
	al := NewAccountLockout()
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(r.Body)
		fmt.Printf("downstream read len=%d err=%v\n", len(b), err)
	})
	h := AccountLockoutMiddleware(al)(next)
	// malformed JSON: current code restores body only via err==nil path... check downstream sees body
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader("{bad json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	fmt.Printf("status=%d\n", rec.Code)
}
