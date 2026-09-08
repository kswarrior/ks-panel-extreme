// Package files: HostFilesHandler exposes a browser for the daemon's own
// instance-files directory (instances_dir, default
// /var/lib/kspanel/instances) with that directory as the filesystem root.
// Reads (list / stat / download) plus operator writes (mkdir / create /
// upload / git-clone) — every path is jailed, so nothing outside the
// root is addressable.
//
// Wire format (all under /api/edge/hostfiles, token-gated like every
// other panel→edge RPC):
//
//	GET  ?op=list&path=/&token=…
//	    -> { "entries": [ {name, size, mode, is_dir, mod_time} ... ], "path": "/", "root": "/var/lib/kspanel/instances" }
//	GET  ?op=stat&path=/mc-1&token=…
//	    -> { "name", "size", "mode", "is_dir", "mod_time" }
//	GET  ?op=read&path=/mc-1/server.jar&token=…
//	    -> raw bytes (application/octet-stream) — suitable for download
//	POST ?op=mkdir&path=/mc-1/newdir&token=…
//	    -> { "ok": true, "path": "/mc-1/newdir" }
//	POST ?op=write&path=/mc-1/notes.txt&token=…      (body = file bytes)
//	    -> { "ok": true, "path": "/mc-1/notes.txt" }
//	POST ?op=upload&path=/mc-1/mod.jar&token=…       (body = file bytes)
//	    -> same shape as write (distinct op so callers can toast
//	       "uploaded" vs "saved", mirroring /api/edge/files)
//	POST ?op=clone&token=…  JSON body (or query) { "path": "/mc-1", "url": "https://github.com/…/repo.git" }
//	    -> { "ok": true, "path": "/mc-1/repo", "url": "…" }
//	POST ?op=rename&path=/mc-1/old.txt&to=/mc-1/new.txt&token=…
//	    -> { "ok": true, "from": "/mc-1/old.txt", "to": "/mc-1/new.txt" }
//	POST ?op=delete&path=/mc-1/old.txt&token=…
//	    -> { "ok": true, "path": "/mc-1/old.txt" }
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
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// maxHostListEntries caps a single directory listing so a runaway folder
// (tens of thousands of chunk files) can't pin edge memory. The response
// carries truncated:true when the cap bites.
const maxHostListEntries = 5000

// maxHostWriteBytes caps a single write/upload body. Mirrors the panel's
// URL-fetch cap so a file that fits the panel-side limit reaches the edge
// intact instead of being truncated mid-stream.
const maxHostWriteBytes = 512 << 20 // 512 MiB

// hostWriteOps is the set of mutating ops. They require POST — unlike
// /api/edge/files (which accepts GET for writes as a legacy convenience),
// this endpoint stays strict so a prefetch/crawler GET can never mutate
// the instances directory.
var hostWriteOps = map[string]bool{
	"mkdir":  true,
	"write":  true,
	"upload": true,
	"clone":  true,
	"rename": true,
	"delete": true,
}

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
// System paths are rejected fail-closed: an instances_dir of /etc (typo
// or malicious config push) must never turn /api/edge/hostfiles into a
// host-filesystem oracle. Mirrors files.isDangerousPath.
func newHostJail(instancesDir string) (hostJail, error) {
	clean := filepath.Clean(strings.TrimSpace(instancesDir))
	if clean == "" || clean == "." || !filepath.IsAbs(clean) {
		return hostJail{}, fmt.Errorf("instance file directory is not configured")
	}
	if isHostJailDangerous(clean) {
		return hostJail{}, fmt.Errorf("instance file directory must not be a system path")
	}
	real := clean
	if rp, err := filepath.EvalSymlinks(clean); err == nil {
		real = filepath.Clean(rp)
		if isHostJailDangerous(real) {
			return hostJail{}, fmt.Errorf("instance file directory must not be a system path")
		}
	}
	return hostJail{root: clean, realRoot: real}, nil
}

// isHostJailDangerous mirrors files.isDangerousPath so the instances root
// can never be a system directory. Kept local because that helper is
// unexported; the list is duplicated verbatim so the two surfaces cannot
// drift. NOTE: /var, /opt, /srv, /home and /run are intentionally NOT in
// this list even though snapshot's isDangerousLocation blocks them —
// instance data legitimately lives under /var/lib/kspanel/instances
// (the documented default) and portable installs resolve ./instances
// under /opt, /srv or /home. Blocking those prefixes turned the default
// config into a permanent 500 ("instance file directory must not be a
// system path"). The core OS directories below are never valid instance
// roots, so they stay blocked.
func isHostJailDangerous(p string) bool {
	p = filepath.Clean(p)
	if p == "/" {
		return true
	}
	for _, d := range []string{"/bin", "/sbin", "/usr", "/etc", "/proc", "/sys", "/dev", "/boot", "/lib", "/lib64", "/root"} {
		if p == d || strings.HasPrefix(p, d+"/") {
			return true
		}
	}
	return false
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
// panel→edge RPC). Reads (list / stat / read) use GET; mutations (mkdir /
// write / upload / clone) require POST.
func HostFilesHandler(token, instancesDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		if hostWriteOps[op] && r.Method != http.MethodPost {
			http.Error(w, "method not allowed (use POST for "+op+")", http.StatusMethodNotAllowed)
			return
		}
		if !hostWriteOps[op] && r.Method != http.MethodGet {
			http.Error(w, "method not allowed (use GET for "+op+")", http.StatusMethodNotAllowed)
			return
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
		case "mkdir":
			mkdirHostRoot(w, jail, abs, disp)
		case "write", "upload":
			writeHostRoot(w, r, jail, abs, disp)
		case "clone":
			cloneHostRoot(w, r, jail, abs, disp, q.Get("url"))
		case "rename":
			renameHostRoot(w, r, jail, abs, disp, q.Get("to"))
		case "delete":
			deleteHostRoot(w, jail, abs, disp)
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

// mkdirHostRoot creates the jailed directory abs (plus any missing
// parents). -p semantics: an existing directory is not an error, matching
// the SPA's create-folder UX.
func mkdirHostRoot(w http.ResponseWriter, jail hostJail, abs, disp string) {
	_ = jail
	if err := os.MkdirAll(abs, 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir: %v", err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": disp})
}

// writeHostRoot replaces the jailed file abs with the request body,
// creating missing parents. Used for both `op=write` (create/overwrite,
// e.g. an empty file from the Create dialog) and `op=upload` (browser or
// URL uploads). The body streams straight to disk and is capped at
// maxHostWriteBytes.
func writeHostRoot(w http.ResponseWriter, r *http.Request, jail hostJail, abs, disp string) {
	_ = jail
	if st, err := os.Stat(abs); err == nil && st.IsDir() {
		writeErr(w, http.StatusBadRequest, "cannot overwrite a directory")
		return
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir parent: %v", err))
		return
	}
	f, err := os.OpenFile(abs, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("open: %v", err))
		return
	}
	defer f.Close()
	n, err := io.Copy(f, io.LimitReader(r.Body, maxHostWriteBytes+1))
	if err != nil {
		_ = os.Remove(abs)
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("write: %v", err))
		return
	}
	if n > maxHostWriteBytes {
		_ = os.Remove(abs)
		writeErr(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file exceeded %d bytes", maxHostWriteBytes))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": disp})
}

// cloneRepoName derives a safe destination directory name from a git URL:
// the URL path's basename with a trailing ".git" stripped, restricted to
// [A-Za-z0-9._-] and never "." / "..". Anything else is rejected so the
// name can be joined under the jail without re-validation.
func cloneRepoName(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("invalid URL: %v", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("URL must use http or https")
	}
	if u.Hostname() == "" {
		return "", fmt.Errorf("URL is missing a host")
	}
	base := strings.TrimSuffix(filepath.Base(strings.TrimSuffix(u.Path, "/")), ".git")
	if base == "" || base == "." || base == ".." || base == "/" {
		return "", fmt.Errorf("cannot derive a repository name from %q", raw)
	}
	for _, c := range base {
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '.' || c == '_' || c == '-') {
			return "", fmt.Errorf("cannot derive a repository name from %q", raw)
		}
	}
	if base[0] == '.' || base[0] == '-' {
		return "", fmt.Errorf("cannot derive a repository name from %q", raw)
	}
	return base, nil
}

// cloneHostRoot runs `git clone --depth 1 <url>` into the jailed directory
// abs (which names the PARENT the repo lands in). The panel pre-validates
// the URL's host; the edge re-checks the scheme, derives a sanitised
// directory name, refuses to overwrite, and runs git with no shell,
// no terminal prompts and a hard timeout.
func cloneHostRoot(w http.ResponseWriter, r *http.Request, jail hostJail, abs, disp string, urlQ string) {
	rawURL := urlQ
	if rawURL == "" {
		var body struct {
			URL string `json:"url"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		rawURL = body.URL
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		writeErr(w, http.StatusBadRequest, "clone requires a 'url' parameter")
		return
	}
	name, err := cloneRepoName(rawURL)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	st, err := os.Stat(abs)
	if err != nil || !st.IsDir() {
		writeErr(w, http.StatusBadRequest, "clone destination parent is not a directory")
		return
	}
	dest := filepath.Join(abs, name)
	if !within(jail.root, dest) {
		writeErr(w, http.StatusBadRequest, "invalid path")
		return
	}
	if _, err := os.Stat(dest); err == nil {
		writeErr(w, http.StatusConflict, fmt.Sprintf("%q already exists", name))
		return
	}
	if _, err := exec.LookPath("git"); err != nil {
		writeErr(w, http.StatusBadGateway, "git is not installed on this edge")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "clone", "--depth", "1", "--", rawURL, dest)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.RemoveAll(dest)
		msg := strings.TrimSpace(string(out))
		if len(msg) > 2048 {
			msg = msg[:2048] + "…"
		}
		if msg == "" {
			msg = err.Error()
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("git clone failed: %s", msg))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":   true,
		"path": strings.TrimSuffix(disp, "/") + "/" + name,
		"url":  rawURL,
	})
}

// renameHostRoot moves the jailed path abs to a jailed destination. Both
// `path` and `to` live in the same root-relative coordinate space (the SPA
// sends both as breadcrumb paths), so the destination is resolved through
// the identical jail — a `to` escaping the root is refused outright.
// Overwrites are refused (409): rename is for renaming, not replacing.
func renameHostRoot(w http.ResponseWriter, r *http.Request, jail hostJail, abs, disp, toQ string) {
	to := strings.TrimSpace(toQ)
	if to == "" {
		// Accept a JSON body too — POST ?op=rename with JSON is what
		// newer callers send; the query form keeps curl one-liners working.
		var body struct {
			To string `json:"to"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		to = strings.TrimSpace(body.To)
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "rename requires a 'to' parameter")
		return
	}
	destAbs, err := jail.resolve(to)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	destDisp := displayRel(to)
	if destAbs == abs {
		writeErr(w, http.StatusBadRequest, "source and destination are the same")
		return
	}
	if _, err := os.Stat(abs); err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	if _, err := os.Stat(destAbs); err == nil {
		writeErr(w, http.StatusConflict, fmt.Sprintf("%q already exists", filepath.Base(destAbs)))
		return
	}
	if err := os.Rename(abs, destAbs); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("rename: %v", err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "from": disp, "to": destDisp})
}

// trashPrefix names the staging directories deleteHostRoot renames doomed
// folders to before unlinking them in the background (see below). The prefix
// is deliberately distinctive so the stale-trash sweep below never touches
// operator data: only entries starting with this exact prefix are eligible,
// and only once they are older than trashMaxAge.
const trashPrefix = ".kspanel-trash-"

// trashMaxAge is how long a staged trash directory may linger before the
// lazy sweep treats it as orphaned (edge restarted mid-removal) and finishes
// the job. Generous on purpose: a huge world can take many minutes to unlink
// on a slow disk, and the sweep must never race a live background removal
// into redundant double walks of the same tree.
const trashMaxAge = 24 * time.Hour

// deleteHostRoot removes the jailed path abs. Files go synchronously (an
// unlink is instant). Directories are renamed to a hidden trash sibling
// first — an atomic, near-instant metadata operation even for trees with
// hundreds of thousands of files — the success response is sent
// immediately, and the recursive unlink happens in the background.
// Rationale: a synchronous os.RemoveAll holds the HTTP request open for the
// whole walk, and any proxy in front of the panel (Cloudflare, nginx,
// tunnels answer 502 past their own origin-response window, typically
// 30–100s, far below the panel's 5-minute proxy budget) kills the
// client-visible request while the server keeps deleting. The SPA then
// reports "0 of 1 deleted" for an operation that actually succeeded.
// Rename-away makes the name disappear instantly, so the refreshed listing
// already shows the item gone.
// The root itself can never be deleted.
func deleteHostRoot(w http.ResponseWriter, jail hostJail, abs, disp string) {
	if abs == jail.root {
		writeErr(w, http.StatusBadRequest, "cannot delete the instances root")
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	if !info.IsDir() {
		if err := os.Remove(abs); err != nil {
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("delete: %v", err))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": disp})
		return
	}
	// Directory: opportunistically finish orphaned trash from an earlier
	// delete whose background removal never completed (edge restart/crash),
	// then stage this one. The sweep is best-effort and never fails the
	// request.
	sweepStaleTrash(filepath.Dir(abs))
	trash := filepath.Join(filepath.Dir(abs), fmt.Sprintf("%s%d-%d", trashPrefix, os.Getpid(), time.Now().UnixNano()))
	if err := os.Rename(abs, trash); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("delete: %v", err))
		return
	}
	// Stamp the trash fresh: rename preserves the source directory's mtime
	// (often months old), which would otherwise look immediately stale to
	// the next sweep. Best-effort — worst case a later sweep simply helps
	// finish a removal that is already doomed, which still converges.
	now := time.Now()
	_ = os.Chtimes(trash, now, now)
	go func() {
		if err := os.RemoveAll(trash); err != nil {
			log.Printf("hostfiles: background delete of %q failed: %v", trash, err)
		}
	}()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": disp})
}

// sweepStaleTrash removes our own staged trash directories older than
// trashMaxAge inside dir. It only ever touches names carrying trashPrefix;
// anything else — including operator dotfiles — is left strictly alone.
func sweepStaleTrash(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	now := time.Now()
	for _, e := range entries {
		if !e.IsDir() || !strings.HasPrefix(e.Name(), trashPrefix) {
			continue
		}
		full := filepath.Join(dir, e.Name())
		fi, err := e.Info()
		if err != nil {
			continue
		}
		if now.Sub(fi.ModTime()) < trashMaxAge {
			continue
		}
		_ = os.RemoveAll(full)
	}
}
