package handlers

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"

	kdb "github.com/example/kspanel/internal/db"
	_ "modernc.org/sqlite"
)

// newModSettingsHandlerTestDB mirrors newEdgeConfigTestDB: a temp sqlite file
// with the full migrated schema.
func newModSettingsHandlerTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "modsettings-handler.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	d, err := kdb.NewDialect("sqlite")
	if err != nil {
		t.Fatalf("dialect: %v", err)
	}
	con, err := d.Open(p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { con.Close() })
	if err := kdb.RunMigrations(d, con); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return con
}

// settingsHandlerRequest builds a request routed through chi so URLParam("id")
// resolves, carrying a user id like the auth middleware would.
func settingsHandlerRequest(method, id, body string) *http.Request {
	var rdr *strings.Reader
	if body == "" {
		rdr = strings.NewReader("")
	} else {
		rdr = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, "/api/mods/"+id+"/settings", rdr)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), UserIDKey, int64(1)))
	return req
}

// TestModSettingsHandlerRoundTrip proves the M8 API contract end to end:
// GET returns the declared schema with masked secrets, PUT validates against
// the schema (type errors + unknown keys are 400 with no partial writes),
// empty secrets are a no-op, empty non-secrets clear, and the secret lands in
// the DB sealed.
func TestModSettingsHandlerRoundTrip(t *testing.T) {
	newModSettingsHandlerTestDB(t)
	repo, closeFn := openModRepo()
	if closeFn != nil {
		defer closeFn()
	}
	manifest := json.RawMessage(`{
		"engineVersion": 2,
		"settings": [
			{"key": "greeting", "type": "text", "default": "hi"},
			{"key": "api_key", "type": "password"},
			{"key": "retries", "type": "number"},
			{"key": "region", "type": "select", "options": ["eu", "us"]}
		]
	}`)
	mod, err := repo.CreateMod(repository.CreateModInput{
		Name: "Settings Mod", Slug: "settings-mod", Version: "1.0.0", Manifest: manifest,
	})
	if err != nil {
		t.Fatalf("create mod: %v", err)
	}
	id := mod.ID

	// Load a real Mod (CreateMod may return a lean row; re-read for Manifest).
	mod, err = repo.GetMod(id)
	if err != nil {
		t.Fatalf("get mod: %v", err)
	}

	// GET: schema present, nothing set yet, secrets masked.
	rec := httptest.NewRecorder()
	ModSettingsHandler(rec, settingsHandlerRequest(http.MethodGet, strconv.FormatInt(id, 10), ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET code = %d body=%s", rec.Code, rec.Body.String())
	}
	var got modSettingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("GET decode: %v body=%s", err, rec.Body.String())
	}
	if got.Slug != "settings-mod" || len(got.Settings) != 4 {
		t.Fatalf("GET response = %+v, want slug + 4 settings", got)
	}
	for _, s := range got.Settings {
		if s.IsSet {
			t.Fatalf("GET setting %q is_set=true before any write", s.Key)
		}
		if s.Value != "" {
			t.Fatalf("GET setting %q value=%q, want empty", s.Key, s.Value)
		}
	}

	// PUT: valid values, including a secret.
	rec = httptest.NewRecorder()
	UpdateModSettingsHandler(rec, settingsHandlerRequest(http.MethodPut, strconv.FormatInt(id, 10),
		`{"values":{"greeting":"hello","api_key":"tok-123","retries":"7","region":"eu"}}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT code = %d body=%s", rec.Code, rec.Body.String())
	}
	var putResp modSettingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &putResp); err != nil {
		t.Fatalf("PUT decode: %v body=%s", err, rec.Body.String())
	}
	byKey := map[string]modSettingView{}
	for _, s := range putResp.Settings {
		byKey[s.Key] = s
	}
	if byKey["greeting"].Value != "hello" || !byKey["greeting"].IsSet {
		t.Fatalf("greeting after PUT = %+v", byKey["greeting"])
	}
	if byKey["retries"].Value != "7" || byKey["region"].Value != "eu" {
		t.Fatalf("plain values after PUT = %+v / %+v", byKey["retries"], byKey["region"])
	}
	if !byKey["api_key"].IsSet || byKey["api_key"].Value != "" {
		t.Fatalf("api_key after PUT = %+v, want is_set with masked value", byKey["api_key"])
	}

	// PUT: invalid select option → 400, and nothing in the payload landed.
	rec = httptest.NewRecorder()
	UpdateModSettingsHandler(rec, settingsHandlerRequest(http.MethodPut, strconv.FormatInt(id, 10),
		`{"values":{"region":"apac","greeting":"should-not-land"}}`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("PUT bad select code = %d body=%s", rec.Code, rec.Body.String())
	}
	rec = httptest.NewRecorder()
	ModSettingsHandler(rec, settingsHandlerRequest(http.MethodGet, strconv.FormatInt(id, 10), ""))
	var afterBad modSettingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &afterBad); err != nil {
		t.Fatalf("decode after bad PUT: %v", err)
	}
	for _, s := range afterBad.Settings {
		if s.Key == "greeting" && s.Value != "hello" {
			t.Fatalf("partial write: greeting = %q after rejected payload", s.Value)
		}
		if s.Key == "region" && s.Value != "eu" {
			t.Fatalf("region changed by rejected payload: %q", s.Value)
		}
	}

	// PUT: unknown key → 400; bad number → 400.
	rec = httptest.NewRecorder()
	UpdateModSettingsHandler(rec, settingsHandlerRequest(http.MethodPut, strconv.FormatInt(id, 10), `{"values":{"nope":"x"}}`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("PUT unknown key code = %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	UpdateModSettingsHandler(rec, settingsHandlerRequest(http.MethodPut, strconv.FormatInt(id, 10), `{"values":{"retries":"abc"}}`))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("PUT bad number code = %d", rec.Code)
	}

	// PUT: empty secret is a no-op (still set); empty non-secret clears.
	rec = httptest.NewRecorder()
	UpdateModSettingsHandler(rec, settingsHandlerRequest(http.MethodPut, strconv.FormatInt(id, 10),
		`{"values":{"api_key":"","greeting":""}}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT clear code = %d body=%s", rec.Code, rec.Body.String())
	}
	var clearResp modSettingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &clearResp); err != nil {
		t.Fatalf("decode clear resp: %v", err)
	}
	for _, s := range clearResp.Settings {
		switch s.Key {
		case "api_key":
			if !s.IsSet {
				t.Fatalf("api_key cleared by empty value, want untouched")
			}
		case "greeting":
			if s.IsSet || s.Value != "" {
				t.Fatalf("greeting not cleared: %+v", s)
			}
		}
	}

	// At rest: the secret row is sealed, not the cleartext.
	con, err := repository.OpenDB()
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer con.Close()
	var raw string
	var secretFlag int
	if err := con.QueryRow(
		`SELECT value, is_secret FROM mod_settings WHERE mod_slug = 'settings-mod' AND key = 'api_key'`,
	).Scan(&raw, &secretFlag); err != nil {
		t.Fatalf("raw secret select: %v", err)
	}
	if secretFlag != 1 || strings.Contains(raw, "tok-123") {
		t.Fatalf("secret at rest = (%q, is_secret=%d), want sealed", raw, secretFlag)
	}
	if blob, derr := base64.StdEncoding.DecodeString(raw); derr != nil || string(blob) == "tok-123" {
		t.Fatalf("sealed secret invalid: %v", derr)
	}

	// Error surface: unknown mod id → 404, non-numeric → 400.
	rec = httptest.NewRecorder()
	ModSettingsHandler(rec, settingsHandlerRequest(http.MethodGet, "99999", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET missing mod code = %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	ModSettingsHandler(rec, settingsHandlerRequest(http.MethodGet, "abc", ""))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("GET bad id code = %d", rec.Code)
	}

	// The upload choke point rejects a malformed schema outright.
	if _, err := repo.CreateMod(repository.CreateModInput{
		Name: "Bad Schema", Slug: "bad-schema", Version: "1.0.0",
		Manifest: json.RawMessage(`{"settings":[{"key":"UPPER","type":"text"}]}`),
	}); err == nil {
		t.Fatalf("CreateMod accepted an invalid settings schema")
	}
}
