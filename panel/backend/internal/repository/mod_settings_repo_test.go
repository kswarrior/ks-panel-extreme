package repository

import (
	"database/sql"
	"encoding/base64"
	"path/filepath"
	"strings"
	"testing"

	kdb "github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/models"
	_ "modernc.org/sqlite"
)

// newModSettingsTestDB points OpenDB at a temp sqlite file carrying the full
// migrated schema (mirrors newEdgeConfigTestDB) and seeds one mods row so the
// mod_settings FK is satisfied.
func newModSettingsTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "modsettings.db")
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
	if _, err := con.Exec(
		`INSERT INTO mods (name, slug, version, manifest) VALUES ('Demo Mod', 'demo-mod', '1.0.0', '{}')`,
	); err != nil {
		t.Fatalf("seed mod row: %v", err)
	}
	return con
}

// TestModSettingsRoundTrip proves the full M8 storage contract: plain values
// round-trip in the clear, secret values are sealed at rest (the raw column is
// base64 ciphertext, not the cleartext), List never surfaces secret cleartext,
// Reveal is the only decrypt path, delete is idempotent, and a missing row
// reports found=false.
func TestModSettingsRoundTrip(t *testing.T) {
	con := newModSettingsTestDB(t)
	repo := NewModSettingsRepository()

	if err := repo.Set("demo-mod", "greeting", "hello", false, models.ModSettingScope{}); err != nil {
		t.Fatalf("set plain: %v", err)
	}
	if err := repo.Set("demo-mod", "api_key", "s3cret-token", true, models.ModSettingScope{}); err != nil {
		t.Fatalf("set secret: %v", err)
	}

	// The secret must NOT be at rest in the clear: read the raw column and
	// confirm it is base64 of a sealed blob that differs from the cleartext.
	var raw string
	var secretFlag int
	if err := con.QueryRow(
		`SELECT value, is_secret FROM mod_settings WHERE mod_slug = 'demo-mod' AND key = 'api_key'`,
	).Scan(&raw, &secretFlag); err != nil {
		t.Fatalf("raw select: %v", err)
	}
	if secretFlag != 1 {
		t.Fatalf("is_secret = %d, want 1", secretFlag)
	}
	if raw == "s3cret-token" || strings.Contains(raw, "s3cret-token") {
		t.Fatalf("secret stored in the clear: %q", raw)
	}
	blob, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		t.Fatalf("raw secret is not base64: %v", err)
	}
	if string(blob) == "s3cret-token" {
		t.Fatalf("decoded blob equals the cleartext")
	}

	// List: plain value visible, secret value suppressed.
	rows, err := repo.List("demo-mod", models.ModSettingScope{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("list returned %d rows, want 2", len(rows))
	}
	got := map[string]ModSettingRow{}
	for _, r := range rows {
		got[r.Key] = r
	}
	if r := got["greeting"]; r.IsSecret || r.Value != "hello" {
		t.Fatalf("greeting row = %+v, want plain 'hello'", r)
	}
	if r := got["api_key"]; !r.IsSecret || r.Value != "" {
		t.Fatalf("api_key row = %+v, want secret with empty value", r)
	}

	// Reveal: the only decrypt path.
	v, isSecret, found, err := repo.Reveal("demo-mod", "api_key", models.ModSettingScope{})
	if err != nil || !found || !isSecret || v != "s3cret-token" {
		t.Fatalf("reveal secret = (%q, %v, %v, %v)", v, isSecret, found, err)
	}
	v, isSecret, found, err = repo.Reveal("demo-mod", "greeting", models.ModSettingScope{})
	if err != nil || !found || isSecret || v != "hello" {
		t.Fatalf("reveal plain = (%q, %v, %v, %v)", v, isSecret, found, err)
	}
	if _, _, found, err = repo.Reveal("demo-mod", "nope", models.ModSettingScope{}); err != nil || found {
		t.Fatalf("reveal missing: found=%v err=%v, want found=false", found, err)
	}

	// Upsert: second Set must replace in place (UPDATE path), re-sealing.
	if err := repo.Set("demo-mod", "api_key", "rotated", true, models.ModSettingScope{}); err != nil {
		t.Fatalf("set secret again: %v", err)
	}
	if v, _, _, err := repo.Reveal("demo-mod", "api_key", models.ModSettingScope{}); err != nil || v != "rotated" {
		t.Fatalf("reveal rotated = (%q, %v)", v, err)
	}
	// Type change happens only through reinstall; a plain upsert flips the
	// stored flag along with the value, so verify a secret->plain write.
	if err := repo.Set("demo-mod", "api_key", "now-plain", false, models.ModSettingScope{}); err != nil {
		t.Fatalf("set plain over secret: %v", err)
	}
	if v, isSecret, _, err := repo.Reveal("demo-mod", "api_key", models.ModSettingScope{}); err != nil || isSecret || v != "now-plain" {
		t.Fatalf("reveal after type flip = (%q, %v, %v)", v, isSecret, err)
	}

	// Delete is a no-op when missing.
	if err := repo.Delete("demo-mod", "greeting", models.ModSettingScope{}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if err := repo.Delete("demo-mod", "greeting", models.ModSettingScope{}); err != nil {
		t.Fatalf("delete twice: %v", err)
	}
	if _, _, found, err := repo.Reveal("demo-mod", "greeting", models.ModSettingScope{}); err != nil || found {
		t.Fatalf("deleted row still visible: found=%v err=%v", found, err)
	}
}
