package api

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestDynamicMaxBodySizePinned proves the body cap fails closed: an
// oversize POST surfaces a read error (mapped to 413, never a silent
// 200 on a truncated body) while a small POST passes through intact.
func TestDynamicMaxBodySizePinned(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
	h := DynamicMaxBodySize()(next)

	// Small POST passes through intact.
	small := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader("hello"))
	smallRec := httptest.NewRecorder()
	h.ServeHTTP(smallRec, small)
	if smallRec.Code != http.StatusOK {
		t.Fatalf("small POST = %d, want 200", smallRec.Code)
	}
	if smallRec.Body.String() != "hello" {
		t.Fatalf("small POST body = %q, want %q", smallRec.Body.String(), "hello")
	}

	// Oversize POST (default 10 MiB cap) must 413, not silent 200.
	big := strings.Repeat("a", (10<<20)+1024)
	bigReq := httptest.NewRequest(http.MethodPost, "/api/themes", strings.NewReader(big))
	bigRec := httptest.NewRecorder()
	h.ServeHTTP(bigRec, bigReq)
	if bigRec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize POST = %d, want 413", bigRec.Code)
	}
}

// zeroReader streams 'a' bytes without allocating the full body, so the
// over-lift 413 case below does not need a 64 MiB string in memory.
type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'a'
	}
	return len(p), nil
}

// TestDynamicMaxBodySizeUploadLifts proves the package-upload routes are
// lifted above the generic 10 MiB cap: an 11 MiB POST to each lifted
// prefix passes through intact (200 + echo), a non-lifted path still
// 413s at 11 MiB (lift selection is path-specific), and a body over the
// /api/mods 64 MiB lift 413s instead of being silently truncated.
func TestDynamicMaxBodySizeUploadLifts(t *testing.T) {
	echo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
	h := DynamicMaxBodySize()(echo)

	// 11 MiB sits between the 10 MiB default and every lift, so it
	// passes only where a lift applies.
	eleven := bytes.Repeat([]byte("a"), (11 << 20))
	for _, path := range []string{"/api/mods", "/api/stacks", "/api/instance-page-modules/upload"} {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(eleven))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("POST %s 11MiB = %d, want 200", path, rec.Code)
		}
		if rec.Body.Len() != len(eleven) {
			t.Fatalf("POST %s echo = %d bytes, want %d", path, rec.Body.Len(), len(eleven))
		}
	}

	// Control: a non-lifted path still fails closed at 11 MiB.
	ctrlReq := httptest.NewRequest(http.MethodPost, "/api/themes", bytes.NewReader(eleven))
	ctrlRec := httptest.NewRecorder()
	h.ServeHTTP(ctrlRec, ctrlReq)
	if ctrlRec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("control POST /api/themes 11MiB = %d, want 413", ctrlRec.Code)
	}

	// Over-lift: 64 MiB + 1 KiB to /api/mods must 413. Stream the body
	// and discard on read so the case costs I/O, not a 64 MiB alloc.
	discard := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	over := httptest.NewRequest(http.MethodPost, "/api/mods", io.LimitReader(zeroReader{}, (64<<20)+1024))
	overRec := httptest.NewRecorder()
	DynamicMaxBodySize()(discard).ServeHTTP(overRec, over)
	if overRec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("POST /api/mods 64MiB+1K = %d, want 413", overRec.Code)
	}
}
