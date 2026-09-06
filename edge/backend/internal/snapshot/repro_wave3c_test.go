package snapshot

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestVerifyLocations(t *testing.T) {
	// hostile literal paths must fail validation
	for _, loc := range []string{"/var/spool/cron", "/var", "/opt/data", "/home/u", "/srv/x", "/run/x", "/etc/cron.d", "/"} {
		if err := validateLocation(loc); err == nil {
			t.Errorf("validateLocation(%q) = nil, want error", loc)
		}
	}
	// relative, NUL, missing dir, regular file must fail
	if err := validateLocation("data/x"); err == nil {
		t.Error("relative path accepted")
	}
	if err := validateLocation("/data\x00/x"); err == nil {
		t.Error("NUL path accepted")
	}
	if err := validateLocation("/data-no-such-dir-ks"); err == nil {
		t.Error("missing dir accepted")
	}
	f, _ := os.CreateTemp("", "snapfile")
	f.Close()
	defer os.Remove(f.Name())
	if err := validateLocation(f.Name()); err == nil {
		t.Error("regular file accepted as location")
	}
	// symlink escaping to /etc must fail (direct + ancestor-walk paths)
	dir := t.TempDir()
	link := filepath.Join(dir, "link")
	if err := os.Symlink("/etc", link); err != nil {
		t.Fatal(err)
	}
	if err := validateLocation(link); err == nil {
		t.Error("symlink->/etc accepted")
	}
	if err := validateLocation(filepath.Join(link, "cron.d")); err == nil {
		t.Error("symlink-ancestor path accepted")
	}
	// valid existing data-style dir must pass
	if err := validateLocation(dir); err != nil {
		t.Errorf("valid dir rejected: %v", err)
	}
}

func TestVerifyHandlerStatuses(t *testing.T) {
	h := Handler("tok")
	post := func(loc string) int {
		body, _ := json.Marshal(SnapshotRequest{Token: "tok", Kind: "docker", Name: "i", Action: "create", SnapName: "s", Location: loc})
		req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	for _, loc := range []string{"/var/spool/cron", "/opt/d", "/home/u", "/srv/x", "/etc/cron.d", "/no-such-dir-ks"} {
		if got := post(loc); got != http.StatusBadRequest {
			t.Errorf("location %q status=%d, want 400", loc, got)
		}
	}
	if got := post(t.TempDir()); got == http.StatusBadRequest {
		t.Errorf("valid dir status=400, want pass-through to driver")
	}
}
