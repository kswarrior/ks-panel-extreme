package auth

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

func TestVerifyBodyRestore(t *testing.T) {
	mw := AccountLockoutMiddleware(NewAccountLockout())
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(r.Body)
		fmt.Printf("downstream len=%d err=%v getbody=%v\n", len(b), err, r.GetBody != nil)
		if err != nil {
			t.Fatalf("downstream inherited broken body: %v", err)
		}
		if r.GetBody == nil {
			t.Fatal("GetBody not set")
		}
	})
	mw(next).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/auth/login", errReader{}))
	next2 := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		fmt.Printf("passthrough=%q\n", string(b))
		if string(b) != `{"identifier":"a"}` {
			t.Fatalf("body not preserved: %q", string(b))
		}
	})
	mw(next2).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"identifier":"a"}`)))
}
