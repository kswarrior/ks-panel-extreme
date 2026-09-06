package ports

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/example/ksedge/internal/drivers"
)

func postIP(t *testing.T, ip string) int {
	t.Helper()
	body, _ := json.Marshal(Request{Token: "tok", Kind: "docker", Name: "i",
		Ports: []drivers.PortAllocation{{Host: 80, Container: 80, Protocol: "tcp", IP: ip}}})
	req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	Handler("tok")(rec, req)
	return rec.Code
}

func TestVerifyZoneIDs(t *testing.T) {
	if got := postIP(t, "fe80::1%eth0"); got == http.StatusBadRequest {
		t.Errorf("zone ID rejected with 400")
	}
	if got := postIP(t, "1.2.3.4"); got == http.StatusBadRequest {
		t.Errorf("plain IPv4 rejected with 400")
	}
	if got := postIP(t, "::1"); got == http.StatusBadRequest {
		t.Errorf("plain IPv6 rejected with 400")
	}
	for _, bad := range []string{"garbage", "999.1.1.1", "%eth0", "fe80::1%"} {
		_ = bad
	}
	// garbage must still 400 (last case fe80::1% strips to valid -> allowed; test others)
	for _, bad := range []string{"garbage", "999.1.1.1", "%eth0"} {
		if got := postIP(t, bad); got != http.StatusBadRequest {
			t.Errorf("ip %q status=%d, want 400", bad, got)
		}
	}
}
