package modengine

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/models"
)

// writeTestFile creates dir/rel with content, making parent dirs as needed.
func writeTestFile(t *testing.T, dir, rel, content string) {
	t.Helper()
	full := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", rel, err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", rel, err)
	}
}

func TestBundleURLFor(t *testing.T) {
	t.Run("inline source uses default path", func(t *testing.T) {
		man := models.ModManifestV2{Slug: "demo", UIBundleSource: "var x = 1;"}
		got := bundleURLFor(man, "", "demo", "1.2.3")
		want := "/api/mods/v1/assets/demo/frontend/bundle.js?v=1.2.3"
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	})

	t.Run("file-based custom path is escaped", func(t *testing.T) {
		dir := t.TempDir()
		writeTestFile(t, dir, "ui bundle/main.js", "var x = 1;")
		man := models.ModManifestV2{Slug: "demo", UIBundle: "ui bundle/main.js"}
		got := bundleURLFor(man, dir, "demo", "0.1")
		want := "/api/mods/v1/assets/demo/ui%20bundle/main.js?v=0.1"
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	})

	t.Run("no source and no file yields empty", func(t *testing.T) {
		dir := t.TempDir()
		man := models.ModManifestV2{Slug: "demo"}
		if got := bundleURLFor(man, dir, "demo", "1.0.0"); got != "" {
			t.Fatalf("got %q, want empty", got)
		}
	})

	t.Run("directory is not a bundle", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(dir, "frontend", "bundle.js"), 0o755); err != nil {
			t.Fatal(err)
		}
		man := models.ModManifestV2{Slug: "demo"}
		if got := bundleURLFor(man, dir, "demo", "1.0.0"); got != "" {
			t.Fatalf("got %q, want empty", got)
		}
	})

	t.Run("traversal path is refused", func(t *testing.T) {
		dir := t.TempDir()
		writeTestFile(t, dir, "secret.js", "x")
		for _, p := range []string{"../secret.js", "..", "/etc/passwd"} {
			man := models.ModManifestV2{Slug: "demo", UIBundle: p}
			if got := bundleURLFor(man, dir, "demo", "1.0.0"); got != "" {
				t.Errorf("uiBundle %q: got %q, want empty", p, got)
			}
		}
	})

	t.Run("empty version falls back to 0", func(t *testing.T) {
		man := models.ModManifestV2{Slug: "demo", UIBundleSource: "x"}
		got := bundleURLFor(man, "", "demo", "")
		want := "/api/mods/v1/assets/demo/frontend/bundle.js?v=0"
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	})
}

func TestPackageExtra(t *testing.T) {
	t.Run("inline source embeds at effective path", func(t *testing.T) {
		extra := PackageExtra(models.ModManifestV2{UIBundleSource: "var x = 1;"})
		if len(extra) != 1 || string(extra[models.DefaultUIBundlePath]) != "var x = 1;" {
			t.Fatalf("unexpected extra: %#v", extra)
		}
	})

	t.Run("custom path is used", func(t *testing.T) {
		extra := PackageExtra(models.ModManifestV2{UIBundle: "ui/main.js", UIBundleSource: "x"})
		if _, ok := extra["ui/main.js"]; !ok {
			t.Fatalf("expected entry ui/main.js, got %#v", extra)
		}
	})

	t.Run("no source yields nil", func(t *testing.T) {
		if got := PackageExtra(models.ModManifestV2{UIBundle: "ui/main.js"}); got != nil {
			t.Fatalf("got %#v, want nil", got)
		}
	})

	t.Run("absolute path is refused", func(t *testing.T) {
		if got := PackageExtra(models.ModManifestV2{UIBundle: "/abs.js", UIBundleSource: "x"}); got != nil {
			t.Fatalf("got %#v, want nil", got)
		}
	})
}

func TestBuildPackageZipEmbedsUIBundle(t *testing.T) {
	man := models.ModManifestV2{
		Name:           "Demo",
		Slug:           "demo",
		Version:        "1.0.0",
		EngineVersion:  2,
		UIBundleSource: "window.KS.registerComponent('dashboard.cards', 'X', function () { return null; });",
		Slots:          []models.SlotDefinition{{Name: "dashboard.cards", Component: "X"}},
	}
	manifestJSON := []byte(`{"name":"Demo","slug":"demo","version":"1.0.0","engineVersion":2}`)
	zipBytes, err := BuildPackageZip(manifestJSON, []byte(`{}`), PackageExtra(man))
	if err != nil {
		t.Fatalf("BuildPackageZip: %v", err)
	}
	r, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	var found bool
	for _, f := range r.File {
		if f.Name != models.DefaultUIBundlePath {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open entry: %v", err)
		}
		body, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("read entry: %v", err)
		}
		if string(body) != man.UIBundleSource {
			t.Fatalf("entry content mismatch: %q", string(body))
		}
		found = true
	}
	if !found {
		t.Fatalf("zip has no %s entry", models.DefaultUIBundlePath)
	}
}

func TestInlineBundle(t *testing.T) {
	eng := &ModEngine{entries: map[string]*modEntry{
		"demo": {slug: "demo", manifest: models.ModManifestV2{
			Slug:         "demo",
			UIBundleSource: "var x = 1;",
		}},
		"fileonly": {slug: "fileonly", manifest: models.ModManifestV2{
			Slug:    "fileonly",
			UIBundle: "ui/main.js",
		}},
	}}

	t.Run("serves inline source at effective path", func(t *testing.T) {
		body, ok := eng.InlineBundle("demo", "frontend/bundle.js")
		if !ok || string(body) != "var x = 1;" {
			t.Fatalf("got (%q, %v)", string(body), ok)
		}
	})

	t.Run("tolerates leading slash", func(t *testing.T) {
		body, ok := eng.InlineBundle("demo", "/frontend/bundle.js")
		if !ok || string(body) != "var x = 1;" {
			t.Fatalf("got (%q, %v)", string(body), ok)
		}
	})

	t.Run("custom path matches only its own file", func(t *testing.T) {
		eng.entries["custom"] = &modEntry{slug: "custom", manifest: models.ModManifestV2{
			Slug: "custom", UIBundle: "ui/main.js", UIBundleSource: "custom();",
		}}
		if _, ok := eng.InlineBundle("custom", "frontend/bundle.js"); ok {
			t.Fatal("default path must not serve a custom-path bundle")
		}
		if body, ok := eng.InlineBundle("custom", "ui/main.js"); !ok || string(body) != "custom();" {
			t.Fatalf("got (%q, %v)", string(body), ok)
		}
	})

	t.Run("unknown slug yields false", func(t *testing.T) {
		if _, ok := eng.InlineBundle("nope", "frontend/bundle.js"); ok {
			t.Fatal("unknown slug must not serve")
		}
	})

	t.Run("no inline source yields false", func(t *testing.T) {
		if _, ok := eng.InlineBundle("fileonly", "ui/main.js"); ok {
			t.Fatal("file-only mod must not serve inline")
		}
	})

	t.Run("path mismatch yields false", func(t *testing.T) {
		if _, ok := eng.InlineBundle("demo", "other.js"); ok {
			t.Fatal("mismatched path must not serve")
		}
	})

	t.Run("source content is not trimmed", func(t *testing.T) {
		eng.entries["spaced"] = &modEntry{slug: "spaced", manifest: models.ModManifestV2{
			Slug: "spaced", UIBundleSource: "  var x = 1;\n",
		}}
		body, ok := eng.InlineBundle("spaced", "frontend/bundle.js")
		if !ok || string(body) != "  var x = 1;\n" {
			t.Fatalf("got (%q, %v)", string(body), ok)
		}
	})

	t.Run("whitespace-only source yields false", func(t *testing.T) {
		eng.entries["blank"] = &modEntry{slug: "blank", manifest: models.ModManifestV2{
			Slug: "blank", UIBundleSource: "   \n",
		}}
		if _, ok := eng.InlineBundle("blank", "frontend/bundle.js"); ok {
			t.Fatal("blank source must not serve")
		}
	})

	if !strings.Contains(bundleURLFor(models.ModManifestV2{Slug: "demo", UIBundleSource: "x"}, "", "demo", "1"), "frontend/bundle.js") {
		t.Fatal("sanity: bundleURLFor default path changed")
	}
}
