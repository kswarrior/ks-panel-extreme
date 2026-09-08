package install

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// streamHistoryCap bounds the history replay handed to a freshly-attached
// workflow console so a spammy server can't blow the WS frame budget on
// connect (the live tail after it is unbounded, delta by delta).
const streamHistoryCap = 32 * 1024

// streamPollInterval is how often the stream polls the workflow record for
// new transcript bytes while the workflow runs. 250ms keeps the terminal
// feeling live without spinning the edge on idle instances.
const streamPollInterval = 250 * time.Millisecond

// handleInstallStream is the edge half of the panel's live workflow console
// (GET /api/edge/install/stream?kind=&name=&token= → WebSocket).
//
// It bridges the browser (via the panel's /api/instances/{id}/workflow
// proxy) onto the RUNNING workflow's transcript for kind:name — the same
// record the install poller reads — so a terminal pane opened by ID shows
// the action/install console LIVE (e.g. Minecraft java banner, `>` prompt,
// tps/op output) instead of the panel DB's 2s-poll mirror.
//
// Wire protocol: identical to the exec/attach bridges so the browser's
// Terminal component speaks to all three unchanged (stdin/stdout/stderr/
// resize/ready/exit/error, base64 text frames).
//
// Output-only: stdin frames from the browser are ACCEPTED but IGNORED here.
// Console input still rides the existing POST /api/edge/install/stdin path
// (panel ActionStdinHandler/InstallStdinHandler), which is where the
// action's terminal input policy (disabled/allowlist/blocked) is enforced
// server-side. Forwarding WS stdin directly into the kept stdin pipe would
// bypass that policy, so this stream never writes browser bytes into the
// workflow — it only streams workflow bytes out to the browser.
func handleInstallStream(w http.ResponseWriter, r *http.Request, token string, store *store) {
	if r.Method != http.MethodGet {
		writeInstallErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query()
	kind := q.Get("kind")
	name := q.Get("name")
	tok := q.Get("token")
	if kind == "" || name == "" {
		writeInstallErr(w, http.StatusBadRequest, "kind and name are required")
		return
	}
	if token == "" || subtle.ConstantTimeCompare([]byte(tok), []byte(token)) != 1 {
		writeInstallErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	key := kind + ":" + name
	rec, ok := store.get(key)
	if !ok {
		writeInstallErr(w, http.StatusNotFound, "no workflow for "+key)
		return
	}

	up := websocket.Upgrader{
		CheckOrigin:     func(r *http.Request) bool { return true },
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
	}
	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	gw := &streamGuardedConn{conn: conn}

	// Inbound pump: read and discard (output-only stream). resize/close are
	// honoured for teardown; stdin is deliberately dropped (see doc above).
	errCh := make(chan error, 2)
	go func() {
		for {
			_, raw, rerr := conn.ReadMessage()
			if rerr != nil {
				errCh <- rerr
				return
			}
			var msg map[string]any
			if jerr := json.Unmarshal(raw, &msg); jerr != nil {
				continue
			}
			if t, _ := msg["type"].(string); t == "close" {
				errCh <- errStreamClientClose
				return
			}
		}
	}()

	gw.write(map[string]any{"type": "ready"})

	// History replay: current transcript snapshot, capped, so a freshly
	// attached pane is not blank (mirrors docker Attach's logs-tail replay).
	lastSent := ""
	if hist := snapshotTranscript(rec); hist != "" {
		tail := hist
		if len(tail) > streamHistoryCap {
			tail = tail[len(tail)-streamHistoryCap:]
		}
		gw.writeStdout(tail)
		lastSent = hist
	}

	ticker := time.NewTicker(streamPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-errCh:
			return
		case <-r.Context().Done():
			return
		case <-ticker.C:
			cur := snapshotTranscript(rec)
			state := snapshotState(rec)
			if cur != lastSent {
				delta := diffTranscript(lastSent, cur)
				if delta != "" {
					gw.writeStdout(delta)
				}
				lastSent = cur
			}
			if state != StateRunning {
				code := -1
				if state == StateDone {
					code = 0
				} else if state == StateFailed {
					code = 1
				}
				gw.write(map[string]any{"type": "exit", "code": code})
				time.Sleep(100 * time.Millisecond)
				return
			}
		}
	}
}

// snapshotTranscript folds the workflow record's step transcript into one
// string (every step's stdout + stderr, oldest first) for streaming. It
// mirrors the panel frontend's actionLogText shape (step headers + 8k tail
// is applied panel-side; here we keep the full capped per-stream buffers
// the engine maintains and let the stream cap the replay).
func snapshotTranscript(rec *record) string {
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	if len(rec.steps) == 0 {
		return ""
	}
	var b strings.Builder
	for _, s := range rec.steps {
		out := ""
		if s.Stdout != "" && s.Stderr != "" {
			out = s.Stdout + "\n" + s.Stderr
		} else {
			out = s.Stdout + s.Stderr
		}
		if out == "" {
			continue
		}
		fmt.Fprintf(&b, "— step %d (%s · %s · exit %d) —\n%s", s.Index, s.Action, s.Status, s.ExitCode, out)
		if !strings.HasSuffix(out, "\n") {
			b.WriteString("\n")
		}
	}
	return b.String()
}

// snapshotState returns the workflow record's current state under RLock.
func snapshotState(rec *record) string {
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	return rec.state
}

// diffTranscript computes the new bytes to stream given the last sent full
// transcript and the current full transcript. Exact-prefix appends (the
// common live case) send only the suffix; a slid cap window re-anchors on
// the previous tail so polls never spam duplicates; otherwise the last 8k
// are resent as a safe fallback.
func diffTranscript(prev, cur string) string {
	if cur == "" || cur == prev {
		return ""
	}
	if prev == "" {
		return cur
	}
	if strings.HasPrefix(cur, prev) {
		return cur[len(prev):]
	}
	anchor := prev
	if len(anchor) > 2000 {
		anchor = anchor[len(anchor)-2000:]
	}
	if anchor != "" {
		if idx := strings.LastIndex(cur, anchor); idx >= 0 {
			return cur[idx+len(anchor):]
		}
	}
	if len(cur) > 8000 {
		return cur[len(cur)-8000:]
	}
	return cur
}

// streamGuardedConn serialises WS writes (gorilla forbids concurrent
// WriteMessage). The stream has a single writer goroutine today, but the
// guard keeps the pattern identical to the exec/attach bridges.
type streamGuardedConn struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (g *streamGuardedConn) write(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	_ = g.conn.WriteMessage(websocket.TextMessage, b)
}

// writeStdout sends one base64 stdout text frame.
func (g *streamGuardedConn) writeStdout(s string) {
	if s == "" {
		return
	}
	enc := base64.StdEncoding.EncodeToString([]byte(s))
	g.write(map[string]any{"type": "stdout", "data": enc})
}

type streamSimpleErr string

func (e streamSimpleErr) Error() string { return string(e) }

var errStreamClientClose = streamSimpleErr("client closed")
