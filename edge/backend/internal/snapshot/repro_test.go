package snapshot

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
)

func TestReproHostileLocation(t *testing.T) {
	sh := Handler("secret")
	sbody, _ := json.Marshal(map[string]any{
		"token": "secret", "kind": "docker", "name": "nonexistent-xyz-123",
		"action": "create", "snap_name": "evil", "type": "tar", "location": "/etc/",
	})
	req := httptest.NewRequest("POST", "/api/edge/snapshot", bytes.NewReader(sbody))
	rec := httptest.NewRecorder()
	sh.ServeHTTP(rec, req)
	fmt.Printf("REPRO snapshot hostile location status=%d body=%s\n", rec.Code, rec.Body.String())
	// also traversal
	sbody2, _ := json.Marshal(map[string]any{
		"token": "secret", "kind": "docker", "name": "nonexistent-xyz-123",
		"action": "create", "snap_name": "evil", "type": "tar", "location": "../../tmp/evil",
	})
	req2 := httptest.NewRequest("POST", "/api/edge/snapshot", bytes.NewReader(sbody2))
	rec2 := httptest.NewRecorder()
	sh.ServeHTTP(rec2, req2)
	fmt.Printf("REPRO snapshot traversal location status=%d body=%s\n", rec2.Code, rec2.Body.String())
}
