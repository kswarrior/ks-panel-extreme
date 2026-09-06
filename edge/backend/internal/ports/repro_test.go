package ports

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
)

func TestReproInvalidIP(t *testing.T) {
	ph := Handler("secret")
	body, _ := json.Marshal(map[string]any{
		"token": "secret", "kind": "docker", "name": "nonexistent-xyz-123",
		"ports": []map[string]any{{"host": 8080, "container": 80, "protocol": "tcp", "ip": "not-an-ip; rm -rf /"}},
	})
	req := httptest.NewRequest("POST", "/api/edge/ports", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	ph.ServeHTTP(rec, req)
	fmt.Printf("REPRO ports invalid IP status=%d body=%s\n", rec.Code, rec.Body.String())
}
