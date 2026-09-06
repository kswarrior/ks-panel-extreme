package files

import (
	"fmt"
	"net/http/httptest"
	"os"
	"testing"
)

func TestReproSymlinkEscape(t *testing.T) {
	os.RemoveAll("/tmp/ks-symlink-repro")
	os.MkdirAll("/tmp/ks-symlink-real", 0755)
	os.WriteFile("/tmp/ks-symlink-real/secret.txt", []byte("host-secret"), 0644)
	os.Symlink("/etc", "/tmp/ks-symlink-repro")
	// clean check mimics hostFSDispatcher
	h := Handler("secret")
	// list via symlinked host_path that points at /etc
	req := httptest.NewRequest("GET", "/api/edge/files?op=list&kind=docker&name=x&path=/&host_path=/tmp/ks-symlink-repro&token=secret", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	body := rec.Body.String()
	fmt.Printf("REPRO files symlink list status=%d len=%d contains_passwd=%v snippet=%.200s\n", rec.Code, len(body), contains(body, "passwd"), body)
	// read /etc/passwd via symlink
	req2 := httptest.NewRequest("GET", "/api/edge/files?op=read&kind=docker&name=x&path=/&host_path=/tmp/ks-symlink-repro/passwd&token=secret", nil)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	fmt.Printf("REPRO files symlink read status=%d len=%d snippet=%.200s\n", rec2.Code, rec2.Body.Len(), rec2.Body.String())
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
