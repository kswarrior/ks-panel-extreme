package security

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// PortSwitcher owns the panel's HTTP serving once launched: it serves on
// whichever port should currently be live and moves the server between
// the primary port and the DDoS alternate port at runtime.
//
// Why it exists: "port_switch" mode must close the attacked port and
// re-bind the SAME http.Server on the alternate port within ~a second of
// detection — without dropping in-flight requests and without restarting
// the process (the whole point is that the panel survives while attackers
// keep hammering a dead port).
//
// Mechanics:
//
//   - The switcher runs the accept loop supervisor (runServe): it calls
//     srv.Serve(ln) for whatever listener is current. Closing a swapped-
//     out listener makes Serve return; the loop notices the listener was
//     replaced and immediately serves the new one. Connections already
//     accepted before the swap keep draining through the same Server, so
//     nothing in flight is lost.
//   - A 1-second reconcile loop watches the live security state:
//     cooldown expiry is cleared even when zero legitimate traffic
//     arrives (the middleware alone can't do this — under a stop-mode
//     gate or after a port move there may be no legit request to trip its
//     lazy check), then the wanted port is derived from
//     mode+state and applied only on change.
//   - Switches bind the NEW listener first and close the old one second,
//     so there is never a moment where no listener exists.
//   - Every successful switch persists the now-active port into the
//     settings KV (panel_port), so a bare `kspanel launch` after a crash
//     comes back on the safe port instead of the attacked one.
type PortSwitcher struct {
	srv     *http.Server
	primary int // port the panel launched on

	mu         sync.Mutex
	ln         net.Listener
	activePort int
	switched   bool // true while serving on the DDOS alt port
	lastErr    string

	done chan struct{} // closed once serving has ended for good
}

// switcherSingleton tracks the most recent switcher so handlers can read
// the live port status without threading a pointer through the router.
var (
	switcherMu       sync.Mutex
	switcherInstance *PortSwitcher
)

// StartPortSwitcher takes ownership of ln (already wrapped with the DDoS
// gate by the caller) and starts serving srv on it. It launches the
// accept-loop supervisor and the reconcile poller, registers itself as
// the process-wide switcher, and returns a channel that closes when the
// server stops serving for good (i.e. after srv.Shutdown) — launch code
// blocks on it exactly like it used to block on srv.Serve.
func StartPortSwitcher(srv *http.Server, ln net.Listener, primaryPort int) <-chan struct{} {
	p := &PortSwitcher{
		srv:        srv,
		primary:    primaryPort,
		ln:         ln,
		activePort: primaryPort,
		done:       make(chan struct{}),
	}
	switcherMu.Lock()
	switcherInstance = p
	switcherMu.Unlock()

	go func() {
		p.runServe()
		close(p.done)
	}()
	go p.reconcileLoop()
	return p.done
}

// runServe serves the current listener; whenever the listener is swapped
// by switchTo (detected as "Serve returned but pointer changed") it picks
// up the new one without returning to the caller. Only a real shutdown
// (srv.Shutdown → ErrServerClosed) ends the loop.
func (p *PortSwitcher) runServe() {
	for {
		p.mu.Lock()
		ln := p.ln
		p.mu.Unlock()
		if ln == nil {
			return
		}
		err := p.srv.Serve(ln)
		if err == http.ErrServerClosed {
			return
		}
		p.mu.Lock()
		swapped := p.ln != ln && p.ln != nil
		p.mu.Unlock()
		if swapped {
			continue
		}
		// The listener died on its own (fd exhaustion, kernel hiccup…).
		// Back off briefly and retry rather than killing the panel over
		// a transient accept failure.
		log.Printf("ddos port switcher: serve on :%d ended (%v); retrying", p.currentPort(), err)
		time.Sleep(time.Second)
	}
}

// reconcileLoop derives the wanted port once per second and applies it on
// change. Runs for the life of the process like every other background
// sweep in the panel.
func (p *PortSwitcher) reconcileLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		p.reconcile()
	}
}

func (p *PortSwitcher) reconcile() {
	s := Get()
	cfg := s.Cfg()

	// Expire the cooldown proactively: during a stop-mode gate (or while
	// parked on the alt port) there may be no legitimate request to trip
	// the middleware's lazy expiry check, and the attack flood itself
	// never reaches the middleware in stop mode.
	if s.ClearDDOSIfExpired() {
		go func() {
			ClearUnderAttackFlag()
			Get().Reload()
		}()
	}

	want := p.primary
	if s.DDOSActive() &&
		cfg.DDOSMode == models.DDOSModePortSwitch &&
		cfg.DDOSAltPort >= 1 && cfg.DDOSAltPort <= 65535 &&
		int(cfg.DDOSAltPort) != p.primary {
		want = int(cfg.DDOSAltPort)
	}

	if want == p.currentPort() {
		return
	}
	if err := p.switchTo(want); err != nil {
		log.Printf("ddos port switcher: %v", err)
	}
}

// currentPort reports the port currently bound (0 if none).
func (p *PortSwitcher) currentPort() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.activePort
}

// switchTo re-binds the HTTP server onto port with zero listening gap:
// the new listener is bound and installed BEFORE the old one is closed,
// and in-flight connections drain through the shared http.Server.
func (p *PortSwitcher) switchTo(port int) error {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		msg := fmt.Sprintf("bind :%d failed: %v", port, err)
		p.mu.Lock()
		p.lastErr = msg
		p.mu.Unlock()
		return fmt.Errorf("%s", msg)
	}
	wrapped := NewDDoSDroppingListener(ln, Get())

	p.mu.Lock()
	old := p.ln
	oldPort := p.activePort
	p.ln = wrapped
	p.activePort = port
	p.switched = port != p.primary
	p.lastErr = ""
	p.mu.Unlock()

	// Persist the safe port so a restart (crash, systemd bump, reinstall
	// script) doesn't move the panel back under the flood. Best-effort —
	// the switch itself must not fail because of a KV write.
	if con, cerr := repository.OpenDB(); cerr == nil {
		_ = repository.NewSettingsRepository(con).SetPanelPort(port)
		con.Close()
	}

	if old != nil {
		_ = old.Close() // unblocks runServe; accepted conns keep draining

		// This process just closed its own listener on oldPort, so if that
		// port STILL accepts connections a moment later, the socket belongs
		// to a FOREIGN process — almost always a duplicate/stale kspanel
		// instance left behind by an update or reinstall. A process can
		// never close another process's socket, so record the fact (the
		// Security page renders it as the red "Port switch problem" line)
		// instead of letting the move look broken for no visible reason.
		p.verifyAbandoned(oldPort)
	}
	log.Printf("ddos port switcher: panel moved to :%d (attack response)", port)
	return nil
}

// verifyAbandoned dials a port this panel just vacated and, when something
// still answers, surfaces who is likely responsible. Dialing 127.0.0.1 keeps
// the probe local and cheap; listeners bound only to one external interface
// or IPv6-only are not covered (best-effort diagnostics, not a guarantee).
func (p *PortSwitcher) verifyAbandoned(port int) {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 500*time.Millisecond)
	if err != nil {
		return // refused / timeout = nothing is serving there, as expected
	}
	conn.Close()
	msg := fmt.Sprintf(
		":%d is still accepting connections — ANOTHER process owns it (duplicate/stale kspanel instance). "+
			"This panel cannot close a foreign port; stop the extra process to free it.",
		port)
	p.mu.Lock()
	p.lastErr = msg
	p.mu.Unlock()
	log.Printf("ddos port switcher: WARNING %s", msg)
}

// PortStatus snapshots the switcher state for the security snapshot
// handler. Returns zeros/false/empty before StartPortSwitcher ran.
func PortStatus() (activePort int64, switched bool, lastErr string) {
	switcherMu.Lock()
	p := switcherInstance
	switcherMu.Unlock()
	if p == nil {
		return 0, false, ""
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return int64(p.activePort), p.switched, p.lastErr
}
