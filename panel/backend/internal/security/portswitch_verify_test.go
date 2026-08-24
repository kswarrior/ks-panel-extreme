package security

import (
	"net"
	"testing"
)

// TestVerifyAbandonedDetectsForeignHolder pins the contract that made the
// DDoS port switcher diagnosable: after the panel vacates a port, anything
// STILL answering there belongs to a foreign process and must be surfaced
// through lastErr (rendered by the Security page), while a properly dead
// port must stay silent.
func TestVerifyAbandonedDetectsForeignHolder(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	heldPort := ln.Addr().(*net.TCPAddr).Port

	p := &PortSwitcher{primary: heldPort, activePort: heldPort}
	p.verifyAbandoned(heldPort)
	if p.lastErr == "" {
		ln.Close()
		t.Fatal("expected lastErr to record the foreign holder of the vacated port")
	}

	// A port nothing serves must NOT raise an error. Close the listener
	// first so the probe sees the same post-vacation state switchTo does.
	ln.Close()
	p2 := &PortSwitcher{}
	p2.verifyAbandoned(heldPort)
	if p2.lastErr != "" {
		t.Fatalf("expected silence for an unheld port, got: %s", p2.lastErr)
	}
}
