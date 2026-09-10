package repository

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// openAnnounceTestDB builds a minimal stacks DB mirroring production pool
// tuning: SQLite runs MaxOpenConns(1) (see db.Open), so any repository
// method that queries the pool from inside an open transaction deadlocks
// forever — and holds the write lock while doing it, jamming every other
// writer. This helper reproduces that environment on :memory: (a single
// pooled connection == a single in-memory database).
func openAnnounceTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	t.Cleanup(func() { db.Close() })
	stmts := []string{
		`CREATE TABLE stacks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', runtime TEXT NOT NULL DEFAULT '', entrypoint TEXT NOT NULL DEFAULT '', manifest TEXT NOT NULL DEFAULT '{}', spec TEXT NOT NULL DEFAULT '{}', frontend_theme_mode TEXT NOT NULL DEFAULT '', page_style TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 0, uploaded_by INTEGER, owner_id INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', package_size INTEGER NOT NULL DEFAULT 0, proxy_port INTEGER NOT NULL DEFAULT 0, proxy_root_url TEXT NOT NULL DEFAULT '', remote_address TEXT NOT NULL DEFAULT '', remote_use_tls INTEGER NOT NULL DEFAULT 0, remote_skip_verify INTEGER NOT NULL DEFAULT 0, token_hash TEXT NOT NULL DEFAULT '', token_prefix TEXT NOT NULL DEFAULT '', token_plain TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'down', last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE stack_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, stack_id INTEGER NOT NULL, capability TEXT NOT NULL DEFAULT '', access_level TEXT NOT NULL DEFAULT '', granted INTEGER NOT NULL DEFAULT 0)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return db
}

// applyAnnounceTimeout runs ApplyAnnounce with a tripwire: on a
// MaxOpenConns(1) pool an in-transaction pool query never returns, so
// without the timeout a regression would hang the suite instead of
// failing it.
func applyAnnounceTimeout(t *testing.T, r *StackRepository, id int64, in AnnounceInput) (int, error) {
	t.Helper()
	type result struct {
		pending int
		err     error
	}
	done := make(chan result, 1)
	go func() {
		pending, err := r.ApplyAnnounce(id, in)
		done <- result{pending, err}
	}()
	select {
	case res := <-done:
		return res.pending, res.err
	case <-time.After(10 * time.Second):
		t.Fatalf("ApplyAnnounce deadlocked (in-transaction pool query on MaxOpenConns(1)?)")
		return 0, nil
	}
}

func TestApplyAnnounceSyncsMetadataAndNeeds(t *testing.T) {
	db := openAnnounceTestDB(t)
	r := NewStackRepository(db)
	s, _, err := r.CreateStack(CreateStackInput{Name: "Dash", Slug: "dash-e2e"})
	if err != nil {
		t.Fatalf("CreateStack: %v", err)
	}

	pending, err := applyAnnounceTimeout(t, r, s.ID, AnnounceInput{
		Name: "E2E Dashboard", Version: "2.1.0", Description: "live test", Icon: "dash",
		Needs: []StackPermissionReq{
			{Capability: "metrics.read", AccessLevel: "read"},
			{Capability: "instances.read", AccessLevel: "read"},
		},
	})
	if err != nil {
		t.Fatalf("ApplyAnnounce: %v", err)
	}
	if pending != 2 {
		t.Fatalf("pending = %d, want 2", pending)
	}
	got, err := r.GetStack(s.ID)
	if err != nil {
		t.Fatalf("GetStack: %v", err)
	}
	if got.Name != "E2E Dashboard" || got.Version != "2.1.0" || got.Description != "live test" || got.Icon != "dash" {
		t.Fatalf("metadata not stored: %+v", got)
	}
	if got.Slug != "dash-e2e" {
		t.Fatalf("slug must stay operator-owned, got %q", got.Slug)
	}

	// Grant one cap, re-announce the same set: grant retained, one pending.
	if err := r.SetGrants(s.ID, []StackGrantDecision{{Capability: "metrics.read", Granted: true}}); err != nil {
		t.Fatalf("SetGrants: %v", err)
	}
	pending, err = applyAnnounceTimeout(t, r, s.ID, AnnounceInput{
		Name: "E2E Dashboard", Version: "2.1.1",
		Needs: []StackPermissionReq{
			{Capability: "metrics.read", AccessLevel: "read"},
			{Capability: "instances.read", AccessLevel: "read"},
		},
	})
	if err != nil {
		t.Fatalf("re-announce: %v", err)
	}
	if pending != 1 {
		t.Fatalf("pending = %d, want 1 (metrics.read grant must survive)", pending)
	}

	// Drop a cap: its row (and spent grant) goes away.
	pending, err = applyAnnounceTimeout(t, r, s.ID, AnnounceInput{
		Name: "E2E Dashboard", Version: "2.1.1",
		Needs: []StackPermissionReq{
			{Capability: "instances.read", AccessLevel: "read"},
		},
	})
	if err != nil {
		t.Fatalf("drop-cap announce: %v", err)
	}
	if pending != 1 {
		t.Fatalf("pending = %d, want 1", pending)
	}
	perms, err := r.ListStackPermissions(s.ID)
	if err != nil {
		t.Fatalf("ListStackPermissions: %v", err)
	}
	if len(perms) != 1 || perms[0].Capability != "instances.read" {
		t.Fatalf("dropped cap row must be deleted, got %+v", perms)
	}

	// Fail closed: unknown caps and empty names never touch the row.
	if _, err := applyAnnounceTimeout(t, r, s.ID, AnnounceInput{Name: "E2E Dashboard", Needs: []StackPermissionReq{{Capability: "nope", AccessLevel: "x"}}}); err == nil {
		t.Fatal("unknown capability must be rejected")
	}
	if _, err := applyAnnounceTimeout(t, r, s.ID, AnnounceInput{Name: "  "}); err == nil {
		t.Fatal("empty name must be rejected")
	}
	if _, err := applyAnnounceTimeout(t, r, 0, AnnounceInput{Name: "x"}); err == nil {
		t.Fatal("zero stack id must be rejected")
	}
}
