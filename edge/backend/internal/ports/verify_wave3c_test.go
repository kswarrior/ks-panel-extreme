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
	h := Handler("tok")
	req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestVerifyZoneIDs(t *testing.T) {
	for _, good := range []string{"fe80::1%eth0", "1.2.3.4", "::1"} {
		if got := postIP(t, good); got == http.StatusBadRequest {
			t.Errorf("ip %q rejected with 400", good)
		}
	}
	for _, bad := range []string{"garbage", "999.1.1.1", "%eth0"} {
		if got := postIP(t, bad); got != http.StatusBadRequest {
			t.Errorf("ip %q status=%d, want 400", bad, got)
		}
	}
}
