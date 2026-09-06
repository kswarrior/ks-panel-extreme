package datamove

import (
	"testing"

	"github.com/example/kspanel/internal/repository"
)

func TestRepro069MissingAPIKeyRequests(t *testing.T) {
	src, _ := openTestDB(t, "repro.db")
	defer src.Close()
	var name string
	err := src.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='api_key_requests'`).Scan(&name)
	t.Logf("table lookup err=%v name=%q", err, name)
	r := repository.NewApiKeyRepository(src)
	if err := r.RecordAPIKeyRequest("abc"); err != nil {
		t.Logf("REPRO RecordAPIKeyRequest err=%v", err)
	} else {
		t.Logf("RecordAPIKeyRequest ok")
	}
	if _, err := r.CheckAPIKeyRateLimit("abc"); err != nil {
		t.Logf("REPRO CheckAPIKeyRateLimit err=%v", err)
	} else {
		t.Logf("CheckAPIKeyRateLimit ok")
	}
	if err == nil {
		// table exists check passed above via name; force fail display
	}
}
