package handlers

import (
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

// newStackServeTestDB points OpenDB at a temp file DB with the stacks
// table (full column list incl. serve_port/serve_auth) and returns an
// exec helper for seeding rows.
func newStackServeTestDB(t *testing.T) func(query string, args ...any) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "serve.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	repo, closeFn := openStackRepo()
	if repo == nil {
		t.Fatal("openStackRepo: nil (env not honoured?)")
	}
	_, err := dbExecHelper(repo, `CREATE TABLE stacks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', runtime TEXT NOT NULL DEFAULT '', entrypoint TEXT NOT NULL DEFAULT '', manifest TEXT NOT NULL DEFAULT '{}', spec TEXT NOT NULL DEFAULT '{}', frontend_theme_mode TEXT NOT NULL DEFAULT '', page_style TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 0, uploaded_by INTEGER, owner_id INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', package_size INTEGER NOT NULL DEFAULT 0, proxy_port INTEGER NOT NULL DEFAULT 0, proxy_root_url TEXT NOT NULL DEFAULT '', remote_address TEXT NOT NULL DEFAULT '', remote_use_tls INTEGER NOT NULL DEFAULT 0, remote_skip_verify INTEGER NOT NULL DEFAULT 0, token_hash TEXT NOT NULL DEFAULT '', token_prefix TEXT NOT NULL DEFAULT '', token_plain TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'down', last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', serve_port INTEGER NOT NULL DEFAULT 0, serve_auth INTEGER NOT NULL DEFAULT 1)`)
	closeFn()
	if err != nil {
		t.Fatalf("setup schema: %v", err)
	}
	return func(query string, args ...any) {
		t.Helper()
		r2, c2 := openStackRepo()
		if r2 == nil {
			t.Fatal("openStackRepo: nil")
		}
		defer c2()
		if _, err := dbExecHelper(r2, query, args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
}
