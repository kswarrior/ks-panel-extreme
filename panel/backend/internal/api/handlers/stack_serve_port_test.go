package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/example/kspanel/internal/auth"
	_ "modernc.org/sqlite"
)

// freeLoopbackPort reserves an ephemeral loopback port and releases it.
// A small bind race remains (another process could grab it first); the
// suite treats that as a skip, not a failure.
func freeLoopbackPort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("no loopback port: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	return port
}

// newStackServeTestDB points OpenDB at a temp file DB carrying the stacks
// table (full column list incl. serve_port/serve_auth) and returns the
// handle for seeding.
func newStackServeTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "serve.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`CREATE TABLE stacks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', runtime TEXT NOT NULL DEFAULT '', entrypoint TEXT NOT NULL DEFAULT '', manifest TEXT NOT NULL DEFAULT '{}', spec TEXT NOT NULL DEFAULT '{}', frontend_theme_mode TEXT NOT NULL DEFAULT '', page_style TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 0, uploaded_by INTEGER, owner_id INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', package_size INTEGER NOT NULL DEFAULT 0, proxy_port INTEGER NOT NULL DEFAULT 0, proxy_root_url TEXT NOT NULL DEFAULT '', remote_address TEXT NOT NULL DEFAULT '', remote_use_tls INTEGER NOT NULL DEFAULT 0, remote_skip_verify INTEGER NOT NULL DEFAULT 0, token_hash TEXT NOT NULL DEFAULT '', token_prefix TEXT NOT NULL DEFAULT '', token_plain TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'down', last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', serve_port INTEGER NOT NULL DEFAULT 0, serve_auth INTEGER NOT NULL DEFAULT 1)`)
	if err != nil {
		t.Fatalf("setup schema: %v", err)
	}
	return db
}

func TestStackServePortLifecycle(t *testing.T) {
	db := newStackServeTestDB(t)

	// Upstream app: echoes the panel-asserted identity headers + path so
	// the test proves stamping and root-passthrough end to end.
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "stack=%s uid=%s user=%s path=%s",
			r.Header.Get("X-Panel-Stack"), r.Header.Get("X-Panel-User-Id"),
			r.Header.Get("X-Panel-Username"), r.URL.Path)
	}))
	defer upstream.Close()
	upstreamPort := upstream.Listener.Addr().(*net.TCPAddr).Port
	servePort := freeLoopbackPort(t)

	res, err := db.Exec(`INSERT INTO stacks (name, slug, category, version, manifest, spec, active, proxy_port, serve_port, serve_auth, created_at, updated_at) VALUES ('Dash', 'dash', 'dashboard', '1.0.0', '{}', '{}', 1, ?, ?, 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`, upstreamPort, servePort)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	id, _ := res.LastInsertId()
	t.Cleanup(func() {
		_, _ = db.Exec(`UPDATE stacks SET active = 0 WHERE id = ?`, id)
		ReconcileStackServePort(id)
	})

	ReconcileStackServePort(id)
	if !StackServeListening(id) {
		t.Fatal("active serve-configured stack must listen after reconcile")
	}

	get := func(path string, cookie *http.Cookie) (int, string) {
		t.Helper()
		req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d%s", servePort, path), nil)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
		if err != nil {
			t.Fatalf("dial serve port: %v", err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(body)
	}

	// Auth off: proxied at origin root with panel identity stamped.
	if code, body := get("/some/path?q=1", nil); code != http.StatusOK {
		t.Fatalf("GET / = %d, want 200 (body %q)", code, body)
	} else if want := "stack=dash uid=0 user= path=/some/path"; body != want {
		t.Fatalf("upstream saw %q, want %q", body, want)
	}

	// Flip the auth gate on (same port — the handler resolves the row
	// live, no listener restart needed).
	if _, err := db.Exec(`UPDATE stacks SET serve_auth = 1 WHERE id = ?`, id); err != nil {
		t.Fatalf("seed auth: %v", err)
	}
	ReconcileStackServePort(id)
	if !StackServeListening(id) {
		t.Fatal("listener must survive an auth-only change")
	}
	if code, _ := get("/", nil); code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated GET / = %d, want 401", code)
	}
	token := auth.GenerateSessionToken(7, time.Now())
	auth.SessionManagerInstance.CreateSession(7, token, "test", "test")
	if code, body := get("/", &http.Cookie{Name: auth.SessionCookieName, Value: token}); code != http.StatusOK {
		t.Fatalf("authenticated GET / = %d, want 200 (body %q)", code, body)
	} else if want := "stack=dash uid=7 user= path=/"; body != want {
		t.Fatalf("upstream saw %q, want %q", body, want)
	}

	// Deactivation drops the listener.
	if _, err := db.Exec(`UPDATE stacks SET active = 0 WHERE id = ?`, id); err != nil {
		t.Fatalf("seed deactivate: %v", err)
	}
	ReconcileStackServePort(id)
	if StackServeListening(id) {
		t.Fatal("deactivated stack must not listen after reconcile")
	}
}
