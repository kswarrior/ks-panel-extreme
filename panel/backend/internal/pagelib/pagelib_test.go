package pagelib

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestEmbeddedLibraryShipsPages guards the canonical file-based page
// library at instance_pages/pages/*.json: rebuild.sh syncs it into the
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
		if n == "minecraft-properties.json" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("embedded library must contain minecraft-properties.json, got %v", names)
	}
}

// TestReadRejectsTraversal keeps the importer's path guard honest.
func TestReadRejectsTraversal(t *testing.T) {
	for _, bad := range []string{"../secret.txt", "a/b.json", "", ".", "..", "pages"} {
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
		if !strings.Contains(p.DownloadURL, "://") && !strings.HasSuffix(p.DownloadURL, ".json") {
			t.Errorf("relative URL must point at a .json page: %q", p.DownloadURL)
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
		if err := json.Unmarshal(data, &p); err != nil {
			t.Errorf("%s: invalid JSON: %v", name, err)
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
