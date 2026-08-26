// Package pagelib embeds the instance-pages marketplace catalog into the
// kspanel binary so the local-library and marketplace import flows work on
// every install — including ones that were self-updated from a bare binary
// and therefore have no instance_pages/ directory next to the executable.
//
// The page templates themselves live in the frontend Studio
// (features/instance-pages/templates/pageStarters.ts); the shipped
// instance_pages/pages/*.json library was removed. The canonical source for
// the catalog lives at <repo>/instance_pages/marketplace.json; rebuild.sh
// syncs it into internal/pagelib/library before compiling. On disk a
// working-directory instance_pages/ tree (top level + legacy pages/) may
// still provide page definitions: readers try it FIRST and fall back to the
// embedded copies, so operator-provided libraries keep working.
package pagelib

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:library
var embedded embed.FS

// libraryFS is the embedded tree rooted at library/ (pages/…, marketplace.json).
var libraryFS, _ = fs.Sub(embedded, "library")

// pagesDirs lists the relative sub-directories that carry page JSON files,
// mirroring the repository layout.
var pagesDirs = []string{".", "pages"}

// excluded names are metadata, not importable page definitions.
var excluded = map[string]bool{
	"marketplace.json": true,
	"README.md":        true,
}

// diskRoot returns the working-directory library root, when present.
func diskRoot() string {
	if st, err := os.Stat("instance_pages"); err == nil && st.IsDir() {
		return "instance_pages"
	}
	return ""
}

// ListNames returns every importable page filename (basename only), disk
// entries first, then embedded-only ones. Order is stable per directory so
// the admin UI renders a deterministic list.
func ListNames() []string {
	seen := map[string]bool{}
	var out []string
	if root := diskRoot(); root != "" {
		for _, dir := range pagesDirs {
			full := filepath.Join(root, dir)
			entries, err := os.ReadDir(full)
			if err != nil {
				continue
			}
			for _, e := range entries {
				name := e.Name()
				if e.IsDir() || !strings.HasSuffix(name, ".json") || excluded[name] {
					continue
				}
				if !seen[name] {
					seen[name] = true
					out = append(out, name)
				}
			}
		}
	}
	fsys := FS()
	fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		base := d.Name()
		if excluded[base] {
			return nil
		}
		if !seen[base] {
			seen[base] = true
			out = append(out, base)
		}
		return nil
	})
	return out
}

// Read resolves a page JSON by its basename. Lookup order:
//  1. instance_pages/<name>            (working-dir override)
//  2. instance_pages/pages/<name>      (working-dir override)
//  3. embedded library/pages/<name>    (release fallback)
//
// name must be a bare basename — anything carrying a path separator is
// rejected to keep the traversal guard in one place.
func Read(name string) ([]byte, bool) {
	if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") || filepath.Base(name) != name {
		return nil, false
	}
	if root := diskRoot(); root != "" {
		for _, dir := range pagesDirs {
			b, err := os.ReadFile(filepath.Join(root, dir, name))
			if err == nil {
				return b, true
			}
		}
	}
	b, err := fs.ReadFile(FS(), filepath.Join("pages", name))
	if err != nil {
		return nil, false
	}
	return b, true
}

// ReadCatalog returns marketplace.json bytes: disk first, embedded fallback.
func ReadCatalog() ([]byte, bool) {
	if root := diskRoot(); root != "" {
		b, err := os.ReadFile(filepath.Join(root, "marketplace.json"))
		if err == nil {
			return b, true
		}
	}
	b, err := fs.ReadFile(FS(), "marketplace.json")
	if err != nil {
		return nil, false
	}
	return b, true
}

// FS exposes the embedded library tree (tests / advanced callers). It is the
// sub-FS rooted at library/, never nil: go:embed fails the build when the
// directory is absent.
func FS() fs.FS { return libraryFS }
