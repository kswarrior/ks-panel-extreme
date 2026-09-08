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

// Live deltas are append-only per stream: the second poll of an unchanged
// transcript sends nothing, an appended chunk sends only the suffix.
func TestStreamNextAppendsOnly(t *testing.T) {
	steps := []StepStatus{
		{Index: 0, Action: "shell", Status: stepRunning, Stdout: "line1\n"},
	}
	var pos []streamCursor
	first := streamNext(&pos, steps)
	if len(first) != 2 { // header + body
		t.Fatalf("first poll = %d frames, want 2 (header+body)", len(first))
	}
	if again := streamNext(&pos, steps); len(again) != 0 {
		t.Fatalf("unchanged poll = %d frames, want 0 (got %v)", len(again), again)
	}
	steps[0].Stdout += "line2\n"
	delta := streamNext(&pos, steps)
	if len(delta) != 1 || delta[0].kind != "stdout" || delta[0].data != "line2\n" {
		t.Fatalf("append poll = %v, want [stdout line2]", delta)
	}
}

// A step status transition (running → done) with ZERO new output bytes
// must not resend bodies — only the changed header line goes out.
// (Regression: whole-transcript diffing resent the entire log here, so
// top-of-log lines re-appeared at the bottom and logs showed many times.)
func TestTranscriptStableAcrossStepTransition(t *testing.T) {
	mk := func(status string) []StepStatus {
		return []StepStatus{
			{Index: 0, Action: "shell", Status: status, ExitCode: 0, Stdout: "Starting minecraft server version 1.21\nDone (1.2s)!\n"},
		}
	}
	var pos []streamCursor
	_ = streamNext(&pos, mk(stepRunning))
	frames := streamNext(&pos, mk(stepDone))
	if len(frames) != 1 {
		t.Fatalf("transition frames = %v, want exactly the new header", frames)
	}
	if frames[0].kind != "stdout" || !strings.Contains(frames[0].data, "done") {
		t.Fatalf("transition frame = %v, want the done header", frames[0])
	}
}

// stdout and stderr ride separate frames in poll order: an stderr line
// that arrives between stdout writes renders where it arrived instead of
// being pinned after the whole stdout backlog.
func TestStreamNextKeepsStreamOrder(t *testing.T) {
	var pos []streamCursor
	steps := []StepStatus{{Index: 0, Action: "shell", Status: stepRunning, Stdout: "out1\n"}}
	_ = streamNext(&pos, steps)
	steps[0].Stderr = "warn1\n"
	steps[0].Stdout += "out2\n"
	frames := streamNext(&pos, steps)
	if len(frames) != 2 || frames[0].kind != "stdout" || frames[0].data != "out2\n" ||
		frames[1].kind != "stderr" || frames[1].data != "warn1\n" {
		t.Fatalf("ordered frames = %v, want [stdout out2, stderr warn1]", frames)
	}
}

// A shrunk body (engine 64 KiB cap slid, or a fresh run overwrote the
// record) re-anchors on the last 8 KiB only — never a full resend.
func TestStreamNextCapSlideBounded(t *testing.T) {
	big := strings.Repeat("X", 70*1024)
	var pos []streamCursor
	_ = streamNext(&pos, []StepStatus{{Index: 0, Action: "shell", Status: stepRunning, Stdout: big}})
	// Simulate the cap window sliding: body shorter than the cursor.
	cur := strings.Repeat("Y", 60*1024)
	frames := streamNext(&pos, []StepStatus{{Index: 0, Action: "shell", Status: stepRunning, Stdout: cur}})
	body := ""
	for _, f := range frames {
		if f.kind != "stdout" || strings.Contains(f.data, "step 0") {
			continue
		}
		body += f.data
	}
	if len(body) != 8*1024 {
		t.Fatalf("slide resend = %d body bytes, want exactly 8 KiB", len(body))
	}
	if body != cur[len(cur)-8*1024:] {
		t.Fatal("slide resend is not the body tail")
	}
}

// Replay honours the byte budget newest-first, whole steps or nothing.
func TestStreamReplayBudget(t *testing.T) {
	steps := []StepStatus{
		{Index: 0, Action: "download", Status: stepDone, Stdout: "old-bytes\n"},
		{Index: 1, Action: "shell", Status: stepRunning, Stdout: "new-bytes\n"},
	}
	frames := streamReplay(steps, len("old-bytes\n")+len("new-bytes\n")+1000)
	if len(frames) != 4 { // 2 headers + 2 bodies
		t.Fatalf("full replay = %d frames, want 4", len(frames))
	}
	// Budget fits only the newest step's body: oldest body dropped, newest kept.
	frames = streamReplay(steps, len("new-bytes\n"))
	var bodies []string
	for _, f := range frames {
		if !strings.Contains(f.data, "step ") {
			bodies = append(bodies, f.data)
		}
	}
	if len(bodies) != 1 || bodies[0] != "new-bytes\n" {
		t.Fatalf("budgeted replay bodies = %q, want only new-bytes", bodies)
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
