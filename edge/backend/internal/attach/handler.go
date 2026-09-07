// Package attach exposes a WebSocket endpoint on ksedge that bridges a
// user-facing WS (panel → browser) onto the instance's MAIN process stdio
// (the container entrypoint / template startup command, e.g. a Minecraft
// server) via the driver's Attach call.
//
// Wire protocol: identical to the exec bridge (ksedge/internal/exec), so
// the browser's Terminal component speaks to both unchanged:
//
//	{"type":"stdin","data":"<base64>"}    // browser → main-process stdin
//	{"type":"stdout","data":"<base64>"}   // main-process stdout → browser
//	{"type":"stderr","data":"<base64>"}   // main-process stderr → browser
//	{"type":"resize","cols":120,"rows":40} // accepted, no-op (no PTY)
//	{"type":"ready"}                       // panel → browser
//	{"type":"exit","code":0}               // panel → browser (process exited)
//
// Base64 keeps us inside text-mode WebSocket frames so we don't have to
// worry about proxy servers that strip/replace binary frames.
//
// Authentication mirrors the exec endpoint: the shared edge token rides in
// `?token=…` because browsers can't set headers on a WS handshake.
package attach

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/example/ksedge/internal/drivers"
	"github.com/gorilla/websocket"
)

// Handler returns an http.Handler authenticated by the given edge token.
//
// The handler:
//  1. validates ?kind= && ?name= && ?token=
//     (4xx on bad input so curl probes get useful status codes);
//  2. upgrades to a WebSocket;
//  3. calls driver.Attach(name) for the main-process stdio session
//     (docker: logs-tail replay + `docker attach`);
//  4. pumps bytes between the WS and the session until either side
//     drops, then sends the exit code and tears everything down.
func Handler(token string) http.Handler {
	up := websocket.Upgrader{
		// No CSRF/origin check here: the WS endpoint is reached via the
		// shared reverse proxy that already enforces origin/ACLs, and
		// authentication relies on the shared token rather than cookies.
		CheckOrigin:     func(r *http.Request) bool { return true },
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		kind := q.Get("kind")
		name := q.Get("name")
		tok := q.Get("token")
		if kind == "" || name == "" {
			http.Error(w, "kind and name are required", http.StatusBadRequest)
			return
		}
		// Constant-time token check like every other edge RPC.
		if token == "" || subtle.ConstantTimeCompare([]byte(tok), []byte(token)) != 1 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		drv, ok := drivers.Registry[kind]
		if !ok {
			http.Error(w, "unknown driver kind: "+kind, http.StatusBadRequest)
			return
		}

		conn, err := up.Upgrade(w, r, nil)
		if err != nil {
			// upgrader.Upgrade already wrote an error response.
			return
		}
		defer conn.Close()

		// Spawn inside the request context so once the WS closes we
		// promptly tear down the attach via the driver's attached context.
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// gorilla/websocket forbids concurrent writers: serialise them
		// through one mutex; reads stay lock-free (only the inbound
		// goroutine reads).
		gw := &guardedConn{conn: conn}

		session, err := drv.Attach(ctx, name)
		if err != nil {
			gw.write(map[string]any{"type": "error", "message": err.Error()})
			// Allow the message to flush before closing.
			time.Sleep(50 * time.Millisecond)
			return
		}
		defer session.Close()

		// Tell the browser the session is live. The frontend shows a
		// connecting spinner until it sees this frame so it never paints
		// a "console ready" state against a session that didn't start.
		gw.write(map[string]any{"type": "ready"})

		errCh := make(chan error, 2)

		go pumpReader(session.Stdout, gw, "stdout")
		go pumpReader(session.Stderr, gw, "stderr")

		// Inbound pump: stdin + control frames (resize is accepted and
		// ignored — an attached main process has no PTY to resize).
		go func() {
			defer cancel()
			for {
				_, raw, err := conn.ReadMessage()
				if err != nil {
					errCh <- err
					return
				}
				var msg map[string]any
				if err := json.Unmarshal(raw, &msg); err != nil {
					continue
				}
				switch msg["type"] {
				case "stdin":
					if s, ok := msg["data"].(string); ok {
						dec, derr := base64.StdEncoding.DecodeString(s)
						if derr == nil {
							_, _ = session.Stdin.Write(dec)
						}
					}
				case "resize":
					if session.Resize != nil {
						c, _ := msg["cols"].(float64)
						r, _ := msg["rows"].(float64)
						_ = session.Resize(int(c), int(r))
					}
				case "close":
					errCh <- errClientClose
					return
				}
			}
		}()

		// Wait for the main process; when it exits (e.g. Minecraft
		// `stop`) we forward the code so the pane can report it.
		// exitCode is owned SOLELY by this goroutine; the wait-goroutine
		// delivers through a buffered channel (same race-free shape as
		// the exec bridge).
		codeCh := make(chan int, 1)
		done := make(chan struct{})
		go func() {
			defer close(done)
			code, werr := session.Wait()
			if werr != nil && code == 0 {
				code = 1
			}
			codeCh <- code
		}()

		exitCode := -1
		select {
		case <-done:
			exitCode = <-codeCh
			_ = session.Stdin.Close()
		case <-ctx.Done():
			_ = session.Stdin.Close()
		case <-errCh:
			// Read or write loop ended (likely the WS closed).
			_ = session.Stdin.Close()
		}

		gw.write(map[string]any{"type": "exit", "code": exitCode})
		// 100ms grace so the browser can render the exit frame before we
		// sever the socket.
		time.Sleep(100 * time.Millisecond)
	})
}

// guardedConn wraps a gorilla websocket connection with a write mutex so
// the stdout/stderr pumps and the control-frame sender don't race on
// WriteMessage. Reads are untouched — only the inbound goroutine reads.
type guardedConn struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

// write marshals v to JSON and sends it as a single text frame under the
// write lock. Errors are silently swallowed — the inbound goroutine will
// observe the resulting close and tear the session down.
func (g *guardedConn) write(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	_ = g.conn.WriteMessage(websocket.TextMessage, b)
}

// pumpReader copies bytes from the session pipe to the WS as framed
// base64-encoded stdout/stderr messages.
func pumpReader(r interface {
	Read(p []byte) (int, error)
}, gw *guardedConn, kind string) {
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			enc := make([]byte, base64.StdEncoding.EncodedLen(n))
			base64.StdEncoding.Encode(enc, buf[:n])
			gw.write(map[string]any{"type": kind, "data": string(enc)})
		}
		if err != nil {
			return
		}
	}
}

// errClientClose is a sentinel passed via errCh when the browser issued
// a `{"type":"close"}` frame so the readers shut down deterministically.
var errClientClose = simpleErr("client closed")

type simpleErr string

func (e simpleErr) Error() string { return string(e) }
