// Package pagelib embeds the instance-pages marketplace catalog into the
// kspanel binary so the local-library and marketplace import flows work on
// every install — including ones that were self-updated from a bare binary
// and therefore have no instance_pages/ directory next to the executable.
//
// The canonical page library lives at <repo>/instance_pages/pages/*.yaml
// (human-friendly authoring format: literal blocks, native lists, comments)
// with the catalog at <repo>/instance_pages/marketplace.json; rebuild.sh
// syncs both into internal/pagelib/library before compiling. Legacy *.json
// page files are still read (disk and embedded) and accepted on every import
// path. On disk a working-directory instance_pages/ tree (pages/ canonical,
// top level kept as a legacy override) may still provide page definitions:
// readers try it FIRST and fall back to the embedded copies, so
// operator-provided libraries keep working.
package pagelib

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed all:library
var embedded embed.FS

// libraryFS is the embedded tree rooted at library/ (marketplace.json).
var libraryFS, _ = fs.Sub(embedded, "library")

// pagesDirs lists the relative sub-directories scanned for page JSON files
// on disk: pages/ is canonical, the top level is kept as a legacy override
// for older installs.
var pagesDirs = []string{"pages", "."}

// pageExts are the accepted page-file extensions in preference order:
// the YAML authoring format first, legacy JSON last.
var pageExts = []string{".yaml", ".yml", ".json"}

// excluded names are metadata, not importable page definitions.
var excluded = map[string]bool{
	"marketplace.json": true,
	"marketplace.yaml": true,
	"marketplace.yml":  true,
	"README.md":        true,
	"GUIDE.md":         true,
}

// pageStem splits a page filename into its stem and whether it carries a
// known page extension (e.g. "ports.yaml" -> "ports", true).
func pageStem(name string) (string, bool) {
	lower := strings.ToLower(name)
	for _, ext := range pageExts {
		if strings.HasSuffix(lower, ext) {
			return name[:len(name)-len(ext)], true
		}
	}
	return "", false
}

// extRank orders duplicate stems: the canonical YAML file wins over legacy
// JSON so a directory holding both never surfaces the same page twice.
func extRank(name string) int {
	lower := strings.ToLower(name)
	for i, ext := range pageExts {
		if strings.HasSuffix(lower, ext) {
			return i
		}
	}
	return len(pageExts)
}

// diskRoot returns the working-directory library root, when present.
func diskRoot() string {
	if st, err := os.Stat("instance_pages"); err == nil && st.IsDir() {
		return "instance_pages"
	}
	return ""
}

// ListNames returns every importable page filename (basename only), disk
// entries first, then embedded-only ones. Duplicates across extensions
// (ports.yaml + legacy ports.json) resolve to the canonical YAML name;
// order is by stem so the admin UI renders a deterministic list.
func ListNames() []string {
	seen := map[string]bool{}
	best := map[string]string{}
	consider := func(name string) {
		stem, ok := pageStem(name)
		if !ok || excluded[name] {
			return
		}
		key := strings.ToLower(stem)
		if cur, dup := best[key]; !dup || extRank(name) < extRank(cur) {
			best[key] = name
		}
	}
	emitSorted := func(out *[]string) {
		stems := make([]string, 0, len(best))
		for stem := range best {
			stems = append(stems, stem)
		}
		sort.Strings(stems)
		for _, stem := range stems {
			name := best[stem]
			if !seen[name] {
				seen[name] = true
				*out = append(*out, name)
			}
		}
		best = map[string]string{}
	}
	var out []string
	if root := diskRoot(); root != "" {
		for _, dir := range pagesDirs {
			full := filepath.Join(root, dir)
			entries, err := os.ReadDir(full)
			if err != nil {
				continue
			}
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				consider(e.Name())
			}
		}
		emitSorted(&out)
	}
	fsys := FS()
	fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		consider(d.Name())
		return nil
	})
	emitSorted(&out)
	return out
}

// Read resolves a page file by its basename (*.yaml, *.yml, or legacy
// *.json). Lookup order:
//  1. instance_pages/pages/<name>      (working-dir canonical)
//  2. instance_pages/<name>            (working-dir legacy override)
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
