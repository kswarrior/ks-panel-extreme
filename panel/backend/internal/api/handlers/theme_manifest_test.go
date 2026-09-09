package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)

func TestDecodeThemeManifestJSON(t *testing.T) {
	raw := []byte(`{"id":"midnight-ocean","name":"Midnight Ocean","description":"d","spec":{"card":{"bg":"#fff"},"radius":4}}`)
	m, err := decodeThemeManifest(raw)
	if err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
	if m["id"] != "midnight-ocean" {
		t.Fatalf("id mismatch: %#v", m["id"])
	}
}

func TestDecodeThemeManifestTOML(t *testing.T) {
	raw := []byte("# a theme\nid = \"midnight-ocean\"\nname = \"Midnight Ocean\"\ndescription = \"d\"\n\n[spec.card]\nbg = \"#fff\"\n\n[spec.shape]\nradius = 4\n")
	m, err := decodeThemeManifest(raw)
	if err != nil {
		t.Fatalf("decode TOML: %v", err)
	}
	if m["id"] != "midnight-ocean" || m["name"] != "Midnight Ocean" {
		t.Fatalf("meta mismatch: %#v", m)
	}
	spec, ok := m["spec"].(map[string]any)
	if !ok {
		t.Fatalf("spec not a table: %#v", m["spec"])
	}
	card, ok := spec["card"].(map[string]any)
	if !ok || card["bg"] != "#fff" {
		t.Fatalf("spec.card.bg mismatch: %#v", spec["card"])
	}
}

func TestParseThemeManifestTOML(t *testing.T) {
	raw := []byte("id = \"t1\"\nname = \"T One\"\n\n[spec.button]\nprimary_bg = \"#0284c7\"\n")
	id, name, _, spec, err := parseThemeManifest(raw)
	if err != nil {
		t.Fatalf("parse TOML: %v", err)
	}
	if id != "t1" || name != "T One" {
		t.Fatalf("meta mismatch: %q %q", id, name)
	}
	var specMap map[string]any
	if err := json.Unmarshal(spec, &specMap); err != nil {
		t.Fatalf("stored spec not JSON: %v", err)
	}
	btn, ok := specMap["button"].(map[string]any)
	if !ok || btn["primary_bg"] != "#0284c7" {
		t.Fatalf("spec.button.primary_bg mismatch: %s", spec)
	}
}

func TestDecodeThemeManifestRejectsGarbage(t *testing.T) {
	if _, err := decodeThemeManifest([]byte("id = [unclosed\n")); err == nil {
		t.Fatal("expected error for malformed input")
	} else if !strings.Contains(err.Error(), "TOML") {
		t.Fatalf("error should name the formats: %v", err)
	}
	if _, _, _, _, err := parseThemeManifest([]byte("")); err == nil {
		t.Fatal("expected required-fields error for empty input")
	}
}

// themeUploadTestDB points repository.OpenDB at a temp sqlite file carrying
// just the themes table — the upload handler opens its own connection, so
// the table must exist on disk, not in :memory:.
func themeUploadTestDB(t *testing.T) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "themes.db")
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	ddl, err := os.ReadFile("../../db/migrations/sqlite/015_themes.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := db.Exec(string(ddl)); err != nil {
		t.Fatalf("create themes table: %v", err)
	}
	// Migration 054 widened the row (upload path writes owner_id).
	if _, err := db.Exec(`ALTER TABLE themes ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`); err != nil {
		t.Fatalf("add owner_id: %v", err)
	}
	// The create path re-reads the row with a users join for the owner name.
	if _, err := db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL DEFAULT '')`); err != nil {
		t.Fatalf("create users table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO users (id, username) VALUES (1, 'admin')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", "")
}

func postThemeManifest(t *testing.T, filename, content string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("manifest", filename)
	if err != nil {
		t.Fatalf("form file: %v", err)
	}
	if _, err := fw.Write([]byte(content)); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/themes", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req = req.WithContext(context.WithValue(req.Context(), UserIDKey, int64(1)))
	rr := httptest.NewRecorder()
	handleThemeFileUpload(rr, req)
	return rr
}

func TestUploadThemeFileTOML(t *testing.T) {
	themeUploadTestDB(t)
	rr := postThemeManifest(t, "ocean.toml", "id = \"ocean\"\nname = \"Ocean\"\ndescription = \"toml theme\"\n\n[spec.card]\nbg = \"#001122\"\n")
	if rr.Code != http.StatusCreated {
		t.Fatalf("status %d, body: %s", rr.Code, rr.Body.String())
	}
	var got struct {
		ID   string          `json:"id"`
		Spec json.RawMessage `json:"spec"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.ID != "ocean" {
		t.Fatalf("id mismatch: %s", rr.Body.String())
	}
	var spec map[string]any
	if err := json.Unmarshal(got.Spec, &spec); err != nil {
		t.Fatalf("stored spec not JSON: %v", err)
	}
	card, ok := spec["card"].(map[string]any)
	if !ok || card["bg"] != "#001122" {
		t.Fatalf("stored spec lost TOML values: %s", got.Spec)
	}
}

func TestUploadThemeFileJSONStillWorks(t *testing.T) {
	themeUploadTestDB(t)
	rr := postThemeManifest(t, "ocean.json", `{"id":"ocean-j","name":"Ocean J","spec":{"card":{"bg":"#001122"}}}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("status %d, body: %s", rr.Code, rr.Body.String())
	}
}

// TestDownloadThemeAsTOML proves the download path emits TOML (not JSON)
// that re-parses through the same decodeThemeManifest every ingest path
// uses, with id and spec values intact.
func TestDownloadThemeAsTOML(t *testing.T) {
	themeUploadTestDB(t)
	up := postThemeManifest(t, "ocean.toml", "id = \"ocean-dl\"\nname = \"Ocean DL\"\ndescription = \"dl theme\"\n\n[spec.card]\nbg = \"#001122\"\n")
	if up.Code != http.StatusCreated {
		t.Fatalf("upload status %d, body: %s", up.Code, up.Body.String())
	}
	req := httptest.NewRequest(http.MethodGet, "/api/themes/ocean-dl/download", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "ocean-dl")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()
	DownloadThemeHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("download status %d, body: %s", rr.Code, rr.Body.String())
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/toml" {
		t.Fatalf("Content-Type = %q, want application/toml", ct)
	}
	if cd := rr.Header().Get("Content-Disposition"); !strings.Contains(cd, ".toml") {
		t.Fatalf("Content-Disposition missing .toml filename: %q", cd)
	}
	m, err := decodeThemeManifest(rr.Body.Bytes())
	if err != nil {
		t.Fatalf("downloaded body does not re-parse: %v\n%s", err, rr.Body.String())
	}
	if m["id"] != "ocean-dl" || m["name"] != "Ocean DL" {
		t.Fatalf("meta mismatch: %#v", m)
	}
	spec, ok := m["spec"].(map[string]any)
	if !ok {
		t.Fatalf("spec not a table: %#v", m["spec"])
	}
	card, ok := spec["card"].(map[string]any)
	if !ok || card["bg"] != "#001122" {
		t.Fatalf("spec.card.bg mismatch: %#v", spec["card"])
	}
}
