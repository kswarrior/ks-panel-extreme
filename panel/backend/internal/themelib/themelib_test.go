package themelib

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestEmbeddedLibraryShipsThemes guards the canonical file-based theme
// library at themes_market/market/*.json: rebuild.sh syncs it into the
// embedded library/market/ tree so /api/themes/market and the install
// flow work on installs without themes_market/ on disk.
func TestEmbeddedLibraryShipsThemes(t *testing.T) {
	names := ListNames()
	if len(names) == 0 {
		t.Fatal("embedded library must ship themes from themes_market/market/, got none")
	}
	// Spot-check a canonical theme that must always be present.
	found := false
	for _, n := range names {
		if n == "midnight-ocean.json" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("embedded library must contain midnight-ocean.json, got %v", names)
	}
}

// TestReadRejectsTraversal keeps the installer's path guard honest.
func TestReadRejectsTraversal(t *testing.T) {
	for _, bad := range []string{"../secret.txt", "a/b.json", "", ".", "..", "market"} {
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
			t.Errorf("relative URL must point at a .json theme: %q", p.DownloadURL)
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
			t.Errorf("relative catalog entry %q does not resolve via themelib.Read", p.DownloadURL)
		}
	}
}
