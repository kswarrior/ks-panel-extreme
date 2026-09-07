package handlers

import (
	"encoding/json"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/example/kspanel/internal/stackstore"
	"github.com/go-chi/chi/v5"
)

// stack_serve.go serves stack content to the browser: the spa bundle,
// simple pages and the KSStackSDK. No supervisor needed — everything here
// reads the extracted workdir + the stacks table.
//
//   GET /api/stacks/v1/ui/{slug}/*          — frontend/dist file (spa mode)
//   GET /api/stacks/v1/pages/{slug}          — simple-pages list
//   GET /api/stacks/v1/pages/{slug}/{page}   — one simple page content
//   GET /api/stacks/v1/ks-stack-sdk.js       — SDK bootstrap script
//
// All routes are STACKS_VIEW-gated in server.go. Inactive stacks 404: an
// installed-but-not-activated stack must never render.

// stackDistRoot is the workdir-relative directory holding the spa bundle.
const stackDistRoot = "frontend/dist"

// stackPagesRoot is the workdir-relative directory holding simple pages.
const stackPagesRoot = "frontend/pages"

// StackUIHandler streams one file from an ACTIVE stack's spa bundle. Empty
// rel serves index.html; missing files fall back to index.html when the
// stack is spa-styled (client-side routing), else 404. theme.css for custom
// theme mode rides this same path (frontend/dist/theme.css conventionally,
// or frontend/theme.css — both resolve under the workdir).
func StackUIHandler(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, "missing slug", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStackBySlug(slug)
	if err != nil || s == nil || !s.Active {
		http.NotFound(w, r)
		return
	}
	if _, err := stackstore.EnsureWorkDirLocked(slug); err != nil {
		http.NotFound(w, r)
		return
	}
	rel := chi.URLParam(r, "*")
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" {
		rel = path.Join(stackDistRoot, "index.html")
	} else {
		rel = path.Clean("/" + rel)
	}
	// Candidate 1: inside the spa bundle. Candidate 2: workdir-root
	// relative (covers frontend/theme.css for custom theme mode). Both
	// stay under the workdir via ReadAsset's traversal guard.
	candidates := []string{path.Join(stackDistRoot, strings.TrimPrefix(rel, "/")), strings.TrimPrefix(rel, "/")}
	var body []byte
	served := ""
	for _, c := range candidates {
		if b, err := stackstore.ReadAsset(slug, c); err == nil {
			body, served = b, c
			break
		}
	}
	if body == nil {
		// SPA fallback: client routes resolve to index.html.
		if s.PageStyle != "simple" {
			if fb, ferr := stackstore.ReadAsset(slug, path.Join(stackDistRoot, "index.html")); ferr == nil {
				serveStackAsset(w, fb, "index.html")
				return
			}
		}
		http.NotFound(w, r)
		return
	}
	serveStackAsset(w, body, served)
}

func serveStackAsset(w http.ResponseWriter, body []byte, rel string) {
	ctype := mime.TypeByExtension(filepath.Ext(path.Base(rel)))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	// HTML shells must revalidate (they reference hashed assets); hashed
	// assets (name.<hash>.ext) cache for an hour.
	if strings.HasSuffix(strings.ToLower(path.Base(rel)), ".html") {
		w.Header().Set("Cache-Control", "no-cache")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
	_, _ = w.Write(body)
}

// stackPageEntry is one row of frontend/pages/pages.json.
type stackPageEntry struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
	Icon  string `json:"icon,omitempty"`
	File  string `json:"file"`
}

// StackPagesHandler lists an ACTIVE simple-styled stack's pages. The list
// prefers frontend/pages/pages.json; without it the handler scans the
// directory for *.md/*.html/*.blocks.json (sorted, slug = basename).
func StackPagesHandler(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStackBySlug(slug)
	if err != nil || s == nil || !s.Active {
		http.NotFound(w, r)
		return
	}
	if _, err := stackstore.EnsureWorkDirLocked(slug); err != nil {
		http.NotFound(w, r)
		return
	}
	entries, err := readStackPageEntries(slug)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, entries)
}

// StackPageHandler serves one simple page's content as
// {slug,title,type(html|markdown|blocks),content}. Path traversal is
// guarded by resolving the entry file through the entries table only —
// never from the URL directly.
func StackPageHandler(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	page := chi.URLParam(r, "page")
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStackBySlug(slug)
	if err != nil || s == nil || !s.Active {
		http.NotFound(w, r)
		return
	}
	if _, err := stackstore.EnsureWorkDirLocked(slug); err != nil {
		http.NotFound(w, r)
		return
	}
	entries, err := readStackPageEntries(slug)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	var found *stackPageEntry
	for i := range entries {
		if entries[i].Slug == page {
			found = &entries[i]
			break
		}
	}
	if found == nil {
		http.NotFound(w, r)
		return
	}
	raw, err := stackstore.ReadAsset(slug, path.Join(stackPagesRoot, path.Clean("/"+found.File)))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ptype := "markdown"
	lower := strings.ToLower(found.File)
	switch {
	case strings.HasSuffix(lower, ".html"):
		ptype = "html"
	case strings.HasSuffix(lower, ".blocks.json"):
		ptype = "blocks"
	}
	writeJSON(w, map[string]any{
		"slug":    found.Slug,
		"title":   found.Title,
		"type":    ptype,
		"content": string(raw),
	})
}

// readStackPageEntries returns the page table for slug, preferring
// pages.json and falling back to a directory scan.
func readStackPageEntries(slug string) ([]stackPageEntry, error) {
	if raw, err := stackstore.ReadAsset(slug, path.Join(stackPagesRoot, "pages.json")); err == nil {
		var entries []stackPageEntry
		if jerr := json.Unmarshal(raw, &entries); jerr == nil {
			out := entries[:0]
			for _, e := range entries {
				if e.Slug == "" || e.File == "" || strings.Contains(e.File, "..") {
					continue
				}
				out = append(out, e)
			}
			return out, nil
		}
	}
	// Fallback: scan known filenames is impossible without a dir lister in
	// the store, so probe the conventional starter names in order.
	out := []stackPageEntry{}
	for _, name := range []string{"overview.md", "index.md", "home.md", "overview.html", "index.html"} {
		if _, err := stackstore.ReadAsset(slug, path.Join(stackPagesRoot, name)); err == nil {
			base := strings.TrimSuffix(name, filepath.Ext(name))
			if base == "index" {
				base = "home"
			}
			out = append(out, stackPageEntry{Slug: base, Title: base, File: name})
		}
	}
	return out, nil
}

// ksStackSDK is the bootstrap script stacks load to talk to the panel. It
// is intentionally tiny: theme tokens + fetch proxy + kv helpers, all over
// postMessage so stack code never touches panel cookies or the sidecar URL.
const ksStackSDK = `(function () {
  'use strict';
  var listeners = {};
  var seq = 0;
  function send(type, payload) {
    return new Promise(function (resolve) {
      var id = 'ks-' + (++seq);
      listeners[id] = resolve;
      parent.postMessage({ ksStack: true, id: id, type: type, payload: payload || {} }, '*');
    });
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (!d.ksStack || !d.id || !listeners[d.id]) return;
    var fn = listeners[d.id];
    delete listeners[d.id];
    fn(d.payload);
  });
  window.KS = window.KS || {};
  window.KS.stack = {
    theme: function () { return send('theme'); },
    fetch: function (apiPath, opts) { return send('fetch', { path: apiPath, opts: opts || {} }); },
    kv: {
      get: function (key) { return send('kv.get', { key: key }); },
      set: function (key, value) { return send('kv.set', { key: key, value: value }); },
      del: function (key) { return send('kv.del', { key: key }); }
    },
    toast: function (msg) { return send('toast', { message: msg }); },
    nav: function (path) { return send('nav', { path: path }); }
  };
})();`

// StackSDKHandler serves the SDK bootstrap (long-cacheable).
func StackSDKHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write([]byte(ksStackSDK))
}
