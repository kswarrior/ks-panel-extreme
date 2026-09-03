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
		if n == "home.json" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("embedded library must contain home.json, got %v", names)
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
