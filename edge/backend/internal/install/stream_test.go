package install

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// The stream bridge must fail closed over plain HTTP before upgrading:
// bad input → 4xx so curl probes get useful statuses, never a half-open WS.
func TestStreamRejectsBadInput(t *testing.T) {
	h := Handler("secret")
	cases := []struct {
		name   string
		method string
		query  string
		want   int
	}{
		{"POST rejected", http.MethodPost, "?token=secret&kind=docker&name=x", http.StatusMethodNotAllowed},
		{"missing kind and name", http.MethodGet, "?token=secret", http.StatusBadRequest},
		{"missing name", http.MethodGet, "?token=secret&kind=docker", http.StatusBadRequest},
		{"bad token", http.MethodGet, "?token=wrong&kind=docker&name=x", http.StatusUnauthorized},
		{"empty token", http.MethodGet, "?kind=docker&name=x", http.StatusUnauthorized},
		{"no workflow record", http.MethodGet, "?token=secret&kind=docker&name=ks-stream-missing-12345", http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/api/edge/install/stream"+tc.query, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("%s %s = %d, want %d (body %q)", tc.method, tc.query, rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestDiffTranscript(t *testing.T) {
	if got := diffTranscript("", ""); got != "" {
		t.Fatalf("empty/empty = %q, want empty", got)
	}
	if got := diffTranscript("abc", "abc"); got != "" {
		t.Fatalf("identical = %q, want empty", got)
	}
	if got := diffTranscript("", "hello"); got != "hello" {
		t.Fatalf("empty prev = %q, want hello", got)
	}
	if got := diffTranscript("hello ", "hello world"); got != "world" {
		t.Fatalf("prefix append = %q, want world", got)
	}
	// Slid window: prev tail anchors inside cur, only truly new bytes sent.
	prev := strings.Repeat("A", 3000) + "TAIL123"
	cur := "TAIL123" + "NEWBYTES"
	if got := diffTranscript(prev, cur); got != "NEWBYTES" {
		t.Fatalf("anchored diff = %q, want NEWBYTES", got)
	}
}

func TestSnapshotTranscript(t *testing.T) {
	rec := &record{state: StateRunning}
	if got := snapshotTranscript(rec); got != "" {
		t.Fatalf("no steps = %q, want empty", got)
	}
	rec.steps = []StepStatus{
		{Index: 0, Action: "shell", Status: stepRunning, ExitCode: 0, Stdout: "Starting minecraft server version 1.21\n"},
		{Index: 0, Action: "shell", Status: stepRunning, ExitCode: 0, Stdout: "", Stderr: ""},
	}
	got := snapshotTranscript(rec)
	if !strings.Contains(got, "Starting minecraft server") {
		t.Fatalf("transcript missing banner: %q", got)
	}
	if !strings.Contains(got, "step 0") {
		t.Fatalf("transcript missing step header: %q", got)
	}
}

// Happy path: history replay on connect, live delta while running, exit
// code when the workflow resolves. Stdin frames from the browser must be
// ignored (output-only stream — input policy stays on the POST path).
func TestStreamHappyPath(t *testing.T) {
	store := newStore()
	key := "docker:ks-stream-test"
	store.m[key] = &record{
		state: StateRunning,
		steps: []StepStatus{
			{Index: 0, Action: "shell", Status: stepRunning, Stdout: "Starting minecraft server version 1.21\n"},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/edge/install/stream", func(w http.ResponseWriter, r *http.Request) {
		handleInstallStream(w, r, "secret", store)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") +
		"/api/edge/install/stream?kind=docker&name=ks-stream-test&token=secret"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial stream: %v", err)
	}
	defer conn.Close()

	readFrame := func() map[string]any {
		t.Helper()
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, raw, rerr := conn.ReadMessage()
		if rerr != nil {
			t.Fatalf("read frame: %v", rerr)
		}
		var msg map[string]any
		if jerr := json.Unmarshal(raw, &msg); jerr != nil {
			t.Fatalf("decode frame %q: %v", string(raw), jerr)
		}
		return msg
	}

	// ready first.
	if msg := readFrame(); msg["type"] != "ready" {
		t.Fatalf("first frame = %v, want ready", msg["type"])
	}
	// History replay carries the java banner.
	foundBanner := false
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) && !foundBanner {
		msg := readFrame()
		if msg["type"] == "stdout" {
			if s, _ := msg["data"].(string); s != "" {
				dec, derr := base64.StdEncoding.DecodeString(s)
				if derr != nil {
					t.Fatalf("decode stdout: %v", derr)
				}
				if strings.Contains(string(dec), "Starting minecraft server") {
					foundBanner = true
				}
			}
		}
		if msg["type"] == "exit" {
			t.Fatalf("unexpected early exit: %v", msg)
		}
	}
	if !foundBanner {
		t.Fatal("history replay missing java banner within 5s")
	}

	// Browser stdin must be ignored, not crash the stream.
	_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"stdin","data":"dHBzCg=="}`))

	// Append live output + resolve the workflow; the stream must deliver
	// the delta then exit 0.
	store.m[key].mu.Lock()
	store.m[key].steps[0].Stdout += "> tps output: 20.0\n"
	store.m[key].mu.Unlock()
	foundLive := false
	deadline = time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) && !foundLive {
		msg := readFrame()
		if msg["type"] == "stdout" {
			if s, _ := msg["data"].(string); s != "" {
				if dec, derr := base64.StdEncoding.DecodeString(s); derr == nil {
					if strings.Contains(string(dec), "tps output") {
						foundLive = true
					}
				}
			}
		}
		if msg["type"] == "exit" {
			t.Fatalf("unexpected early exit while running: %v", msg)
		}
	}
	if !foundLive {
		t.Fatal("live delta missing tps output within 5s")
	}

	store.m[key].mu.Lock()
	store.m[key].state = StateDone
	store.m[key].mu.Unlock()
	for i := 0; i < 20; i++ {
		msg := readFrame()
		if msg["type"] == "exit" {
			if code, _ := msg["code"].(float64); code != 0 {
				t.Fatalf("exit code = %v, want 0", msg["code"])
			}
			return
		}
	}
	t.Fatal("no exit frame within 20 messages after done")
}
