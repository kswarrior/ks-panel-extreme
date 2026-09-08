package install

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
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

	// History replay: what the transcript holds right now, newest-first
	// body budget so a spammy server can't blow the WS frame budget on
	// connect (mirrors docker Attach's logs-tail replay). Live deltas
	// after it are exact and unbounded.
	var pos []streamCursor
	for _, f := range streamReplay(snapshotSteps(rec), streamHistoryCap) {
		gw.writeStream(f.kind, f.data)
	}
	// Prime the live cursor past the replayed bytes so the first poll
	// sends only truly new output (replay may have trimmed old bodies).
	_ = streamNext(&pos, snapshotSteps(rec))

	ticker := time.NewTicker(streamPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-errCh:
			return
		case <-r.Context().Done():
			return
		case <-ticker.C:
			steps := snapshotSteps(rec)
			for _, f := range streamNext(&pos, steps) {
				gw.writeStream(f.kind, f.data)
			}
			if state := snapshotState(rec); state != StateRunning {
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

// snapshotSteps copies the workflow record's step transcript under RLock.
// Strings are immutable, so the shallow copy is safe to diff outside the
// lock while the engine keeps appending to its own buffers.
func snapshotSteps(rec *record) []StepStatus {
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	out := make([]StepStatus, len(rec.steps))
	copy(out, rec.steps)
	return out
}

// streamFrame is one chunk of workflow output: kind is "stdout" or
// "stderr" (same wire types as the exec/attach bridges) and data the raw
// bytes to write to the pane.
type streamFrame struct {
	kind string
	data string
}

// streamCursor tracks per-step delivery offsets for ONE stream connection.
// Headers are re-emitted only when the step's header text itself changes
// (status transition); body offsets move forward append-only, so a step
// transition with no new bytes sends nothing — never a full resend.
type streamCursor struct {
	header string
	out    int
	err    int
}

// streamSlideResend bounds the bytes re-sent when a body shrinks under the
// cursor (engine 64 KiB cap window slid, or a fresh run overwrote the
// record): only the last 8 KiB go out, never the whole transcript.
const streamSlideResend = 8 * 1024

// streamStepHeader formats one step's header line. The text matches the
// long-standing transcript shape so panes render exactly what they did.
func streamStepHeader(s StepStatus) string {
	return fmt.Sprintf("— step %d (%s · %s · exit %d) —\n", s.Index, s.Action, s.Status, s.ExitCode)
}

// streamBodyDelta returns the unsent suffix of cur given sent bytes
// already delivered, honouring the engine's sliding cap window.
func streamBodyDelta(sent int, cur string) (chunk string, next int) {
	if len(cur) < sent {
		// Slid (or reset): re-anchor on the last 8 KiB only.
		if len(cur) > streamSlideResend {
			return cur[len(cur)-streamSlideResend:], len(cur)
		}
		return cur, len(cur)
	}
	return cur[sent:], len(cur)
}

// streamNext computes the new frames for the current step snapshot,
// advancing pos. Steps are emitted in order; stdout and stderr ride
// SEPARATE frames in poll order, so an stderr line that arrives between
// two stdout writes renders where it arrived — never pinned after the
// whole stdout backlog.
func streamNext(pos *[]streamCursor, steps []StepStatus) []streamFrame {
	for len(*pos) < len(steps) {
		*pos = append(*pos, streamCursor{})
	}
	var frames []streamFrame
	for i, s := range steps {
		p := &(*pos)[i]
		if h := streamStepHeader(s); h != p.header {
			frames = append(frames, streamFrame{kind: "stdout", data: h})
			p.header = h
		}
		if chunk, next := streamBodyDelta(p.out, s.Stdout); chunk != "" {
			frames = append(frames, streamFrame{kind: "stdout", data: chunk})
			p.out = next
		} else {
			p.out = next
		}
		if chunk, next := streamBodyDelta(p.err, s.Stderr); chunk != "" {
			frames = append(frames, streamFrame{kind: "stderr", data: chunk})
			p.err = next
		} else {
			p.err = next
		}
	}
	return frames
}

// streamReplay renders the backlog for a freshly-attached pane: headers
// plus bodies, newest steps first against the byte budget (whole steps or
// nothing, so no half lines), emitted oldest-first. Bodies over budget are
// dropped from the oldest steps; empty steps emit nothing (as before).
func streamReplay(steps []StepStatus, budget int) []streamFrame {
	incl := make([]bool, len(steps))
	left := budget
	for i := len(steps) - 1; i >= 0; i-- {
		if n := len(steps[i].Stdout) + len(steps[i].Stderr); n <= left {
			incl[i] = true
			left -= n
		}
	}
	var frames []streamFrame
	for i, s := range steps {
		if s.Stdout == "" && s.Stderr == "" {
			continue
		}
		if !incl[i] {
			continue
		}
		frames = append(frames, streamFrame{kind: "stdout", data: streamStepHeader(s)})
		if s.Stdout != "" {
			frames = append(frames, streamFrame{kind: "stdout", data: s.Stdout})
		}
		if s.Stderr != "" {
			frames = append(frames, streamFrame{kind: "stderr", data: s.Stderr})
		}
	}
	return frames
}

// snapshotState returns the workflow record's current state under RLock.
func snapshotState(rec *record) string {
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	return rec.state
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

// writeStream sends one base64 stdout/stderr text frame.
func (g *streamGuardedConn) writeStream(kind, data string) {
	if data == "" || (kind != "stdout" && kind != "stderr") {
		return
	}
	enc := base64.StdEncoding.EncodeToString([]byte(data))
	g.write(map[string]any{"type": kind, "data": enc})
}

type streamSimpleErr string

func (e streamSimpleErr) Error() string { return string(e) }

var errStreamClientClose = streamSimpleErr("client closed")
