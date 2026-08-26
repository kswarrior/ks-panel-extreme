// Package exec exposes a WebSocket endpoint on ksedge that bridges a
// user-facing WS (panel → browser) onto a per-driver Exec() call.
//
// Wire protocol
// -------------
// The browser and the panel speak JSON over a single WebSocket. Each
// direction carries one message-per-line with the shape:
//
//	{"type":"stdin","data":"<base64>"}    // browser → driver stdin
//	{"type":"stdout","data":"<base64>"}   // driver stdout → browser
//	{"type":"stderr","data":"<base64>"}   // driver stderr → browser
//	{"type":"resize","cols":120,"rows":40} // browser → driver PTY resize
//	{"type":"ready"}                       // panel → browser
//	{"type":"exit","code":0}               // panel → browser (driver exited)
//
// Base64 keeps us inside text-mode WebSocket frames so we don't have to
// worry about proxy servers that strip/replace binary frames. The cost is
// ~33% overhead, but terminal I/O is tiny, so it's a non-issue even on a
// dial-up VNC of an SSH session.
//
// Authentication
// --------------
// The same shared token the lifecycle RPC uses is passed in the
// `?token=…` query string (WebSocket APIs in browsers can only set
// headers via the subprotocol header, which our reverse proxies often
// strip). This matches the panel's existing edge RPC contract.
package exec

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/ksedge/internal/drivers"
	"github.com/gorilla/websocket"
)

// wsOriginAllowed enforces the WebSocket origin policy documented on the
// Upgrader below: no Origin header (server-to-server client) or an Origin
// whose host matches the request's own Host are accepted; anything else is
// rejected before the upgrade.
func wsOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

// Handler returns an http.Handler authenticated by the given edge token.
//
// The handler:
//   1. validates ?kind= && ?name= && ?token= (200-with-error-protocol
//      errors are skipped; we let the upgrader return 4xx on bad input
//      so simple curl probes get useful status codes);
//   2. upgrades to a WebSocket;
//   3. spawns driver.Exec(...) with /bin/sh as the default command;
//   4. pumps bytes between the WS and the process's pipes until either
//      side drops, then sends the exit code and tears everything down.
func Handler(token string) http.Handler {
	up := websocket.Upgrader{
		// Origin policy: non-browser clients (the panel's server-side
		// proxy, which is the only sanctioned consumer of this endpoint)
		// send no Origin header and are allowed. Browser connections are
		// accepted only same-origin — a cross-site page must not be able
		// to complete a WebSocket handshake against the edge agent even
		// if it guessed a valid token.
		CheckOrigin:     wsOriginAllowed,
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
		// Token is checked constant-time like every other edge RPC; a
		// plain `!=` here would leak length-prefix timing info to an
		// attacker probing the WS endpoint (the comments elsewhere in the
		// tree enforce this same policy across lifecycle / inspect /
		// install).
		if token == "" || subtle.ConstantTimeCompare([]byte(tok), []byte(token)) != 1 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		drv, ok := drivers.Registry[kind]
		if !ok {
			http.Error(w, "unknown driver kind: "+kind, http.StatusBadRequest)
			return
		}

		tty := q.Get("tty") == "1" || strings.EqualFold(q.Get("tty"), "true")
		cols, _ := strconv.Atoi(q.Get("cols"))
		rows, _ := strconv.Atoi(q.Get("rows"))
		if cols <= 0 {
			cols = 80
		}
		if rows <= 0 {
			rows = 24
		}

		conn, err := up.Upgrade(w, r, nil)
		if err != nil {
			// upgrader.Upgrade already wrote an error response.
			return
		}
		defer conn.Close()

		// Spawn inside the request context so once the WS closes we
		// promptly tear down the dangling child process via the driver's
		// attached context.
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// gorilla/websocket forbids concurrent writers: the stdout/stderr
		// pumps and the exit-frame sender all call conn.WriteMessage, so a
		// tangle of writers racing after process exit used to corrupt the
		// WS stream. We serialise writes through a single mutex; reads
		// stay lock-free (only the inbound goroutine reads).
		gw := &guardedConn{conn: conn}

		// Default to /bin/sh so the operator gets a useful prompt without
		// having to figure out which shell the image ships.
		session, err := drv.Exec(ctx, name, tty, cols, rows, []string{"/bin/sh"})
		if err != nil {
			gw.write(map[string]any{"type": "error", "message": err.Error()})
			// Allow the message to flush before closing.
			time.Sleep(50 * time.Millisecond)
			return
		}
		defer session.Close()

		// Tell the browser the session is live. The frontend shows a
		// connecting spinner until it sees this frame so it never paints
		// a "shell ready" state against a session that didn't actually
		// start.
		gw.write(map[string]any{"type": "ready", "cols": cols, "rows": rows})

		errCh := make(chan error, 2)

		go pumpReader(session.Stdout, gw, "stdout")
		go pumpReader(session.Stderr, gw, "stderr")

		// Inbound pump: stdin + control frames (resize). This goroutine
		// owns the connection, so when it exits we close the whole WS.
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

		// Wait for the inner process; when it exits we forward the code.
		//
		// exitCode is owned SOLELY by this (main handler) goroutine. The
		// wait-goroutine delivers its computed code through a buffered
		// channel that we drain only in the <-done select branch; the
		// <-ctx.Done() / <-errCh branches fall back to the -1 default
		// they pre-set locally. This eliminates the historical race
		// where the wait-goroutine's `exitCode = code` assignment and
		// the main path's `exitCode = -1` set crossed without
		// synchronisation when ctx.Done() / errCh won the select
		// before the process exited (two writers + one read on the
		// same int from distinct goroutines). The channel keeps the
		// wait-goroutine's exit value reachable even if we exit the
		// select via another case — the cap-1 buffer prevents the
		// blocking close-after-write deadlock.
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

		// exitCode defaults to -1 because the <-ctx.Done() and <-errCh
		// branches mean "we don't have a real exit code to report"
		// (the process was either cancelled out from under us or the
		// WS backed connection went away); only the <-done branch
		// promotes it to the real child exit code. The default is
		// pre-set in the local exitCode variable so the gw.write() at
		// the bottom of the handler always sees a meaningful value
		// regardless of which select arm fired.
		exitCode := -1
		select {
		case <-done:
			exitCode = <-codeCh
			// Inner process exited; close Stdin to unblock pumps.
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

// guardedConn wraps a gorilla websocket connection with a write mutex so the
// stdout/stderr pumps and the control-frame sender don't race on
// WriteMessage (gorilla documents WriteMessage as not safe for concurrent
// use). Reads are untouched — only the inbound goroutine reads, and locking
// across the whole ReadMessage window would stall the pumps.
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

// pumpReader copies bytes from the driver pipe to the WS as framed
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
