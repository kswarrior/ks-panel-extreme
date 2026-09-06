package auth

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

func TestReproLockoutReadError(t *testing.T) {
	al := NewAccountLockout()
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(r.Body)
		fmt.Printf("downstream read len=%d err=%v\n", len(b), err)
	})
	h := AccountLockoutMiddleware(al)(next)
	req := httptest.NewRequest("POST", "/api/auth/login", errReader{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	fmt.Printf("status=%d\n", rec.Code)
}
