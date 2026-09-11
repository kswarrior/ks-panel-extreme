package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// newPageKVTestDB points OpenDB at a temp file DB carrying the minimal
// schema InstanceRepository.Get selects from (instances + the three LEFT
// JOIN parents) plus the REAL 078 migration body, then seeds three
// instances: 1 = dash + files/edit enabled, 2 = dash only, 3 = nothing.
func newPageKVTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "pagekv.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	mig, err := os.ReadFile("../../db/migrations/sqlite/078_page_kv.sql")
	if err != nil {
		t.Fatalf("read 078 migration: %v", err)
	}
	stmts := []string{
		`CREATE TABLE nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE instances (id INTEGER PRIMARY KEY AUTOINCREMENT, node_id INTEGER NOT NULL, template_id INTEGER, owner_id INTEGER,
			name TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'creating', external_id TEXT NOT NULL DEFAULT '', config TEXT NOT NULL DEFAULT '{}',
			error TEXT NOT NULL DEFAULT '', install_state TEXT NOT NULL DEFAULT '', install_id TEXT NOT NULL DEFAULT '', install_step INTEGER NOT NULL DEFAULT -1,
			install_error TEXT NOT NULL DEFAULT '', install_steps_json TEXT NOT NULL DEFAULT '', install_kind TEXT NOT NULL DEFAULT '',
			install_auto_stop INTEGER NOT NULL DEFAULT 0, install_action_id TEXT NOT NULL DEFAULT '',
			suspended INTEGER NOT NULL DEFAULT 0, suspended_until TEXT, suspension_count INTEGER NOT NULL DEFAULT 0, suspension_history TEXT NOT NULL DEFAULT '[]',
			started_at TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		string(mig),
		`INSERT INTO nodes (id, name) VALUES (1, 'edge-1')`,
		`INSERT INTO templates (id, name) VALUES (1, 'tpl')`,
		`INSERT INTO users (id, username) VALUES (1, 'alice')`,
		`INSERT INTO instances (id, node_id, template_id, owner_id, name, kind, status, config) VALUES
			(1, 1, 1, 1, 'i-one', 'docker', 'running', '{"pages":[{"slug":"dash"},{"slug":"files","sub_pages":[{"path":"edit"}]}]}'),
			(2, 1, 1, 1, 'i-two', 'docker', 'running', '{"pages":[{"slug":"dash"}]}'),
			(3, 1, 1, 1, 'i-three', 'docker', 'running', '{}')`,
	}
	for i, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup stmt %d: %v", i, err)
		}
	}
	return db
}

func kvRequest(t *testing.T, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
	}
	w := httptest.NewRecorder()
	switch method {
	case "GET":
		ListPageKVHandler(w, r)
	case "PUT":
		UpsertPageKVHandler(w, r)
	case "DELETE":
		DeletePageKVHandler(w, r)
	default:
		t.Fatalf("unknown method %s", method)
	}
	return w
}

func kvEntries(t *testing.T, w *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var d struct {
		Entries []struct {
			K string `json:"k"`
			V string `json:"v"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &d); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	out := map[string]string{}
	for _, e := range d.Entries {
		out[e.K] = e.V
	}
	return out
}

// ---- migration up/down on sqlite -------------------------------------------

func TestPageKVMigrationUpDown(t *testing.T) {
	mig, err := os.ReadFile("../../db/migrations/sqlite/078_page_kv.sql")
	if err != nil {
		t.Fatalf("read 078 migration: %v", err)
	}
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer conn.Close()

	// UP: the file must apply cleanly on an empty database.
	if _, err := conn.Exec(string(mig)); err != nil {
		t.Fatalf("migration up: %v", err)
	}
	// PK (instance_id, page_slug, k): duplicates fail, same key on a
	// different instance/page passes.
	if _, err := conn.Exec(`INSERT INTO page_kv VALUES (1, 'dash', 'theme', 'dark', '2026-09-11 00:00:00')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO page_kv VALUES (1, 'dash', 'theme', 'x', '2026-09-11 00:00:01')`); err == nil {
		t.Fatal("duplicate (instance_id, page_slug, k) must violate the PK")
	} else if _, err := conn.Exec(`INSERT INTO page_kv VALUES (2, 'dash', 'theme', 'light', '2026-09-11 00:00:00')`); err != nil {
		t.Fatalf("same key on another instance must pass: %v", err)
	} else if _, err := conn.Exec(`INSERT INTO page_kv VALUES (1, 'files/edit', 'theme', 'x', '2026-09-11 00:00:00')`); err != nil {
		t.Fatalf("same key on another page must pass: %v", err)
	}
	// DOWN then UP again (idempotent re-apply via IF NOT EXISTS).
	if _, err := conn.Exec(`DROP TABLE page_kv`); err != nil {
		t.Fatalf("migration down: %v", err)
	}
	if _, err := conn.Exec(string(mig)); err != nil {
		t.Fatalf("migration re-up: %v", err)
	}
	var n int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM page_kv`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("fresh table must be empty, n=%d err=%v", n, err)
	}
}

// ---- pure validation --------------------------------------------------------

func TestValidatePageKVKey(t *testing.T) {
	for _, k := range []string{"a", "theme", "x.y_z-0", "UPPER.09_-", strings.Repeat("k", 128)} {
		if err := validatePageKVKey(k); err != nil {
			t.Errorf("key %q must pass: %v", k, err)
		}
	}
	for _, k := range []string{"", "a/b", "a b", "a;b", "semi;colon", "quote'", "back`tick", "dollar$", "unié", "tab\there", strings.Repeat("k", 129), "../escape"} {
		if err := validatePageKVKey(k); err == nil {
			t.Errorf("key %q must be rejected", k)
		}
	}
}

func TestValidatePageKVValue(t *testing.T) {
	if err := validatePageKVValue(strings.Repeat("v", 64*1024)); err != nil {
		t.Fatalf("64KiB value must pass: %v", err)
	}
	if err := validatePageKVValue(strings.Repeat("v", 64*1024+1)); err == nil {
		t.Fatal("64KiB+1 value must be rejected")
	}
}

// ---- scoping: IDOR matrix ---------------------------------------------------

func TestPageKVListScopingIDOR(t *testing.T) {
	db := newPageKVTestDB(t)
	for _, row := range [][4]any{
		{1, "dash", "theme", "dark"},
		{2, "dash", "theme", "light"},
		{1, "dash", "other", "1"},
	} {
		if _, err := db.Exec(`INSERT INTO page_kv (instance_id, page_slug, k, v, updated_at) VALUES (?, ?, ?, ?, '2026-09-11 00:00:00')`,
			row[0], row[1], row[2], row[3]); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	// Instance 1 sees only its own keys.
	got := kvEntries(t, kvRequest(t, "GET", "/api/instance-pages/kv?instance_id=1&page_slug=dash", ""))
	if len(got) != 2 || got["theme"] != "dark" {
		t.Fatalf("instance 1 list = %v, want its 2 keys only", got)
	}
	// Instance 2 sees only its own keys (no cross-instance leak).
	got = kvEntries(t, kvRequest(t, "GET", "/api/instance-pages/kv?instance_id=2&page_slug=dash", ""))
	if len(got) != 1 || got["theme"] != "light" {
		t.Fatalf("instance 2 list = %v, want only its own key", got)
	}
}

func TestPageKVGates(t *testing.T) {
	newPageKVTestDB(t)
	cases := []struct {
		name   string
		method string
		target string
		body   string
		want   int
	}{
		{"disabled page 403s", "GET", "/api/instance-pages/kv?instance_id=2&page_slug=files", "", 403},
		{"empty config 403s", "GET", "/api/instance-pages/kv?instance_id=3&page_slug=dash", "", 403},
		{"unknown instance 404s", "GET", "/api/instance-pages/kv?instance_id=999&page_slug=dash", "", 404},
		{"missing scope 400s", "GET", "/api/instance-pages/kv?page_slug=dash", "", 400},
		{"undeclared sub-page 403s", "PUT", "/api/instance-pages/kv?instance_id=1&page_slug=files/evil", `{"k":"a","v":"b"}`, 403},
		{"disabled page PUT 403s", "PUT", "/api/instance-pages/kv?instance_id=2&page_slug=files", `{"k":"a","v":"b"}`, 403},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := kvRequest(t, tc.method, tc.target, tc.body)
			if w.Code != tc.want {
				t.Fatalf("got %d (%s), want %d", w.Code, strings.TrimSpace(w.Body.String()), tc.want)
			}
		})
	}
}

// ---- upsert / delete round-trip ---------------------------------------------

func TestPageKVUpsertRoundTrip(t *testing.T) {
	newPageKVTestDB(t)
	put := func(target, body string) *httptest.ResponseRecorder {
		return kvRequest(t, "PUT", target, body)
	}
	const scope = "/api/instance-pages/kv?instance_id=1&page_slug=dash"
	if w := put(scope, `{"k":"theme","v":"dark"}`); w.Code != 200 {
		t.Fatalf("put: %d %s", w.Code, w.Body.String())
	}
	if got := kvEntries(t, kvRequest(t, "GET", scope, "")); got["theme"] != "dark" {
		t.Fatalf("after put, list = %v", got)
	}
	// Update the same key (must not count against the quota).
	if w := put(scope, `{"k":"theme","v":"light"}`); w.Code != 200 {
		t.Fatalf("re-put: %d %s", w.Code, w.Body.String())
	}
	if got := kvEntries(t, kvRequest(t, "GET", scope, "")); got["theme"] != "light" {
		t.Fatalf("after re-put, list = %v", got)
	}
	// Delete is idempotent and effective.
	if w := kvRequest(t, "DELETE", scope+"&k=theme", ""); w.Code != 200 {
		t.Fatalf("delete: %d %s", w.Code, w.Body.String())
	}
	if got := kvEntries(t, kvRequest(t, "GET", scope, "")); len(got) != 0 {
		t.Fatalf("after delete, list = %v, want empty", got)
	}
	if w := kvRequest(t, "DELETE", scope+"&k=theme", ""); w.Code != 200 {
		t.Fatalf("second delete (idempotent) must stay 200, got %d", w.Code)
	}
}

func TestPageKVRejectsBadInput(t *testing.T) {
	newPageKVTestDB(t)
	const scope = "/api/instance-pages/kv?instance_id=1&page_slug=dash"
	cases := []struct {
		name   string
		method string
		target string
		body   string
	}{
		{"extra field (mass assignment)", "PUT", scope, `{"k":"a","v":"b","instance_id":2}`},
		{"unknown field", "PUT", scope, `{"k":"a","v":"b","zzz":1}`},
		{"missing v", "PUT", scope, `{"k":"a"}`},
		{"non-string v", "PUT", scope, `{"k":"a","v":42}`},
		{"bad key charset", "PUT", scope, `{"k":"a/b","v":"b"}`},
		{"empty key", "PUT", scope, `{"k":"","v":"b"}`},
		{"oversize value", "PUT", scope, fmt.Sprintf(`{"k":"a","v":%q}`, strings.Repeat("v", 64*1024+1))},
		{"garbage body", "PUT", scope, `not json`},
		{"delete bad key", "DELETE", scope + "&k=a/b", ""},
		{"delete missing k", "DELETE", scope, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if w := kvRequest(t, tc.method, tc.target, tc.body); w.Code != 400 {
				t.Fatalf("got %d (%s), want 400", w.Code, strings.TrimSpace(w.Body.String()))
			}
		})
	}
}

// ---- quota -------------------------------------------------------------------

func TestPageKVQuotaCaps(t *testing.T) {
	db := newPageKVTestDB(t)
	repoSeed := func() {
		for i := 0; i < 100; i++ {
			if _, err := db.Exec(`INSERT INTO page_kv (instance_id, page_slug, k, v, updated_at) VALUES (1, 'dash', ?, 'x', '2026-09-11 00:00:00')`,
				fmt.Sprintf("k%03d", i)); err != nil {
				t.Fatalf("fill: %v", err)
			}
		}
	}
	repoSeed()
	const scope = "/api/instance-pages/kv?instance_id=1&page_slug=dash"
	// 101st distinct key is rejected.
	if w := kvRequest(t, "PUT", scope, `{"k":"one-too-many","v":"x"}`); w.Code != 400 {
		t.Fatalf("101st key: got %d, want 400", w.Code)
	} else if !strings.Contains(w.Body.String(), "quota") {
		t.Fatalf("quota error must say so, got %q", w.Body.String())
	}
	// Updating an existing key at the cap still works (no growth).
	if w := kvRequest(t, "PUT", scope, `{"k":"k000","v":"updated"}`); w.Code != 200 {
		t.Fatalf("update at cap: got %d, want 200", w.Code)
	}
	// Freeing a slot re-opens inserts.
	if w := kvRequest(t, "DELETE", scope+"&k=k001", ""); w.Code != 200 {
		t.Fatalf("delete: %d", w.Code)
	}
	if w := kvRequest(t, "PUT", scope, `{"k":"fresh","v":"x"}`); w.Code != 200 {
		t.Fatalf("insert after free: got %d, want 200", w.Code)
	}
}

// ---- sub-page family sharing ---------------------------------------------------

func TestPageKVSubPageSharesFamily(t *testing.T) {
	newPageKVTestDB(t)
	const sub = "/api/instance-pages/kv?instance_id=1&page_slug=files/edit"
	// Declared sub-page resolves through its enabled parent row.
	if w := kvRequest(t, "PUT", sub, `{"k":"tab","v":"editor"}`); w.Code != 200 {
		t.Fatalf("sub-page put: %d %s", w.Code, w.Body.String())
	}
	if got := kvEntries(t, kvRequest(t, "GET", sub, "")); got["tab"] != "editor" {
		t.Fatalf("sub-page list = %v", got)
	}
	// Namespaces stay per stamped slug: the parent slug does not see the
	// sub-page's keys (auth is shared, storage is not).
	if got := kvEntries(t, kvRequest(t, "GET", "/api/instance-pages/kv?instance_id=1&page_slug=files", "")); len(got) != 0 {
		t.Fatalf("parent list = %v, want empty (sub-page keys stay under files/edit)", got)
	}
}
