//go:build modengine_goja

package modengine

import (
	"encoding/base64"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
	kdb "github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	_ "modernc.org/sqlite"
)

// newSettingsSandbox bootstraps a migrated temp sqlite DB (mirrors
// newEdgeConfigTestDB), seeds the mods row the mod_settings FK needs, and
// returns a bare sandbox whose ks.settings binding carries the given schema —
// the same wiring Start performs via settingsFromHostEnv.
func newSettingsSandbox(t *testing.T, defs []models.ModSettingDefinition) (*gojaRuntime, *goja.Runtime) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "settings-test.db")
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
		`INSERT INTO mods (name, slug, version, manifest) VALUES ('Test Mod', 'test-mod', '1.0.0', '{}')`,
	); err != nil {
		t.Fatalf("seed mod row: %v", err)
	}
	env := &hostEnv{slug: "test-mod", caps: map[string]bool{}, perms: map[string]bool{}, settings: defs}
	rt, vm := newSandbox(t, env)
	rt.settings = newSettingsBinding(rt.slug, settingsFromHostEnv(env))
	return rt, vm
}

// settingsTestDefs is a valid schema touching every type.
func settingsTestDefs() []models.ModSettingDefinition {
	return []models.ModSettingDefinition{
		{Key: "greeting", Type: "text", Default: "hi"},
		{Key: "api_key", Type: "password"},
		{Key: "retries", Type: "number"},
		{Key: "flag", Type: "toggle"},
		{Key: "region", Type: "select", Options: []string{"eu", "us"}},
	}
}

// TestSettingsBindingRoundTrip drives ks.settings from JS end to end: defaults
// surface before any row exists, sets validate against the declared schema,
// booleans/numbers coerce to their canonical strings, unknown keys and bad
// select values are refused with false, clearing falls back to the default,
// and a password never lands in the DB in the clear.
func TestSettingsBindingRoundTrip(t *testing.T) {
	_, vm := newSettingsSandbox(t, settingsTestDefs())

	// Defaults + undeclared keys.
	if got := runJS(t, vm, `ks.settings.get("greeting")`).Export(); got != "hi" {
		t.Fatalf(`get("greeting") = %v, want declared default "hi"`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("api_key")`).Export(); got != nil {
		t.Fatalf(`get("api_key") = %v, want null (no default)`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("nope")`).Export(); got != nil {
		t.Fatalf(`get("nope") = %v, want null (undeclared)`, got)
	}

	// Valid writes across types.
	for _, src := range []string{
		`ks.settings.set("api_key", "tok-123")`,
		`ks.settings.set("retries", 7)`,
		`ks.settings.set("flag", true)`,
		`ks.settings.set("region", "eu")`,
	} {
		if got := runJS(t, vm, src).Export(); got != true {
			t.Fatalf("%s = %v, want true", src, got)
		}
	}

	// Refusals: unknown key, invalid select option.
	if got := runJS(t, vm, `ks.settings.set("unknown", "x")`).Export(); got != false {
		t.Fatalf(`set("unknown") = %v, want false`, got)
	}
	if got := runJS(t, vm, `ks.settings.set("region", "apac")`).Export(); got != false {
		t.Fatalf(`set("region","apac") = %v, want false`, got)
	}

	// Reads reflect writes; secrets decrypt back for the engine path only.
	if got := runJS(t, vm, `ks.settings.get("api_key")`).Export(); got != "tok-123" {
		t.Fatalf(`get("api_key") = %v, want tok-123`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("retries")`).Export(); got != "7" {
		t.Fatalf(`get("retries") = %v, want "7" (number coerced)`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("flag")`).Export(); got != "true" {
		t.Fatalf(`get("flag") = %v, want "true" (bool coerced)`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("region")`).Export(); got != "eu" {
		t.Fatalf(`get("region") = %v, want "eu"`, got)
	}

	// A custom greeting overrides the default; clearing restores it.
	if got := runJS(t, vm, `ks.settings.set("greeting", "hello")`).Export(); got != true {
		t.Fatalf(`set("greeting","hello") = %v, want true`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("greeting")`).Export(); got != "hello" {
		t.Fatalf(`get("greeting") = %v, want "hello"`, got)
	}
	if got := runJS(t, vm, `ks.settings.set("greeting", "")`).Export(); got != true {
		t.Fatalf(`clear greeting = %v, want true`, got)
	}
	if got := runJS(t, vm, `ks.settings.get("greeting")`).Export(); got != "hi" {
		t.Fatalf(`get("greeting") after clear = %v, want default "hi"`, got)
	}

	// At rest: the secret is sealed (base64 blob, not the cleartext) and
	// flagged is_secret=1; coerced plain values landed as their strings.
	con, err := repository.OpenDB()
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer con.Close()
	var raw string
	var secretFlag int
	if err := con.QueryRow(
		`SELECT value, is_secret FROM mod_settings WHERE mod_slug = 'test-mod' AND key = 'api_key'`,
	).Scan(&raw, &secretFlag); err != nil {
		t.Fatalf("raw secret select: %v", err)
	}
	if secretFlag != 1 || raw == "tok-123" || strings.Contains(raw, "tok-123") {
		t.Fatalf("secret at rest = (%q, is_secret=%d), want sealed blob", raw, secretFlag)
	}
	if blob, derr := base64.StdEncoding.DecodeString(raw); derr != nil || string(blob) == "tok-123" {
		t.Fatalf("sealed secret not base64 or equals cleartext: %v", derr)
	}
	var plain string
	if err := con.QueryRow(
		`SELECT value FROM mod_settings WHERE mod_slug = 'test-mod' AND key = 'retries'`,
	).Scan(&plain); err != nil || plain != "7" {
		t.Fatalf("retries at rest = (%q, %v), want \"7\"", plain, err)
	}
	var n int
	if err := con.QueryRow(
		`SELECT COUNT(*) FROM mod_settings WHERE mod_slug = 'test-mod' AND key = 'greeting'`,
	).Scan(&n); err != nil || n != 0 {
		t.Fatalf("greeting row count = (%d, %v), want 0 after clear", n, err)
	}
}
