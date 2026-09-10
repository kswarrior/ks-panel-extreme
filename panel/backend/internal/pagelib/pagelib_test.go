package pagelib

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestEmbeddedLibraryShipsPages guards the canonical file-based page
// library at instance_pages/pages/*.yaml: rebuild.sh syncs it into the
// embedded library/pages/ tree so /api/instance-pages/local and the import
// flows work on installs without instance_pages/ on disk.
func TestEmbeddedLibraryShipsPages(t *testing.T) {
	names := ListNames()
	if len(names) == 0 {
		t.Fatal("embedded library must ship pages from instance_pages/pages/, got none")
	}
	// Spot-check a canonical page that must always be present.
	found := false
	for _, n := range names {
		if n == "minecraft-properties.yaml" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("embedded library must contain minecraft-properties.yaml, got %v", names)
	}
}

// TestReadRejectsTraversal keeps the importer's path guard honest.
func TestReadRejectsTraversal(t *testing.T) {
	for _, bad := range []string{"../secret.txt", "a/b.json", "a/b.yaml", "", ".", "..", "pages", "ports", "ports.txt", "ports.md"} {
		if b, ok := Read(bad); ok {
			t.Errorf("Read(%q) unexpectedly succeeded (%d bytes)", bad, len(b))
		}
	}
}

func TestReadCatalog(t *testing.T) {
	b, ok := ReadCatalog()
	if !ok {
		t.Fatal("marketplace.json missing from embedded library")
	}
	var catalog struct {
		Pages []struct {
			ID          string `json:"id"`
			DownloadURL string `json:"download_url"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(b, &catalog); err != nil {
		t.Fatalf("catalog JSON invalid: %v", err)
	}
	for _, p := range catalog.Pages {
		if p.ID == "" || p.DownloadURL == "" {
			t.Errorf("catalog entry missing id/download_url: %+v", p)
		}
		if !strings.Contains(p.DownloadURL, "://") {
			if _, ok := pageStem(p.DownloadURL[strings.LastIndex(p.DownloadURL, "/")+1:]); !ok {
				t.Errorf("relative URL must point at a page file (.yaml/.yml/.json): %q", p.DownloadURL)
			}
		}
		if strings.Contains(p.DownloadURL, "://") {
			continue
		}
		base := p.DownloadURL
		for i := len(base) - 1; i >= 0; i-- {
			if base[i] == '/' {
				base = base[i+1:]
				break
			}
		}
		if _, ok := Read(base); !ok {
			t.Errorf("relative catalog entry %q does not resolve via pagelib.Read", p.DownloadURL)
		}
	}
}

// TestLibraryPagesAreImportable keeps every embedded library page honest
// against the API import gate (validateInstancePage): known content_type,
// size caps, and react pages carrying validated source. A library file that
// fails here would 400 on every import path (file/URL/marketplace/local).
func TestLibraryPagesAreImportable(t *testing.T) {
	validTypes := map[string]bool{"html": true, "markdown": true, "blocks": true, "react": true}
	for _, name := range ListNames() {
		data, ok := Read(name)
		if !ok {
			t.Errorf("ListNames returned unreadable %q", name)
			continue
		}
		normalized, err := NormalizePageBytes(data)
		if err != nil {
			t.Errorf("%s: not a valid page file: %v", name, err)
			continue
		}
		var p struct {
			Name            string `json:"name"`
			Slug            string `json:"slug"`
			ContentType     string `json:"content_type"`
			ContentHTML     string `json:"content_html"`
			ContentMarkdown string `json:"content_markdown"`
			ContentBlocks   string `json:"content_blocks"`
			SourceTSX       string `json:"source_tsx"`
			BundleCSS       string `json:"bundle_css"`
		}
		if err := json.Unmarshal(normalized, &p); err != nil {
			t.Errorf("%s: invalid page encoding: %v", name, err)
			continue
		}
		if p.Name == "" || p.Slug == "" {
			t.Errorf("%s: name and slug are required", name)
		}
		if !validTypes[p.ContentType] {
			t.Errorf("%s: unknown content_type %q", name, p.ContentType)
		}
		for field, s := range map[string]string{
			"content_html": p.ContentHTML, "content_markdown": p.ContentMarkdown,
			"content_blocks": p.ContentBlocks, "bundle_css": p.BundleCSS,
		} {
			if len(s) > 1024*1024 {
				t.Errorf("%s: %s exceeds 1MB", name, field)
			}
		}
		if len(p.SourceTSX) > 512*1024 {
			t.Errorf("%s: source_tsx exceeds 512KB", name)
		}
		if p.ContentType == "react" {
			if strings.TrimSpace(p.SourceTSX) == "" {
				t.Errorf("%s: react page without source_tsx", name)
			}
			lower := strings.ToLower(p.SourceTSX)
			for _, denied := range []string{"eval(", "new function", "xmlhttprequest", "document.cookie", "localstorage", "sessionstorage", "child_process", "require("} {
				if strings.Contains(lower, denied) {
					t.Errorf("%s: source_tsx uses forbidden primitive %q", name, denied)
				}
			}
		}
	}
}

// TestNormalizePageBytesYAML ensures the YAML authoring format normalizes to
// the same wire shape legacy JSON files carry: literal blocks stay verbatim
// and native lists fold back to JSON-encoded strings.
func TestNormalizePageBytesYAML(t *testing.T) {
	doc := "name: Demo\n" +
		"slug: demo\n" +
		"content_type: html\n" +
		"content_html: |\n" +
		"  <div class=\"ks-page\">\n" +
		"    <p>hi</p>\n" +
		"  </div>\n" +
		"actions:\n" +
		"- name: ping\n" +
		"  type: shell\n" +
		"  command: echo pong\n" +
		"  timeout: 10\n"
	normalized, err := NormalizePageBytes([]byte(doc))
	if err != nil {
		t.Fatalf("NormalizePageBytes failed: %v", err)
	}
	var p struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		ContentType string `json:"content_type"`
		ContentHTML string `json:"content_html"`
		Actions     string `json:"actions"`
	}
	if err := json.Unmarshal(normalized, &p); err != nil {
		t.Fatalf("normalized YAML is not valid JSON: %v", err)
	}
	if want := "<div class=\"ks-page\">\n  <p>hi</p>\n</div>\n"; p.ContentHTML != want {
		t.Errorf("content_html mismatch:\ngot  %q\nwant %q", p.ContentHTML, want)
	}
	var actions []struct {
		Name    string `json:"name"`
		Timeout int    `json:"timeout"`
	}
	if err := json.Unmarshal([]byte(p.Actions), &actions); err != nil {
		t.Fatalf("actions did not fold to a JSON array string: %v", err)
	}
	if len(actions) != 1 || actions[0].Name != "ping" || actions[0].Timeout != 10 {
		t.Errorf("unexpected actions payload: %s", p.Actions)
	}
}

// TestNormalizePageBytesLegacyJSON ensures legacy JSON files pass through
// byte-identical and garbage is rejected in both encodings.
func TestNormalizePageBytesLegacyJSON(t *testing.T) {
	raw := `{"name":"Demo","slug":"demo","content_type":"markdown","content_markdown":"# Hi","actions":"[]"}`
	normalized, err := NormalizePageBytes([]byte(raw))
	if err != nil {
		t.Fatalf("NormalizePageBytes failed on legacy JSON: %v", err)
	}
	if string(normalized) != raw {
		t.Errorf("legacy JSON must pass through untouched, got %q", normalized)
	}
	for _, bad := range []string{"", "   ", "[1,2]", "- just\n- a\n- list\n", "name: [unclosed"} {
		if _, err := NormalizePageBytes([]byte(bad)); err == nil {
			t.Errorf("NormalizePageBytes(%q) unexpectedly succeeded", bad)
		}
	}
}
