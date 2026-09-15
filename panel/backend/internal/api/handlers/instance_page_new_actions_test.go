package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)

// ---- validatePageActions: new edge action types ----------------------------
// Valid definitions for every new type must pass (alongside the legacy
// types, which stay permissive so older pages keep loading).

func TestValidatePageActionsNewTypesValid(t *testing.T) {
	raw := `[
		{"name":"s","type":"stat","path":"/data/server.properties"},
		{"name":"c","type":"chmod","path":"/data/server.properties","mode":"0644"},
		{"name":"a","type":"archive","path":"/data/world","names":["level.dat","playerdata"],"dest":"/tmp/world.tar.gz"},
		{"name":"a2","type":"archive","path":"/data/world","dest":"/tmp/world.zip"},
		{"name":"e","type":"extract","path":"/tmp/world.zip","dest":"/data/restored"},
		{"name":"e2","type":"extract","path":"/tmp/world.tar.gz"},
		{"name":"old","type":"shell","command":"echo hi"}
	]`
	if err := validatePageActions(raw); err != nil {
		t.Fatalf("valid new-type defs must pass, got %v", err)
	}
}

func TestValidatePageActionsMissingFields(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"stat-no-path", `[{"name":"s","type":"stat"}]`},
		{"stat-empty-path", `[{"name":"s","type":"stat","path":""}]`},
		{"chmod-no-path", `[{"name":"c","type":"chmod","mode":"0644"}]`},
		{"chmod-no-mode", `[{"name":"c","type":"chmod","path":"/data/x"}]`},
		{"archive-no-path", `[{"name":"a","type":"archive","dest":"/tmp/a.zip"}]`},
		{"archive-no-dest", `[{"name":"a","type":"archive","path":"/data/world"}]`},
		{"archive-bad-dest-ext", `[{"name":"a","type":"archive","path":"/data/world","dest":"/tmp/a.bin"}]`},
		{"extract-no-path", `[{"name":"e","type":"extract"}]`},
		{"extract-bad-path-ext", `[{"name":"e","type":"extract","path":"/tmp/a.bin"}]`},
		{"missing-name", `[{"type":"stat","path":"/data/x"}]`},
		{"unknown-type", `[{"name":"x","type":"teleport","path":"/data/x"}]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := validatePageActions(tc.raw); err == nil {
				t.Fatal("expected rejection, got nil error")
			}
		})
	}
}

func TestValidatePageActionsModeStrictness(t *testing.T) {
	valid := []string{"644", "0755", "0644", "777", "0000", "0777"}
	for _, m := range valid {
		raw := `[{"name":"c","type":"chmod","path":"/data/x","mode":"` + m + `"}]`
		if err := validatePageActions(raw); err != nil {
			t.Errorf("mode %q should pass, got %v", m, err)
		}
	}
	// "7777" passes the ^[0-7]{3,4}$ charset but exceeds the 0o777
	// setuid/setgid/sticky-bit cap, so it must still fail.
	invalid := []string{"", "abc", "999", "888", "89", "7555", "7777", "1755", "06444", "64", "0o644", "-644", "644 "}
	for _, m := range invalid {
		raw := `[{"name":"c","type":"chmod","path":"/data/x","mode":"` + m + `"}]`
		if err := validatePageActions(raw); err == nil {
			t.Errorf("mode %q should be rejected", m)
		}
	}
}

func TestValidatePageActionsArchiveNamesJail(t *testing.T) {
	// Traversal outside the source dir must fail the definition closed.
	bad := []string{"../escape", "..", ".", "/", "", "/abs/path", "a/../../escape", "a/../.."}
	for _, n := range bad {
		raw := `[{"name":"a","type":"archive","path":"/data/world","names":["level.dat","` + n + `"],"dest":"/tmp/a.zip"}]`
		if err := validatePageActions(raw); err == nil {
			t.Errorf("archive entry %q should be rejected", n)
		}
	}
	// Non-string names must fail closed (never partially forwarded).
	if err := validatePageActions(`[{"name":"a","type":"archive","path":"/data/world","names":["ok",42],"dest":"/tmp/a.zip"}]`); err == nil {
		t.Fatal("non-string archive entry must be rejected")
	}
}

func TestValidatePageActionsOversize(t *testing.T) {
	// 1001 names exceeds the maxPageActionNames cap.
	var sb strings.Builder
	sb.WriteString(`[{"name":"a","type":"archive","path":"/data/world","names":[`)
	for i := 0; i < 1001; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`"f`)
		sb.WriteString(strings.Repeat("a", 3))
		sb.WriteString(`"`)
	}
	sb.WriteString(`],"dest":"/tmp/a.zip"}]`)
	if err := validatePageActions(sb.String()); err == nil {
		t.Fatal("more than maxPageActionNames entries must be rejected")
	}
	// Absurd path lengths are rejected.
	long := strings.Repeat("a", maxPageActionPathLen+1)
	if err := validatePageActions(`[{"name":"s","type":"stat","path":"/` + long + `"}]`); err == nil {
		t.Fatal("oversize path must be rejected")
	}
	// NUL bytes are rejected.
	if err := validatePageActions("[{\"name\":\"s\",\"type\":\"stat\",\"path\":\"/data/x\x00y\"}]"); err == nil {
		t.Fatal("NUL-byte path must be rejected")
	}
}

// ---- validateInstancePage wiring -------------------------------------------
// The save gate must enforce the new shape (not just the helper above).

func TestValidateInstancePageNewActionTypes(t *testing.T) {
	good := instancePageDTO{
		Name:    "P",
		Slug:    "p",
		Kind:    "custom",
		Actions: `[{"name":"s","type":"stat","path":"/data/x"}]`,
	}
	if _, err := validateInstancePage(good); err != nil {
		t.Fatalf("valid stat action must save, got %v", err)
	}
	bad := instancePageDTO{
		Name:    "P",
		Slug:    "p",
		Kind:    "custom",
		Actions: `[{"name":"c","type":"chmod","path":"/data/x"}]`,
	}
	if _, err := validateInstancePage(bad); err == nil {
		t.Fatal("chmod without mode must fail the save gate")
	}
	huge := instancePageDTO{
		Name:    "P",
		Slug:    "p",
		Kind:    "custom",
		Actions: `[{"name":"x","type":"shell","command":"` + strings.Repeat("a", maxInstancePageActionsBytes) + `"}]`,
	}
	if _, err := validateInstancePage(huge); err == nil {
		t.Fatal("oversize actions JSON must fail the save gate")
	}
}

// ---- savedActionMatches: new executable fields are pinned ------------------
// A swapped mode/names/dest must NOT match (the mismatch is what the three
// execute handlers turn into a 403 "action is not defined on this page").

func TestSavedActionMatchesNewFields(t *testing.T) {
	statDef := map[string]any{"type": "stat", "path": "/data/x"}
	if !savedActionMatches(statDef, "stat", "", "/data/x", "", nil, nil, "", nil, "") {
		t.Fatal("exact stat payload must match")
	}
	chmodDef := map[string]any{"type": "chmod", "path": "/data/x", "mode": "0644"}
	if !savedActionMatches(chmodDef, "chmod", "", "/data/x", "", nil, nil, "0644", nil, "") {
		t.Fatal("exact chmod payload must match")
	}
	if savedActionMatches(chmodDef, "chmod", "", "/data/x", "", nil, nil, "0755", nil, "") {
		t.Fatal("swapped chmod mode must not match (allow-list bypass)")
	}
	archiveDef := map[string]any{
		"type": "archive", "path": "/data/world",
		"names": []any{"level.dat"}, "dest": "/tmp/a.zip",
	}
	if !savedActionMatches(archiveDef, "archive", "", "/data/world", "", nil, nil, "", []string{"level.dat"}, "/tmp/a.zip") {
		t.Fatal("exact archive payload must match")
	}
	if savedActionMatches(archiveDef, "archive", "", "/data/world", "", nil, nil, "", []string{"other.dat"}, "/tmp/a.zip") {
		t.Fatal("swapped archive names must not match (allow-list bypass)")
	}
	if savedActionMatches(archiveDef, "archive", "", "/data/world", "", nil, nil, "", []string{"level.dat"}, "/tmp/b.zip") {
		t.Fatal("swapped archive dest must not match (allow-list bypass)")
	}
	extractDef := map[string]any{"type": "extract", "path": "/tmp/a.zip", "dest": "/data/r"}
	if savedActionMatches(extractDef, "extract", "", "/tmp/a.zip", "", nil, nil, "", nil, "/data/other") {
		t.Fatal("swapped extract dest must not match (allow-list bypass)")
	}
}

// ---- savedActionExecFields: new fields round-trip, malformed fails closed --

func TestSavedActionExecFieldsNewTypes(t *testing.T) {
	def := map[string]any{
		"type": "archive", "path": "/data/world",
		"names": []any{"a", "b"}, "dest": "/tmp/a.tar.gz",
	}
	typ, _, execPath, _, _, _, mode, names, dest, _, ok := savedActionExecFields(def)
	if !ok || typ != "archive" || execPath != "/data/world" || mode != "" {
		t.Fatalf("archive exec fields wrong: typ=%q path=%q mode=%q ok=%v", typ, execPath, mode, ok)
	}
	if len(names) != 2 || names[0] != "a" || dest != "/tmp/a.tar.gz" {
		t.Fatalf("names/dest lost: %v %q", names, dest)
	}
	bad := map[string]any{"type": "extract", "path": "/tmp/a.zip", "names": []any{"ok", 42}}
	if _, _, _, _, _, _, _, _, _, _, ok := savedActionExecFields(bad); ok {
		t.Fatal("non-string names must fail closed")
	}
	if _, _, _, _, _, _, _, _, _, _, ok := savedActionExecFields(map[string]any{"type": "teleport"}); ok {
		t.Fatal("unknown type must fail closed")
	}
}

// ---- resolveExecPayload: new types never accept runtime extras -------------

func TestResolveExecPayloadNewTypesRejectExtras(t *testing.T) {
	for _, typ := range []string{"stat", "chmod", "archive", "extract", "read_file", "write_file", "list_files"} {
		def := map[string]any{"type": typ, "open_args": true}
		if _, _, err := resolveExecPayload(def, typ, "", nil, []string{"extra"}); err == nil {
			t.Errorf("%s with open_args must still reject runtime extras", typ)
		}
	}
}

// ---- handler-level repro scaffolding (Wave 1, Agent C) ----------------------
// Temp file DB carrying exactly the columns the instance-page / template /
// panel-page repositories touch, wired through KSPANEL_DB* so handler
// OpenDB() calls land on it. Returns an open seeding handle.

func newInstancePageScopeTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "scope.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	for i, s := range []string{
		`CREATE TABLE instance_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
			kind TEXT NOT NULL DEFAULT 'custom', category TEXT NOT NULL DEFAULT '', page_type TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'markdown',
			content_html TEXT NOT NULL DEFAULT '', content_markdown TEXT NOT NULL DEFAULT '', content_blocks TEXT NOT NULL DEFAULT '',
			icon_svg TEXT NOT NULL DEFAULT '', icon_color TEXT NOT NULL DEFAULT '', actions TEXT NOT NULL DEFAULT '',
			sub_pages TEXT NOT NULL DEFAULT '', components TEXT NOT NULL DEFAULT '', configure TEXT NOT NULL DEFAULT '',
			source_tsx TEXT, bundle_js TEXT, bundle_css TEXT, build_status VARCHAR(16) NOT NULL DEFAULT '', build_log TEXT,
			owner_id INTEGER, source TEXT NOT NULL DEFAULT 'studio', market_id TEXT NOT NULL DEFAULT '', market_version TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', spec TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL DEFAULT '', owner_id INTEGER,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE panel_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
			icon_svg TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'markdown', content TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1, roles TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		// Repositories LEFT-JOIN users for owner names — a bare table keeps
		// those selects working without seeding any accounts.
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL DEFAULT '')`,
	} {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup stmt %d: %v", i, err)
		}
	}
	return db
}

func withChiIDParam(r *http.Request, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// Linking a page must only touch spec.pages — the template's own icon/color
// must survive the rewrite.
func TestLinkPreservesTemplateIconColor(t *testing.T) {
	db := newInstancePageScopeTestDB(t)
	if _, err := db.Exec(`INSERT INTO instance_pages (name, slug, kind, content_type) VALUES ('Files','files','custom','html')`); err != nil {
		t.Fatalf("seed page: %v", err)
	}
	spec := "pages: []\n"
	if _, err := db.Exec(`INSERT INTO templates (name, description, kind, image, spec, icon, color) VALUES ('T','d','docker','img',?, '<svg></svg>', '#FF0000')`, spec); err != nil {
		t.Fatalf("seed template: %v", err)
	}
	r := httptest.NewRequest("POST", "/api/instance-pages/1/link", strings.NewReader(`{"template_ids":[1]}`))
	r = withChiIDParam(r, "1")
	w := httptest.NewRecorder()
	LinkInstancePageHandler(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("link: got %d (%s), want 200", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var icon, color string
	if err := db.QueryRow(`SELECT icon, color FROM templates WHERE id = 1`).Scan(&icon, &color); err != nil {
		t.Fatalf("re-read template: %v", err)
	}
	if icon != "<svg></svg>" || color != "#FF0000" {
		t.Fatalf("link wiped template identity: icon=%q color=%q, want originals", icon, color)
	}
	var got struct {
		Linked  []int64 `json:"linked"`
		Skipped []int64 `json:"skipped"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode link response: %v", err)
	}
	if len(got.Linked) != 1 || got.Linked[0] != 1 {
		t.Fatalf("linked = %v, want [1]", got.Linked)
	}
}

// A template whose stored spec no longer parses must be skipped, never
// rewritten with a pages-only skeleton (fail closed, no silent data loss).
func TestLinkSkipsCorruptTemplateSpec(t *testing.T) {
	db := newInstancePageScopeTestDB(t)
	if _, err := db.Exec(`INSERT INTO instance_pages (name, slug, kind, content_type) VALUES ('Files','files','custom','html')`); err != nil {
		t.Fatalf("seed page: %v", err)
	}
	const corrupt = "- just\n- a\n- list\n"
	if _, err := db.Exec(`INSERT INTO templates (name, spec) VALUES ('Broken', ?)`, corrupt); err != nil {
		t.Fatalf("seed template: %v", err)
	}
	r := httptest.NewRequest("POST", "/api/instance-pages/1/link", strings.NewReader(`{"template_ids":[1]}`))
	r = withChiIDParam(r, "1")
	w := httptest.NewRecorder()
	LinkInstancePageHandler(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("link: got %d (%s), want 200", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var got struct {
		Linked  []int64 `json:"linked"`
		Skipped []int64 `json:"skipped"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode link response: %v", err)
	}
	if len(got.Linked) != 0 || len(got.Skipped) != 1 || got.Skipped[0] != 1 {
		t.Fatalf("corrupt spec must be skipped: linked=%v skipped=%v", got.Linked, got.Skipped)
	}
	var after string
	if err := db.QueryRow(`SELECT spec FROM templates WHERE id = 1`).Scan(&after); err != nil {
		t.Fatalf("re-read template: %v", err)
	}
	if after != corrupt {
		t.Fatalf("corrupt spec was rewritten: %q", after)
	}
}

// Panel-page update of a missing id must 404 (mirrors the instance-page
// update handler), not 400.
func TestUpdatePanelPageNotFound404(t *testing.T) {
	newInstancePageScopeTestDB(t)
	r := httptest.NewRequest("PUT", "/api/panel-pages/999", strings.NewReader(`{"slug":"about","name":"About"}`))
	r = withChiIDParam(r, "999")
	w := httptest.NewRecorder()
	UpdatePanelPageHandler(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("update missing panel page: got %d (%s), want 404", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

// Panel-page slug conflicts must 409 (mirrors instance-page create/update),
// not 400, so callers can distinguish "taken" from "invalid".
func TestCreatePanelPageConflict409(t *testing.T) {
	newInstancePageScopeTestDB(t)
	body := `{"slug":"about","name":"About","content_type":"markdown","content":"hi"}`
	r1 := httptest.NewRequest("POST", "/api/panel-pages/", strings.NewReader(body))
	w1 := httptest.NewRecorder()
	CreatePanelPageHandler(w1, r1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("first create: got %d (%s), want 201", w1.Code, strings.TrimSpace(w1.Body.String()))
	}
	r2 := httptest.NewRequest("POST", "/api/panel-pages/", strings.NewReader(body))
	w2 := httptest.NewRecorder()
	CreatePanelPageHandler(w2, r2)
	if w2.Code != http.StatusConflict {
		t.Fatalf("duplicate slug: got %d (%s), want 409", w2.Code, strings.TrimSpace(w2.Body.String()))
	}
}

// ---- F1: Link OWN authz ----------------------------------------------------
// Own without All may only link pages they authored; чужой pages 403.
// Bulk mixed template_ids still report linked/skipped per row.

func newLinkOwnTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "linkown.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	for i, s := range []string{
		`CREATE TABLE instance_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
			kind TEXT NOT NULL DEFAULT 'custom', category TEXT NOT NULL DEFAULT '', page_type TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'markdown',
			content_html TEXT NOT NULL DEFAULT '', content_markdown TEXT NOT NULL DEFAULT '', content_blocks TEXT NOT NULL DEFAULT '',
			icon_svg TEXT NOT NULL DEFAULT '', icon_color TEXT NOT NULL DEFAULT '', actions TEXT NOT NULL DEFAULT '',
			sub_pages TEXT NOT NULL DEFAULT '', components TEXT NOT NULL DEFAULT '', configure TEXT NOT NULL DEFAULT '',
			source_tsx TEXT, bundle_js TEXT, bundle_css TEXT, build_status VARCHAR(16) NOT NULL DEFAULT '', build_log TEXT,
			owner_id INTEGER, source TEXT NOT NULL DEFAULT 'studio', market_id TEXT NOT NULL DEFAULT '', market_version TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', spec TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL DEFAULT '', owner_id INTEGER,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE panel_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
			icon_svg TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT 'markdown', content TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1, roles TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`,
		`CREATE TABLE permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE)`,
		`CREATE TABLE role_permissions (role_id INTEGER NOT NULL, permission_id INTEGER NOT NULL, PRIMARY KEY (role_id, permission_id))`,
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL DEFAULT '', role_id INTEGER NOT NULL DEFAULT 1)`,
	} {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup stmt %d: %v", i, err)
		}
	}
	// Roles: 1 = own-only, 2 = all. Users: 10 = owner-alice (own), 11 = bob (own, different owner).
	for _, s := range []string{
		`INSERT INTO roles (id, name) VALUES (1, 'own-role'), (2, 'all-role')`,
		`INSERT INTO permissions (id, key) VALUES (1, 'INSTANCE_PAGES_OWN'), (2, 'INSTANCE_PAGES_ALL'), (3, 'MANAGE_INSTANCE_PAGES')`,
		`INSERT INTO role_permissions (role_id, permission_id) VALUES (1, 1)`,
		`INSERT INTO users (id, username, role_id) VALUES (10, 'alice', 1), (11, 'bob', 1), (12, 'admin', 2)`,
		`INSERT INTO role_permissions (role_id, permission_id) VALUES (2, 2)`,
		`INSERT INTO instance_pages (id, name, slug, kind, content_type, owner_id) VALUES (1, 'Own Page', 'own-page', 'custom', 'html', 10)`,
		`INSERT INTO instance_pages (id, name, slug, kind, content_type, owner_id) VALUES (2, 'Bob Page', 'bob-page', 'custom', 'html', 11)`,
		`INSERT INTO templates (id, name, spec) VALUES (1, 'T1', 'pages: []'), (2, 'T2', 'pages: []')`,
	} {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("seed: %v (%s)", err, s)
		}
	}
	return db
}

func linkReqWithUser(pageID string, body string, uid int64) (*httptest.ResponseRecorder, *http.Request) {
	r := httptest.NewRequest("POST", "/api/instance-pages/"+pageID+"/link", strings.NewReader(body))
	r = withChiIDParam(r, pageID)
	if uid != 0 {
		r = r.WithContext(context.WithValue(r.Context(), UserIDKey, uid))
	}
	w := httptest.NewRecorder()
	LinkInstancePageHandler(w, r)
	return w, r
}

func TestLinkOwnScopeOwnerOwnOk(t *testing.T) {
	newLinkOwnTestDB(t)
	w, _ := linkReqWithUser("1", `{"template_ids":[1]}`, 10)
	if w.Code != http.StatusOK {
		t.Fatalf("owner linking own page: got %d (%s), want 200", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

func TestLinkOwnScopeForeign403(t *testing.T) {
	newLinkOwnTestDB(t)
	// alice (10, Own) linking bob's page (owner 11) must 403.
	w, _ := linkReqWithUser("2", `{"template_ids":[1]}`, 10)
	if w.Code != http.StatusForbidden {
		t.Fatalf("own-scope linking чужой page: got %d (%s), want 403", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

func TestLinkBulkMixedLinkedSkipped(t *testing.T) {
	newLinkOwnTestDB(t)
	// Mixed: template 1 exists, 999 does not → linked=[1], skipped=[999].
	w, _ := linkReqWithUser("1", `{"template_ids":[1,999]}`, 10)
	if w.Code != http.StatusOK {
		t.Fatalf("bulk link: got %d (%s), want 200", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var got struct {
		Linked  []int64 `json:"linked"`
		Skipped []int64 `json:"skipped"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode bulk link response: %v", err)
	}
	if len(got.Linked) != 1 || got.Linked[0] != 1 {
		t.Fatalf("linked = %v, want [1]", got.Linked)
	}
	if len(got.Skipped) != 1 || got.Skipped[0] != 999 {
		t.Fatalf("skipped = %v, want [999]", got.Skipped)
	}
}

func TestBulkCreateOwnScopeMixed(t *testing.T) {
	newLinkOwnTestDB(t)
	// Own user bulk-creates: 1 valid + 1 duplicate (own-page slug) + 1 invalid.
	body := `{"pages":[
		{"name":"Bulk A","slug":"bulk-a","kind":"custom"},
		{"name":"Dup","slug":"own-page","kind":"custom"},
		{"name":"","slug":"bad","kind":"custom"}
	]}`
	r := httptest.NewRequest("POST", "/api/instance-pages/bulk", strings.NewReader(body))
	r = r.WithContext(context.WithValue(r.Context(), UserIDKey, int64(10)))
	w := httptest.NewRecorder()
	BulkCreateInstancePagesHandler(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("bulk create own: got %d (%s), want 200", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var got struct {
		Imported int      `json:"imported"`
		Skipped  int      `json:"skipped"`
		Errors   []string `json:"errors"`
		IDs      []int64  `json:"ids"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode bulk response: %v", err)
	}
	if got.Imported != 1 || got.Skipped != 1 || len(got.Errors) != 1 {
		t.Fatalf("bulk mixed = %+v, want imported=1 skipped=1 errors=1", got)
	}
}
