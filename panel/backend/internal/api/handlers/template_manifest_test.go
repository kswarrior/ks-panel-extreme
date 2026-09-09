package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/repository"
	_ "modernc.org/sqlite"
)

func TestDecodeTemplateManifestJSON(t *testing.T) {
	raw := []byte(`{"name":"mc","kind":"docker","image":"eclipse-temurin:21-jre","spec":{"env":[{"name":"MAX_MEM","default":"2G"}],"install":[{"action":"shell","command":"java -jar server.jar"}]}}`)
	m, err := decodeTemplateManifest(raw)
	if err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
	if m["name"] != "mc" || m["kind"] != "docker" {
		t.Fatalf("meta mismatch: %#v", m)
	}
	spec, ok := m["spec"].(map[string]any)
	if !ok {
		t.Fatalf("spec not an object: %#v", m["spec"])
	}
	env, ok := spec["env"].([]any)
	if !ok || len(env) != 1 {
		t.Fatalf("spec.env mismatch: %#v", spec["env"])
	}
}

func TestDecodeTemplateManifestYAML(t *testing.T) {
	raw := []byte(`# a hand-authored template
name: mc-yaml
kind: docker
image: "eclipse-temurin:21-jre"
description: "yaml template"
spec:
  env:
    - name: MAX_MEM
      default: "2G"
      options_list:
        - { label: "2 GB", value: "2G" }
  install:
    - action: shell
      command: |
        if [ ! -f server.jar ]; then
          curl -fsSLO https://example.com/server.jar
        fi
        java -Xmx{{MAX_MEM}} -jar server.jar nogui
`)
	m, err := decodeTemplateManifest(raw)
	if err != nil {
		t.Fatalf("decode YAML: %v", err)
	}
	if m["name"] != "mc-yaml" || m["kind"] != "docker" {
		t.Fatalf("meta mismatch: %#v", m)
	}
	spec, ok := m["spec"].(map[string]any)
	if !ok {
		t.Fatalf("spec not an object: %#v", m["spec"])
	}
	install, ok := spec["install"].([]any)
	if !ok || len(install) != 1 {
		t.Fatalf("spec.install mismatch: %#v", spec["install"])
	}
	step, ok := install[0].(map[string]any)
	if !ok || step["action"] != "shell" {
		t.Fatalf("install step mismatch: %#v", install[0])
	}
	cmd, _ := step["command"].(string)
	if !strings.Contains(cmd, "curl -fsSLO https://example.com/server.jar\n") {
		t.Fatalf("literal-block newlines lost: %q", cmd)
	}
	env, ok := spec["env"].([]any)
	if !ok || len(env) != 1 {
		t.Fatalf("spec.env mismatch: %#v", spec["env"])
	}
	em, ok := env[0].(map[string]any)
	if !ok || em["default"] != "2G" {
		t.Fatalf("env entry mismatch: %#v", env[0])
	}
	opts, ok := em["options_list"].([]any)
	if !ok || len(opts) != 1 {
		t.Fatalf("options_list mismatch: %#v", em["options_list"])
	}
}

func TestDecodeTemplateManifestRejectsGarbage(t *testing.T) {
	if _, err := decodeTemplateManifest([]byte("\t: : : not a manifest : :")); err == nil {
		t.Fatal("expected error for malformed input")
	} else if !strings.Contains(err.Error(), "YAML") {
		t.Fatalf("error should name the formats: %v", err)
	}
	if _, err := decodeTemplateManifest([]byte("")); err == nil {
		t.Fatal("expected error for empty input")
	}
}

// templateUploadTestDB points repository.OpenDB at a temp sqlite file carrying
// just the templates table — the upload handler opens its own connection, so
// the table must exist on disk, not in :memory:.
func templateUploadTestDB(t *testing.T) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "templates.db")
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	ddl, err := os.ReadFile("../../db/migrations/sqlite/006_templates.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := db.Exec(string(ddl)); err != nil {
		t.Fatalf("create templates table: %v", err)
	}
	// Migration 059 widened the row (upload path writes icon/color).
	for _, alter := range []string{
		`ALTER TABLE templates ADD COLUMN icon TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE templates ADD COLUMN color TEXT NOT NULL DEFAULT ''`,
	} {
		if _, err := db.Exec(alter); err != nil {
			t.Fatalf("alter templates table: %v", err)
		}
	}
	// Get() resolves the owner name with a users subquery.
	if _, err := db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL DEFAULT '')`); err != nil {
		t.Fatalf("create users table: %v", err)
	}
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", "")
}

func postTemplateManifest(t *testing.T, filename, content string) *httptest.ResponseRecorder {
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
	req := httptest.NewRequest(http.MethodPost, "/api/templates/", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rr := httptest.NewRecorder()
	handleTemplateFileUpload(rr, req)
	return rr
}

func TestUploadTemplateFileYAML(t *testing.T) {
	templateUploadTestDB(t)
	rr := postTemplateManifest(t, "minecraft.yaml", "name: mc-yaml-up\nkind: docker\nimage: \"eclipse-temurin:21-jre\"\n\ndescription: \"yaml upload\"\n\nspec:\n  install:\n    - action: shell\n      command: |\n        curl -fsSLO https://example.com/server.jar\n        java -jar server.jar nogui\n")
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d, body: %s", rr.Code, rr.Body.String())
	}
	var got struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.ID == 0 {
		t.Fatalf("missing id: %s", rr.Body.String())
	}
	con, err := repository.OpenDB()
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer con.Close()
	tmpl, err := repository.NewTemplateRepository(con).Get(got.ID)
	if err != nil || tmpl == nil {
		t.Fatalf("read back template: %v", err)
	}
	if !strings.Contains(tmpl.Spec, "curl -fsSLO") {
		t.Fatalf("stored spec lost YAML values: %s", tmpl.Spec)
	}
}

func TestUploadTemplateFileJSONStillWorks(t *testing.T) {
	templateUploadTestDB(t)
	rr := postTemplateManifest(t, "minecraft.json", `{"name":"mc-json-up","kind":"docker","image":"eclipse-temurin:21-jre","spec":{"install":[{"action":"shell","command":"java -jar server.jar"}]}}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d, body: %s", rr.Code, rr.Body.String())
	}
}
