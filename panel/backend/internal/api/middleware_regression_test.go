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

// TestCSRFFormTokenPreservesBody proves the form-token fallback does not
// starve downstream handlers: a multipart POST carrying csrf_token in the
// form (no X-CSRF-Token header) reaches next with the full body intact.
func TestCSRFFormTokenPreservesBody(t *testing.T) {
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
	if rec.Code != http.StatusOK {
		t.Fatalf("form-token POST = %d, want 200 (body=%q)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(downstream, "hello-world-payload") {
		t.Fatalf("downstream body drained (len=%d), want full multipart body", len(downstream))
	}
}

// TestMaxBodySizeFailsClosed proves over-limit bodies surface
// "request body too large" to the handler instead of being silently
// truncated while the handler still answers 200.
func TestMaxBodySizeFailsClosed(t *testing.T) {
	var got []byte
	var readErr error
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, readErr = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	})
	h := MaxBodySize(10)(next)
	big := bytes.Repeat([]byte("A"), 100)
	req := httptest.NewRequest(http.MethodPost, "/api/x", bytes.NewReader(big))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if readErr == nil && len(got) == 10 {
		t.Fatalf("100B body silently truncated to 10B with no error (fail open)")
	}
}

// TestRateLimiterIsolatesEndpoints proves login traffic cannot consume the
// register bucket (per-endpoint windows and caps require per-endpoint keys).
func TestRateLimiterIsolatesEndpoints(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.StopJanitor()
	for i := 0; i < 5; i++ {
		rl.RecordAttempt("1.2.3.4", "login")
	}
	if !rl.IsAllowed("1.2.3.4", "register") {
		t.Fatalf("5x login blocked the register bucket (want isolated)")
	}
	rl.ClearRecords("1.2.3.4")
	if rl.IsLocked("1.2.3.4", "login") {
		t.Fatalf("ClearRecords did not clear the login bucket")
	}
}

// TestSecurityClientIPIsBareIP proves telemetry stores a bare IP: the
// RemoteAddr port suffix is stripped so aggregation and allow/deny matching
// see the same value.
func TestSecurityClientIPIsBareIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "1.2.3.4:5678"
	if got := securityClientIP(req); got != "1.2.3.4" {
		t.Fatalf("securityClientIP = %q, want %q", got, "1.2.3.4")
	}
}
