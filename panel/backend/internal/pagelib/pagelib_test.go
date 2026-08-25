package pagelib

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestEmbeddedLibraryShipsPages guards the release path: the binary must
// carry every library page plus the marketplace catalog.
func TestEmbeddedLibraryShipsPages(t *testing.T) {
	names := ListNames()
	if len(names) == 0 {
		t.Fatal("embedded library is empty — rebuild.sh sync did not run")
	}
	required := []string{
		"home.json", "files.json", "terminal.json", "metrics.json",
		"ports.json", "processes.json", "backups.json", "audit.json",
		"env.json", "automation.json", "network.json", "settings.json",
		"complete-example.json",
	}
	have := map[string]bool{}
	for _, n := range names {
		have[n] = true
	}
	for _, want := range required {
		if !have[want] {
			t.Errorf("required page %q missing from embedded library (have %v)", want, names)
		}
	}
}

// TestReadValidJSON ensures each embedded page parses as JSON and carries the
// fields import requires — a corrupt file must never reach the importer.
func TestReadValidJSON(t *testing.T) {
	for _, name := range ListNames() {
		data, ok := Read(name)
		if !ok {
			t.Fatalf("ListNames returned %q but Read failed", name)
		}
		var req struct {
			Name        string `json:"name"`
			Slug        string `json:"slug"`
			ContentType string `json:"content_type"`
		}
		if err := json.Unmarshal(data, &req); err != nil {
			t.Errorf("%s: invalid JSON: %v", name, err)
			continue
		}
		if req.Name == "" || req.Slug == "" {
			t.Errorf("%s: missing name/slug", name)
		}
		switch req.ContentType {
		case "html", "markdown", "blocks":
		default:
			t.Errorf("%s: bad content_type %q", name, req.ContentType)
		}
		if req.ContentType == "blocks" {
			var blocks []map[string]any
			var raw string
			_ = json.Unmarshal(data, &struct {
				ContentBlocks *string `json:"content_blocks"`
			}{&raw})
			if err := json.Unmarshal([]byte(raw), &blocks); err != nil {
				t.Errorf("%s: content_blocks is not valid JSON: %v", name, err)
			}
		}
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
	local := 0
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
		local++
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
	if local == 0 {
		t.Error("expected at least one locally-resolvable catalog entry")
	}
}
