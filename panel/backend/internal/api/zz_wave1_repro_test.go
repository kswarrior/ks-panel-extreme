package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Repro 1: CSRF static-asset suffix bypass on /api mutating route.
func TestWave1ReproCSRFSuffixBypass(t *testing.T) {
	h := NewRouter()
	req := httptest.NewRequest(http.MethodPost, "/api/themes/evil.js", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("POST /api/themes/evil.js no-token => code=%d body=%q", rec.Code, rec.Body.String())
	if rec.Code == http.StatusForbidden && strings.Contains(strings.ToLower(rec.Body.String()), "csrf") {
		t.Logf("CSRF enforced (fixed)")
	} else {
		t.Logf("BUG: CSRF bypassed via .js suffix (no CSRF 403)")
	}
}

// Repro 2: validation bypass via same suffix (evil content-type should be 415).
func TestWave1ReproValidationSuffixBypass(t *testing.T) {
	h := NewRouter()
	req := httptest.NewRequest(http.MethodPost, "/api/themes/evil.js", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/x-evil-type")
	req.Header.Set("X-CSRF-Token", CSRFTokenInstance.GenerateToken())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("POST /api/themes/evil.js evil-CT => code=%d body=%q", rec.Code, rec.Body.String())
	if rec.Code == http.StatusUnsupportedMediaType {
		t.Logf("validation enforced (fixed)")
	} else {
		t.Logf("BUG: validation bypassed via .js suffix (want 415)")
	}
}

// Repro 3: getClientIP trusts spoofable XFF over RemoteAddr.
func TestWave1ReproClientIPSpoof(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "1.2.3.4:1111"
	req.Header.Set("X-Forwarded-For", "9.9.9.9")
	got := getClientIP(req)
	t.Logf("getClientIP RemoteAddr=1.2.3.4:1111 XFF=9.9.9.9 => %q", got)
	if got == "9.9.9.9" {
		t.Logf("BUG: audit IP spoofable via XFF")
	} else {
		t.Logf("fixed: prefers RemoteAddr")
	}
	// rate_limiter side for contrast
	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req2.RemoteAddr = "1.2.3.4:1111"
	req2.Header.Set("X-Forwarded-For", "9.9.9.9")
	t.Logf("rateLimiter getClientID => %q", getClientID(req2))
}

// Repro 4: dead CORSMiddleware emits wildcard (breaks credentialed fetches, conflicts with chi cors).
func TestWave1ReproCORSWildcard(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	h := CORSMiddleware(inner)
	req := httptest.NewRequest(http.MethodOptions, "/api/themes", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("CORSMiddleware OPTIONS ACAO=%q methods=%q", rec.Header().Get("Access-Control-Allow-Origin"), rec.Header().Get("Access-Control-Allow-Methods"))
	if rec.Header().Get("Access-Control-Allow-Origin") == "*" {
		t.Logf("BUG: wildcard ACAO on (preflight); credentialed fetches reject * per Fetch spec")
	}
}

// Repro 5: MaxBodySize silently truncates instead of failing closed.
func TestWave1ReproBodyTruncation(t *testing.T) {
	echo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			_, _ = w.Write([]byte("read-error:" + err.Error()))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(strings.Repeat("x", len(b))))
	})
	h := MaxBodySize(10)(echo)
	body := strings.Repeat("A", 100)
	req := httptest.NewRequest(http.MethodPost, "/api/echo", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("MaxBodySize(10) with 100B body => code=%d echoed-len=%d", rec.Code, rec.Body.Len())
	if rec.Code == http.StatusOK && rec.Body.Len() == 10 {
		t.Logf("BUG: silent truncation to 10B with 200 (fail-open)")
	} else {
		t.Logf("fixed or different behavior")
	}
}

// Repro 6: RateLimiter counts successes toward lockout + double Stop panics.
func TestWave1ReproRateLimiterSemantics(t *testing.T) {
	rl := NewRateLimiter()
	defer func() {
		// single stop only; double-stop panic covered separately below
		rl.StopJanitor()
	}()
	ip := "10.9.9.9"
	for i := 0; i < 5; i++ {
		if !rl.IsAllowed(ip, "login") {
			t.Logf("attempt %d unexpectedly disallowed", i+1)
		}
		rl.RecordAttempt(ip, "login") // middleware records EVERY request incl. successes
	}
	t.Logf("after 5 recorded (successful) logins: IsLocked=%v", rl.IsLocked(ip, "login"))
	if rl.IsLocked(ip, "login") {
		t.Logf("NOTE: 5 successful logins trip the brute-force lockout (counts successes)")
	}
}

func TestWave1ReproDoubleStopPanics(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Logf("BUG: second StopJanitor panics: %v", r)
		} else {
			t.Logf("fixed: double Stop safe")
		}
	}()
	rl := NewRateLimiter()
	rl.StopJanitor()
	rl.StopJanitor() // buggy: close of closed channel
}
