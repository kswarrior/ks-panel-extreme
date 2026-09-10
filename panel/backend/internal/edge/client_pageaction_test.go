package edge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/example/kspanel/internal/models"
)

func pageActionServer(t *testing.T, status int, payload string, seen *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/edge/page-action" {
			t.Errorf("path = %s", r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		*seen = body
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(payload))
	}))
}

func clientFor(srv *httptest.Server) *Client {
	addr := strings.TrimPrefix(srv.URL, "http://")
	return NewWithTimeout(models.Node{Address: addr}, "tok", 5*time.Second)
}

// Proxy semantics: HTTP 200 + ok:false (e.g. nonzero exit) returns the full
// payload as a VALUE with nil error so the panel forwards exit_code/stdout/
// stderr to the SDK instead of collapsing them into a 502 string.
func TestPageActionPreservesFailurePayload(t *testing.T) {
	var seen map[string]any
	srv := pageActionServer(t, 200, `{"ok":false,"exit_code":3,"stdout":"out","stderr":"boom"}`, &seen)
	defer srv.Close()
	out, err := clientFor(srv).PageAction(PageActionRequest{Kind: "docker", Name: "i", Type: "shell", Command: "exit 3", Timeout: 30})
	if err != nil {
		t.Fatalf("PageAction err = %v, want nil (proxy semantics)", err)
	}
	if out.OK || out.ExitCode != 3 || out.Stderr != "boom" {
		t.Fatalf("out = %+v", out)
	}
	// Contract: snake_case field names the edge handler decodes.
	for _, k := range []string{"token", "kind", "name", "type", "command", "timeout"} {
		if _, ok := seen[k]; !ok {
			t.Fatalf("request missing field %q: %v", k, seen)
		}
	}
	if seen["token"] != "tok" {
		t.Fatalf("token not injected: %v", seen)
	}
}

// HTTP >= 300 still becomes a Go error (offline/edge-rejected handling).
func TestPageActionHTTPError(t *testing.T) {
	var seen map[string]any
	srv := pageActionServer(t, 500, `{"ok":false,"error":"edge blew up"}`, &seen)
	defer srv.Close()
	_, err := clientFor(srv).PageAction(PageActionRequest{Kind: "docker", Name: "i", Type: "shell"})
	if err == nil || !strings.Contains(err.Error(), "edge blew up") {
		t.Fatalf("err = %v, want edge message", err)
	}
}

// A cancelled caller context aborts the round-trip (PageActionCtx).
func TestPageActionCtxCancel(t *testing.T) {
	var seen map[string]any
	srv := pageActionServer(t, 200, `{"ok":true}`, &seen)
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := clientFor(srv).PageActionCtx(ctx, PageActionRequest{Kind: "docker", Name: "i", Type: "shell"})
	if err == nil {
		t.Fatal("expected ctx error, got nil")
	}
}
