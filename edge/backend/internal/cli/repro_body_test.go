package cli

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReproExecRpcBodyLimit(t *testing.T) {
	echo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(400)
			_, _ = w.Write([]byte("read-err:" + err.Error()))
			return
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(strings.Repeat("x", 0)[:0]))
		_ = b
	})
	h := edgeBodyLimit(echo)
	// 2 MiB JSON like an exec-rpc with staged files (under the 4 MiB execstage cap,
	// over the 1 MiB small-RPC cap).
	big := bytes.Repeat([]byte("a"), 2<<20)
	for _, path := range []string{"/api/edge/exec-rpc", "/api/edge/host-exec"} {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(big))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		t.Logf("path=%s status=%d", path, rec.Code)
		if path == "/api/edge/exec-rpc" && rec.Code == 400 {
			t.Fatalf("BUG: exec-rpc 2MiB body rejected (status 400), host-exec allows 8MiB")
		}
	}
}
