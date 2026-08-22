package security

import (
	"errors"
	"net"
	"sync/atomic"
)

// DDoSDroppingListener wraps a net.Listener so every accepted TCP
// connection is rejected at the socket layer BEFORE the HTTP server
// reads a single byte or spawns a per-request goroutine. This is the
// strongest behavior the panel can deliver at the application layer:
//
//   - A connection comes in.
//   - Accept returns it.
//   - DDoSDroppingListener.Ask() checks the live security state for
//     "is DDoS auto-stop active right now?". If yes → socket.Close()
//     immediately, kernel sends FIN/RST, goroutine count stays flat.
//   - Only when DDoS is NOT active does the wrapped listener hand the
//     net.Conn off to the HTTP server.
//
// Why this beats the in-middleware 503: under a multi-million-RPS
// application-layer flood, the per-request path would still pay the
// cost of (a) spawning a goroutine, (b) reading + parsing the request
// line and headers, (c) looking up routes, (d) writing a 503 response,
// and (e) running any deferred telemetry. Each of those costs CPU and
// memory, and a determined attacker can pin the panel by starving
// those resources even though every request "fails". By short-circuiting
// at Accept we make the per-request cost a single atomic load + a
// socket.Close — a hostile client gets an empty response and the
// panel's goroutine count never rises above the listener's own
// accept-loop budget.
//
// Security endpoints (/api/security/*) still go through normally
// because the in-middleware check (security_middleware.go) only
// fires once the HTTP server has parsed the request. That trade-off
// is intentional: the admin must be able to hit /api/security/ddos/reset
// to lift the stop. Static assets are also still served so the admin
// page itself can paint while DDoS is active.
//
// No kernel-level firewall manipulation happens here — this stays
// portable across the same OSes the rest of the panel supports.
type DDoSDroppingListener struct {
	net.Listener
	state  *State
	drops  atomic.Uint64
	accept atomic.Uint64
}

// ErrDDoSDropped is returned by Accept when the connection was refused
// because the DDoS auto-stop is active. The HTTP server treats this
// like any other accept error (logs it once and keeps going), so a
// flood of rejected connections doesn't spam the log.
var ErrDDoSDropped = errors.New("ddos auto-stop: connection dropped")

// ddosListenerSingleton is the process-wide reference to the wrapping
// listener, set once at launch by runLaunch(). The security snapshot
// handler reads its drop counters via DDoSListenerStats() so the admin
// page can show "X TCP connections refused by DDoS auto-stop".
var ddosListenerSingleton *DDoSDroppingListener

// DDoSListenerStats returns the running accept/drop totals so callers
// (currently the security snapshot handler) can surface them on the
// admin page. Safe to call before the listener is initialised: returns
// zeros in that case.
func DDoSListenerStats() (accepted, dropped uint64) {
	if ddosListenerSingleton == nil {
		return 0, 0
	}
	return ddosListenerSingleton.accept.Load(), ddosListenerSingleton.drops.Load()
}

// NewDDoSDroppingListener wraps ln with the DDoS-active gate. If s is
// nil the wrapper degrades to a pass-through so unit tests that don't
// initialise the security state still work. The wrapper is also stored
// in the package-level singleton so the snapshot handler can read its
// counters; only the most-recent wrapper is tracked (a fresh one
// replaces the previous, which is what happens when launch.go creates
// the listener once at startup).
func NewDDoSDroppingListener(ln net.Listener, s *State) net.Listener {
	if s == nil {
		return ln
	}
	wrapped := &DDoSDroppingListener{Listener: ln, state: s}
	ddosListenerSingleton = wrapped
	return wrapped
}

// Accept mirrors net.Listener.Accept. It hands the underlying listener
// a chance to receive the connection, then immediately drops the
// socket if DDoS is currently active. The two atomic counters are
// exposed for the security admin page's telemetry tile.
func (d *DDoSDroppingListener) Accept() (net.Conn, error) {
	conn, err := d.Listener.Accept()
	if err != nil {
		return nil, err
	}
	d.accept.Add(1)
	if d.state.DDOSActive() {
		// Hard-drop: close the socket without reading or writing. The
		// kernel will RST/FIN the remote side and the local FD is
		// released. No goroutine is parked on a Read, so the attacker's
		// keep-alive / pipelined / slowloris-style payloads cost us
		// exactly zero bytes of work.
		_ = conn.Close()
		d.drops.Add(1)
		return nil, ErrDDoSDropped
	}
	return conn, nil
}

// Drops returns the number of TCP connections rejected by the DDoS
// gate since the listener was created. Read by the security snapshot
// so the admin page can show "X connections refused by DDoS auto-stop".
func (d *DDoSDroppingListener) Drops() uint64 {
	if d == nil {
		return 0
	}
	return d.drops.Load()
}

// Accepted returns the number of TCP connections the listener has
// accepted since creation (including those later rejected). The
// snapshot uses (accepted - drops) to derive "passed-through" counts.
func (d *DDoSDroppingListener) Accepted() uint64 {
	if d == nil {
		return 0
	}
	return d.accept.Load()
}
