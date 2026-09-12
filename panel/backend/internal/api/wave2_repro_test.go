package api

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// H1: CSRF form-token path drains body for downstream raw readers.
func TestWave2Repro_CSRFFormDrain(t *testing.T) {
	ctm := NewCSRFTokenManager()
	tok := ctm.GenerateToken()
	var downstream string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		downstream = string(b)
		w.WriteHeader(http.StatusOK)
	})
	h := CSRFMiddleware(ctm)(next)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("csrf_token", tok)
	_ = mw.WriteField("name", "hello-world-payload")
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/me/avatar", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("H1 status=%d downstream_len=%d contains_payload=%v", rec.Code, len(downstream), strings.Contains(downstream, "hello-world-payload"))
	if rec.Code != http.StatusOK {
		t.Fatalf("H1 setup failed: status=%d body=%q", rec.Code, rec.Body.String())
	}
	if !strings.Contains(downstream, "hello-world-payload") {
		t.Fatalf("H1 BUG reproduced: downstream body drained (len=%d)", len(downstream))
	}
}

// H2: LimitReader silently truncates over-limit bodies with 200.
func TestWave2Repro_BodyTruncate(t *testing.T) {
	var got []byte
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	})
	h := MaxBodySize(10)(next)
	big := bytes.Repeat([]byte("A"), 100)
	req := httptest.NewRequest(http.MethodPost, "/api/x", bytes.NewReader(big))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	t.Logf("H2 status=%d downstream_len=%d (sent 100, cap 10)", rec.Code, len(got))
	if rec.Code == http.StatusOK && len(got) == 10 {
		t.Fatalf("H2 BUG reproduced: 100B body silently truncated to 10B with 200")
	}
}

// H3: login attempts consume the register bucket (shared key).
func TestWave2Repro_RateBucketCollision(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.StopJanitor()
	for i := 0; i < 5; i++ {
		rl.RecordAttempt("1.2.3.4", "login")
	}
	allowed := rl.IsAllowed("1.2.3.4", "register")
	t.Logf("H3 after 5x login: register IsAllowed=%v (want true, register cap is 3/hr untouched)", allowed)
	if !allowed {
		t.Fatalf("H3 BUG reproduced: login attempts blocked register bucket")
	}
}

// H4: telemetry IP keeps port / disagrees with audit helper.
func TestWave2Repro_ClientIPMismatch(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "1.2.3.4:5678"
	req.Header.Set("X-Forwarded-For", "9.9.9.9")
	a := securityClientIP(req)
	b := getClientIP(req)
	n := normalizeClientIP("1.2.3.4:5678")
	t.Logf("H4 securityClientIP=%q auditGetClientIP=%q normalize=%q", a, b, n)
	if strings.Contains(a, ":") {
		t.Fatalf("H4 BUG reproduced: telemetry IP keeps port suffix: %q", a)
	}
}
