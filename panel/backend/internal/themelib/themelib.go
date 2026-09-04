// Package themelib embeds the theme marketplace catalog into the
// kspanel binary so the theme-market list/install flows work on every
// install — including ones that were self-updated from a bare binary
// and therefore have no themes_market/ directory next to the executable.
//
// The canonical theme library lives at <repo>/themes_market/market/*.json
// with the catalog at <repo>/themes_market/marketplace.json; rebuild.sh
// syncs both into internal/themelib/library before compiling. On disk a
// working-directory themes_market/ tree (market/ canonical, top level kept
// as a legacy override) may still provide theme definitions: readers try
// it FIRST and fall back to the embedded copies, so operator-provided
// libraries keep working.
//
// This mirrors internal/pagelib exactly (same disk-first + embedded
// fallback, same catalog schema rules as the instance-pages market);
// only the directory names and the "theme" wording differ.
package themelib

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:library
var embedded embed.FS

// libraryFS is the embedded tree rooted at library/ (marketplace.json).
var libraryFS, _ = fs.Sub(embedded, "library")

// marketDirs lists the relative sub-directories scanned for theme JSON
// files on disk: market/ is canonical, the top level is kept as a legacy
// override for older installs.
var marketDirs = []string{"market", "."}

// excluded names are metadata, not importable theme definitions.
var excluded = map[string]bool{
	"marketplace.json": true,
	"README.md":        true,
}

// diskRoot returns the working-directory library root, when present.
func diskRoot() string {
	if st, err := os.Stat("themes_market"); err == nil && st.IsDir() {
		return "themes_market"
	}
	return ""
}

// ListNames returns every importable theme filename (basename only), disk
// entries first, then embedded-only ones. Order is stable per directory so
// the admin UI renders a deterministic list.
func ListNames() []string {
	seen := map[string]bool{}
	var out []string
	if root := diskRoot(); root != "" {
		for _, dir := range marketDirs {
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

// Read resolves a theme JSON by its basename. Lookup order:
//  1. themes_market/market/<name>      (working-dir canonical)
//  2. themes_market/<name>             (working-dir legacy override)
//  3. embedded library/market/<name>   (release fallback)
//
// name must be a bare basename — anything carrying a path separator is
// rejected to keep the traversal guard in one place.
func Read(name string) ([]byte, bool) {
	if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") || filepath.Base(name) != name {
		return nil, false
	}
	if root := diskRoot(); root != "" {
		for _, dir := range marketDirs {
			b, err := os.ReadFile(filepath.Join(root, dir, name))
			if err == nil {
				return b, true
			}
		}
	}
	b, err := fs.ReadFile(FS(), filepath.Join("market", name))
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
