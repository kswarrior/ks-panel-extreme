package edge

import (
	"net/http"
	"testing"
	"time"

	"github.com/example/kspanel/internal/models"
)

// The panel polls InstallStatus every 2s and Inspect every 10s per instance:
// the transport must reuse keep-alives and bound dial/TLS/first-byte so a
// hung edge fails fast instead of stacking goroutines across ticks.
func TestNewClientTransportTuned(t *testing.T) {
	node := models.Node{Address: "127.0.0.1:4040"}
	c := NewWithTimeout(node, "tok", 15*time.Second)
	if c.http.Timeout != 15*time.Second {
		t.Fatalf("client timeout = %v, want 15s", c.http.Timeout)
	}
	tr, ok := c.http.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("transport is %T, want *http.Transport", c.http.Transport)
	}
	if tr.ResponseHeaderTimeout != 15*time.Second {
		t.Fatalf("ResponseHeaderTimeout = %v, want 15s", tr.ResponseHeaderTimeout)
	}
	if tr.TLSHandshakeTimeout == 0 {
		t.Fatal("TLSHandshakeTimeout must be set")
	}
	if tr.MaxIdleConnsPerHost == 0 || tr.IdleConnTimeout == 0 {
		t.Fatal("idle reuse must be configured")
	}
	if tr.DialContext == nil {
		t.Fatal("DialContext must be set")
	}
}
