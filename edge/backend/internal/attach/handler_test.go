package attach

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// The attach bridge must fail closed before touching any driver: bad
// input → 4xx over plain HTTP (so curl probes get useful statuses),
// never a half-open WebSocket.
func TestAttachRejectsBadInput(t *testing.T) {
	h := Handler("secret")
	cases := []struct {
		name  string
		query string
		want  int
	}{
		{"missing kind and name", "?token=secret", http.StatusBadRequest},
		{"missing name", "?token=secret&kind=docker", http.StatusBadRequest},
		{"bad token", "?token=wrong&kind=docker&name=x", http.StatusUnauthorized},
		{"empty token", "?kind=docker&name=x", http.StatusUnauthorized},
		{"unknown kind", "?token=secret&kind=nope&name=x", http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/edge/attach"+tc.query, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("GET %s = %d, want %d (body %q)", tc.query, rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// A well-formed attach against a missing container must surface a
// structured error frame (not a silent close): docker reports "not
// found" via Attach, and the pane renders the message.
func TestAttachMissingContainerSendsErrorFrame(t *testing.T) {
	if testing.Short() {
		t.Skip("needs docker CLI presence check only")
	}
	h := Handler("secret")
	srv := httptest.NewServer(h)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") +
		"/api/edge/attach?kind=docker&name=ks-attach-test-missing-12345&token=secret"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial attach: %v", err)
	}
	defer conn.Close()

	for i := 0; i < 10; i++ {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read frame: %v", err)
		}
		var msg map[string]any
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		if msg["type"] == "error" {
			if s, _ := msg["message"].(string); s == "" {
				t.Fatal("error frame carries no message")
			}
			return
		}
	}
	t.Fatal("no error frame within 10 messages")
}
