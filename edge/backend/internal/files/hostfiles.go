// Package files: HostFilesHandler exposes a read-only browser for the
// daemon's own instance-files directory (instances_dir, default
// /var/lib/kspanel/instances) with that directory as the filesystem root.
//
// Wire format (all JSON, all under /api/edge/hostfiles, GET only):
//
//	GET  ?op=list&path=/&token=…
//	    -> { "entries": [ {name, size, mode, is_dir, mod_time} ... ], "path": "/", "root": "/var/lib/kspanel/instances" }
//	GET  ?op=stat&path=/mc-1&token=…
//	    -> { "name", "size", "mode", "is_dir", "mod_time" }
//	GET  ?op=read&path=/mc-1/server.jar&token=…
//	    -> raw bytes (application/octet-stream) — suitable for download
//
// `path` is always interpreted RELATIVE to the instances root: "/" is the
// root itself, "/mc-1/world" is <root>/mc-1/world. There is deliberately no
// way to address anything outside the root — jailJoin rejects ".."
// escapes lexically and re-verifies after symlink resolution, so a symlink
// planted inside the root that points at /etc (or anywhere else on the
// host) is refused instead of followed. The panel's NodeDetail → Files tab
// proxies here so operators can inspect per-instance data without ever
// seeing the rest of the host filesystem.
package files

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// maxHostListEntries caps a single directory listing so a runaway folder
// (tens of thousands of chunk files) can't pin edge memory. The response
// carries truncated:true when the cap bites.
const maxHostListEntries = 5000

// hostJail is a resolved instances-dir root plus its symlink-resolved form.
// Both are needed: the lexical check runs against root (what the operator
// configured), while the post-symlink check runs against realRoot (what the
// kernel actually walks to) so a root that is itself a symlink doesn't
// false-positive on every lookup.
type hostJail struct {
	root     string
	realRoot string
}

// newHostJail validates the daemon's instances directory as a jail root.
// An empty or relative directory is a configuration error — the caller
// (cli wiring) always passes cfg.InstancesDirOr(""), which is absolute.
func newHostJail(instancesDir string) (hostJail, error) {
	clean := filepath.Clean(strings.TrimSpace(instancesDir))
	if clean == "" || clean == "." || !filepath.IsAbs(clean) {
		return hostJail{}, fmt.Errorf("instance file directory is not configured")
	}
	real := clean
	if rp, err := filepath.EvalSymlinks(clean); err == nil {
		real = filepath.Clean(rp)
	}
	return hostJail{root: clean, realRoot: real}, nil
}

// within reports whether abs equals root or lives underneath it.
func within(root, abs string) bool {
	return abs == root || strings.HasPrefix(abs, root+string(os.PathSeparator))
}

// resolve maps a client-supplied root-relative path ("/", "/mc-1/world")
// to an absolute host path, refusing anything that escapes the jail —
// lexically ("..") and via symlinks (resolved + re-checked). It returns
// the lexical absolute path for the actual filesystem calls (the kernel
// follows the same symlinks we verified).
func (j hostJail) resolve(rel string) (string, error) {
	rel = strings.TrimSpace(rel)
	if rel == "" {
		rel = "/"
	}
	if !strings.HasPrefix(rel, "/") {
		rel = "/" + rel
	}
	rel = filepath.Clean(rel)
	target := filepath.Join(j.root, rel)
	if !within(j.root, target) {
		return "", fmt.Errorf("invalid path")
	}
	// Follow symlinks, then require the landing spot to still be inside
	// the (resolved) root. For not-yet-existing paths resolve the deepest
	// existing ancestor and re-attach the remainder — the same fail-closed
	// pattern resolvedBlocked uses — so a symlink planted at
	// <root>/link -> /etc is still caught.
	resolved, err := filepath.EvalSymlinks(target)
	if err != nil {
		segs := []string{}
		cur := target
		resolved = ""
		for {
			parent := filepath.Dir(cur)
			if parent == cur {
				break
			}
			segs = append([]string{filepath.Base(cur)}, segs...)
			if rp, rerr := filepath.EvalSymlinks(parent); rerr == nil {
				resolved = rp
				for _, s := range segs {
					resolved = filepath.Join(resolved, s)
				}
				break
			}
			cur = parent
		}
		if resolved == "" {
			// Nothing on the chain resolves (e.g. the root itself doesn't
			// exist yet on a fresh edge). The lexical check above already
			// proved the path can't escape, and there is no symlink to
			// smuggle one in — let the filesystem call fail naturally.
			return target, nil
		}
	}
	resolved = filepath.Clean(resolved)
	if !within(j.realRoot, resolved) {
		return "", fmt.Errorf("invalid path")
	}
	return target, nil
}

// displayRel returns the canonical root-relative form ("/", "/mc-1/world")
// for responses so the SPA can render breadcrumbs without knowing the
// host's absolute layout.
func displayRel(rel string) string {
	rel = strings.TrimSpace(rel)
	if rel == "" {
		return "/"
	}
	if !strings.HasPrefix(rel, "/") {
		rel = "/" + rel
	}
	return filepath.Clean(rel)
}

// HostFilesHandler returns an http.Handler authenticated by the given edge
// token (same shared secret + constant-time comparison as every other
// panel→edge RPC). Read-only: list / stat / read. Any other op or any
// non-GET method is rejected.
func HostFilesHandler(token, instancesDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed (host files are read-only, use GET)", http.StatusMethodNotAllowed)
			return
		}
		tok := r.URL.Query().Get("token")
		// Same empty-token guard as Handler: never let length-0 vs
		// length-0 compare "pass" during the localnode boot window.
		if token == "" || subtle.ConstantTimeCompare([]byte(tok), []byte(token)) != 1 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		jail, err := newHostJail(instancesDir)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		q := r.URL.Query()
		op := strings.TrimSpace(q.Get("op"))
		if op == "" {
			op = "list"
		}
		rel := q.Get("path")
		abs, err := jail.resolve(rel)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		disp := displayRel(rel)
		switch op {
		case "list":
			listHostRootDir(w, abs, disp, jail.root)
		case "stat":
			statHostRootPath(w, abs)
		case "read":
			readHostRootFile(w, abs)
		default:
			writeErr(w, http.StatusBadRequest, "unknown op: "+op)
		}
	})
}

// listHostRootDir serves `op=list` for one directory inside the jail. A
// missing root (fresh edge that hasn't deployed anything yet) is an empty
// listing, not an error — the SPA renders "no instance files yet".
// Entries sort dirs-first, then case-insensitive name, mirroring the
// in-container File Manager's ordering.
func listHostRootDir(w http.ResponseWriter, abs, disp, root string) {
	entries := []Entry{}
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"entries": entries, "path": disp, "root": root})
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	if !info.IsDir() {
		writeErr(w, http.StatusBadRequest, "not a directory")
		return
	}
	f, err := os.Open(abs)
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("open: %v", err))
		return
	}
	defer f.Close()
	names, err := f.Readdirnames(0)
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("readdir: %v", err))
		return
	}
	truncated := false
	for _, nm := range names {
		if len(entries) >= maxHostListEntries {
			truncated = true
			break
		}
		fi, err := os.Stat(filepath.Join(abs, nm))
		if err != nil {
			continue
		}
		entries = append(entries, Entry{
			Name:    nm,
			Size:    fi.Size(),
			Mode:    uint32(fi.Mode().Perm()),
			IsDir:   fi.IsDir(),
			ModTime: fi.ModTime().Unix(),
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"entries":   entries,
		"path":      disp,
		"root":      root,
		"truncated": truncated,
	})
}

// statHostRootPath serves `op=stat` for a single jailed path.
func statHostRootPath(w http.ResponseWriter, abs string) {
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(Entry{
		Name:    info.Name(),
		Size:    info.Size(),
		Mode:    uint32(info.Mode().Perm()),
		IsDir:   info.IsDir(),
		ModTime: info.ModTime().Unix(),
	})
}

// readHostRootFile streams one jailed file back for download, with the
// same Content-Disposition the container file manager sets so the SPA
// reuses a single download flow.
func readHostRootFile(w http.ResponseWriter, abs string) {
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	if info.IsDir() {
		writeErr(w, http.StatusBadRequest, "cannot download a directory")
		return
	}
	f, err := os.Open(abs)
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("open: %v", err))
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(abs)))
	_, _ = io.Copy(w, f)
}
