package security

import (
	"io"
	"net"
	"sync/atomic"

	"github.com/example/kspanel/internal/models"
)

// DDoSDroppingListener wraps a net.Listener so accepted TCP connections
// are rejected at the socket layer BEFORE the HTTP server reads a single
// byte, while the DDoS auto-stop is active in "stop" mode:
//
//   - A connection comes in.
//   - Accept returns it.
//   - shouldDrop() checks the live security state for "is DDoS auto-stop
//     active right now, and are we in stop mode?". If yes, the socket is
//     handed back wrapped in a dead conn (Read → EOF): the kernel FD is
//     closed the moment http.Server's serve loop sees EOF, so no request
//     parsing, routing or handler work ever happens for it.
//   - In "port_switch" mode the gate stays OPEN: the defense there is
//     moving the panel off the attacked port entirely (portswitch.go),
//     and whatever connects to the live listener must be served normally
//     so the panel remains usable on the alternate port under attack.
//
// Why shed at Accept instead of answering 503 in middleware: under a
// multi-million-RPS application-layer flood the per-request path would
// still pay for goroutine spawn, request-line parse, route lookup and
// response write. Shedding here reduces that to one atomic load plus an
// immediate EOF close for ~7 of every 8 sockets.
//
// The escapeEvery sampling below keeps /api/security/* reachable during a
// stop-mode cooldown: the accept layer cannot inspect request paths, so
// dropping EVERY socket would seal off the reset endpoint — the exact
// escape hatch the design depends on. Every Nth connection is handed to
// the HTTP server, where the middleware still 503s all non-security
// paths, so flood traffic gains nothing from the samples; the admin may
// just need a retry or two to get their reset request through.
//
// No kernel-level firewall manipulation happens here — this stays
// portable across the same OSes the rest of the panel supports.
type DDoSDroppingListener struct {
	net.Listener
	state *State

	// seen counts every conn the inner listener produced (served +
	// dropped); drops counts how many were shed by the gate. accepted
	// counts only conns handed to the HTTP server.
	seen     atomic.Uint64
	drops    atomic.Uint64
	accepted atomic.Uint64
	// sample drives the escape hatch rotation; separate from seen so the
	// telemetry counters never influence shedding decisions.
	sample atomic.Uint64
}

// escapeEvery is the 1-in-N connection sample passed through to the HTTP
// server while the stop-mode gate is active. 8 sheds 87.5% of sockets at
// zero parse cost while guaranteeing the admin's security-endpoint
// requests can still get through within a couple of retries.
const escapeEvery = 8

// ddosListenerSingleton is the process-wide reference to the wrapping
// listener, set once at launch by runLaunch(). The security snapshot
// handler reads its drop counters via DDoSListenerStats() so the admin
// page can show "X TCP connections refused by DDoS auto-stop".
var ddosListenerSingleton *DDoSDroppingListener

// DDoSListenerStats returns the running totals so callers (currently the
// security snapshot handler) can surface them on the admin page. Safe to
// call before the listener is initialised: returns zeros in that case.
func DDoSListenerStats() (accepted, dropped uint64) {
	if ddosListenerSingleton == nil {
		return 0, 0
	}
	return ddosListenerSingleton.accepted.Load(), ddosListenerSingleton.drops.Load()
}

// NewDDoSDroppingListener wraps ln with the DDoS-active gate. If s is
// nil the wrapper degrades to a pass-through so unit tests that don't
// initialise the security state still work. The wrapper is also stored
// in the package-level singleton so the snapshot handler can read its
// counters; only the most-recent wrapper is tracked (the port switcher
// installs a fresh wrapper each time the panel re-binds).
func NewDDoSDroppingListener(ln net.Listener, s *State) net.Listener {
	if s == nil {
		return ln
	}
	wrapped := &DDoSDroppingListener{Listener: ln, state: s}
	ddosListenerSingleton = wrapped
	return wrapped
}

// shouldDrop decides the fate of one freshly accepted conn. Never returns
// an error to the caller's Accept: http.Server.Serve treats any non-
// timeout error from Accept as fatal and STOPS serving, so policy-drops
// must be surfaced as a dead conn instead (see droppedConn).
func (d *DDoSDroppingListener) shouldDrop() bool {
	if !d.state.DDOSActive() {
		return false
	}
	// Port-switch mode defends by relocating the panel; connections that
	// DO reach this listener (i.e. the alternate port) must be served so
	// the panel stays usable during the attack.
	if d.state.Cfg().DDOSMode != models.DDOSModeStop {
		return false
	}
	// Escape hatch: hand every Nth conn to the server so /api/security/*
	// stays reachable (see type doc).
	n := d.sample.Add(1)
	return n%escapeEvery != 0
}

// Accept mirrors net.Listener.Accept. Connections shed by the gate come
// back as a dead conn whose Read immediately reports EOF; http.Server
// closes the underlying socket as soon as its serve loop sees the EOF,
// releasing the FD without ever parsing a byte of the request. The two
// atomic counters are exposed for the security admin page's telemetry.
func (d *DDoSDroppingListener) Accept() (net.Conn, error) {
	conn, err := d.Listener.Accept()
	if err != nil {
		return nil, err
	}
	d.seen.Add(1)
	if d.shouldDrop() {
		d.drops.Add(1)
		return droppedConn{Conn: conn}, nil
	}
	d.accepted.Add(1)
	return conn, nil
}

// droppedConn is a conn whose payload side is already dead: Read returns
// io.EOF and Write fails immediately, so http.Server finishes the (empty)
// exchange and closes the real socket without spawning request work.
// Close/addresses/deadlines are delegated to the real conn via embedding.
type droppedConn struct{ net.Conn }

func (droppedConn) Read([]byte) (int, error)  { return 0, io.EOF }
func (droppedConn) Write(b []byte) (int, error) { return 0, io.ErrClosedPipe }

// Drops returns the number of TCP connections rejected by the DDoS
// gate since this listener was created. Read by the security snapshot
// so the admin page can show "X connections refused by DDoS auto-stop".
func (d *DDoSDroppingListener) Drops() uint64 {
	if d == nil {
		return 0
	}
	return d.drops.Load()
}

// Accepted returns the number of TCP connections this listener has handed
// to the HTTP server (gate-passed, i.e. excluding dropped ones).
func (d *DDoSDroppingListener) Accepted() uint64 {
	if d == nil {
		return 0
	}
	return d.accepted.Load()
}
