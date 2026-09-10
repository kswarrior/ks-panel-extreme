package pageaction

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/example/ksedge/internal/drivers"
)

func pipeSession(t *testing.T, stdout, stderr string, code int) *drivers.ExecSession {
	t.Helper()
	outR, outW := io.Pipe()
	errR, errW := io.Pipe()
	go func() {
		_, _ = outW.Write([]byte(stdout))
		_ = outW.Close()
	}()
	go func() {
		_, _ = errW.Write([]byte(stderr))
		_ = errW.Close()
	}()
	return &drivers.ExecSession{
		Stdin:  nopWC{io.Discard},
		Stdout: outR,
		Stderr: errR,
		Wait:   func() (int, error) { return code, nil },
		Close:  func() error { return nil },
	}
}

type nopWC struct{ io.Writer }

func (n nopWC) Close() error { return nil }

// Happy path: small output passes through untouched with the real exit code.
func TestReadSessionOK(t *testing.T) {
	sess := pipeSession(t, "hello\n", "warn\n", 3)
	stdout, stderr, code, err := readSession(context.Background(), sess)
	if err != nil {
		t.Fatalf("readSession err = %v", err)
	}
	if stdout != "hello\n" || stderr != "warn\n" || code != 3 {
		t.Fatalf("got (%q,%q,%d)", stdout, stderr, code)
	}
}

// A runaway command must fail closed, not OOM the daemon with unbounded output.
func TestReadSessionCapsOutput(t *testing.T) {
	big := strings.Repeat("x", maxActionOutputBytes+16)
	sess := pipeSession(t, big, "", 0)
	_, _, _, err := readSession(context.Background(), sess)
	if err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("expected oversize error, got %v", err)
	}
}

// A session whose pipes never reach EOF must not park the handler past the
// action deadline — the ctx select returns promptly.
func TestReadSessionCtxCancel(t *testing.T) {
	outR, _ := io.Pipe() // never written, never closed
	errR, _ := io.Pipe()
	sess := &drivers.ExecSession{
		Stdin:  nopWC{io.Discard},
		Stdout: outR,
		Stderr: errR,
		Wait:   func() (int, error) { <-context.Background().Done(); return -1, nil },
		Close:  func() error { return nil },
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, _, _, err := readSession(ctx, sess)
	if err == nil {
		t.Fatal("expected ctx error, got nil")
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("readSession ignored ctx, blocked %v", elapsed)
	}
}

func postAction(t *testing.T, h http.Handler, body string) (int, Output) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/edge/page-action", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out Output
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v (body %q)", err, rec.Body.String())
	}
	return rec.Code, out
}

// Missing driver kind fails closed with 400 (offline/unknown edge handling).
func TestHandlerUnknownDriver(t *testing.T) {
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"sekret","kind":"nope","name":"i","type":"shell","command":"echo hi"}`)
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
	if out.OK || !strings.Contains(out.Error, "unknown driver kind") {
		t.Fatalf("out = %+v", out)
	}
}

func TestHandlerBadToken(t *testing.T) {
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"wrong","kind":"docker","name":"i","type":"shell","command":"echo hi"}`)
	if code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", code)
	}
	if out.OK {
		t.Fatalf("out = %+v", out)
	}
}

func TestHandlerMissingFields(t *testing.T) {
	h := Handler("sekret")
	code, _ := postAction(t, h, `{"token":"sekret","kind":"docker"}`)
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}
