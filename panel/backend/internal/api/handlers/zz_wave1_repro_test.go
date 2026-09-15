package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/example/kspanel/internal/auth"
)

func TestWave1LogoutEmptyBearerShadowsCookie(t *testing.T) {
	token := auth.GenerateSessionToken(4242, time.Now())
	auth.SessionManagerInstance.CreateSession(4242, token, "127.0.0.1", "repro")
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer ")
	req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: token})
	rr := httptest.NewRecorder()
	LogoutHandler(rr, req)
	if auth.SessionManagerInstance.IsSessionValid(token) {
		t.Logf("BUG-REPRO: cookie session still valid after logout with empty Bearer")
		t.Fail()
	} else {
		t.Logf("OK: cookie session revoked")
	}
}

func TestWave1LockoutMiddlewareFieldPriority(t *testing.T) {
	al := auth.NewAccountLockout()
	for i := 0; i < 5; i++ {
		al.RecordFailedAttempt("victim@example.com")
	}
	if !al.IsAccountLocked("victim@example.com") {
		t.Fatalf("setup failed: email should be locked")
	}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	h := auth.AccountLockoutMiddleware(al)(next)
	body := `{"username":"attacker-unlocked","email":"victim@example.com","password":"x"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	t.Logf("middleware status=%d (want 429 when email locked)", rr.Code)
	if rr.Code != http.StatusTooManyRequests {
		t.Logf("BUG-REPRO: middleware checked username, not email -> lockout bypass")
		t.Fail()
	}
}
