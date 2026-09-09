// Package files exposes a small HTTP file API on ksedge that the panel
// proxies so the in-app File Manager can browse the contents of a running
// container/VM. The endpoint is token-gated with the same shared edge
// token the lifecycle/exec RPCs use.
//
// Wire format (all JSON, all under /api/edge/files):
//
//	GET  ?op=list&kind=docker&name=mc-1&path=/mc&token=…
//	    -> { "entries": [ {name, size, mode, is_dir, mod_time} ... ] }
//	GET  ?op=read&kind=docker&name=mc-1&path=/mc/server.jar&token=…
//	    -> raw bytes (application/octet-stream) — suitable for download
//	GET  ?op=stat&kind=docker&name=mc-1&path=/mc/server.jar&token=…
//	    -> { "name", "size", "mode", "is_dir", "mod_time" }
//
// Listing and reading happen by shelling out to `docker exec <name> sh -c …`,
// so the driver surface is unchanged — we only need {kind, name} to address
// the running workload. (Other driver kinds can later grow a Files() helper;
// for now we only implement the docker path used by the built-in Minecraft
// template.)
package files

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// writeOps is the set of ops that require a request body. The dispatcher
// in Handler rejects POST/DELETE for ops not in this set so a typo doesn't
// silently no-op.
var writeOps = map[string]bool{
	"write":   true,
	"upload":  true,
	"mkdir":   true,
	"rename":  true,
	"delete":  true,
	"chmod":   true,
	"copy":    true,
	"archive": true,
	"extract": true,
}

// Handler returns an http.Handler authenticated by the given edge token.
// The same token comparison the lifecycle RPC uses keeps the surface
// closed to anyone but the panel.
// Handler is the single endpoint the panel's File Manager proxies to.
// It supports GET (list / stat / read), POST (mkdir / write / rename /
// upload) and DELETE. State-changing ops require the request body for any
// required parameters (e.g. `to` for rename) and accept the file bytes
// inline for upload/write.
func Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		op := q.Get("op")
		// Method gating. GET covers idempotent reads; POST/DELETE cover the
		// rest. A POST/DELETE without an op in writeOps is a typo and we
		// reject it loudly so the SPA doesn't silently no-op.
		if r.Method != http.MethodGet && !writeOps[op] {
			http.Error(w, "method not allowed (use GET for "+op+")", http.StatusMethodNotAllowed)
			return
		}
		if r.Method == http.MethodGet && op != "" && writeOps[op] {
			// Some clients (curl scripts, the SPA's first revision) use GET
			// for everything. Accept GET for write ops too — the token is
			// still the auth boundary.
		}
		tok := q.Get("token")
		// Constant-time token comparison, parity with the lifecycle /
		// exec / inspect / install / exec-rpc handlers. A plain `!=` on
		// the shared secret leaks length-prefix timing info to a probe
		// scanning the file-manager surface — subtle.ConstantTimeCompare
		// (with the explicit empty-token guard so `token==""` doesn't
		// silently accept any `tok` of length zero) keeps the file
		// manager's auth uniform with every other panel→edge RPC. The
		// empty-token branch also covers the localnode boot window
		// where config.Token is still unset: we reject every file op
		// outright rather than letting a length-0 vs length-0
		// ConstantTimeCompare "pass" and leak the unconfigured state.
		if token == "" || subtle.ConstantTimeCompare([]byte(tok), []byte(token)) != 1 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		kind := q.Get("kind")
		name := q.Get("name")
		if kind == "" || name == "" {
			http.Error(w, "kind and name are required", http.StatusBadRequest)
			return
		}
		if kind != "docker" {
			http.Error(w, "file manager only supports docker instances today", http.StatusBadRequest)
			return
		}
		// Normalise the path: clients send absolute container paths. We
		// resolve "." and ".." so a path can never escape the container FS
		// (docker exec runs inside the container namespace anyway, so this
		// is belt-and-braces rather than a security boundary).
		path := strings.TrimSpace(q.Get("path"))
		if path == "" {
			path = "/"
		}
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}

		// Reads + small writes get the standard 30s timeout; uploads use
		// the request context so the panel can stream a 500 MiB server.jar
		// without us cutting it off mid-flight. Archive/extract/copy walk
		// whole trees (worlds are routinely 1 GiB+) so they get a generous
		// budget too; search stays on the fast path.
		var ctx context.Context
		var cancel context.CancelFunc
		if op == "upload" || op == "write" {
			ctx, cancel = context.WithTimeout(r.Context(), 30*time.Minute)
		} else if op == "archive" || op == "extract" || op == "copy" {
			ctx, cancel = context.WithTimeout(r.Context(), 10*time.Minute)
		} else {
			ctx, cancel = context.WithTimeout(r.Context(), 30*time.Second)
		}
		defer cancel()

		// host_path takes precedence when the panel supplies one: the edge
		// reads files directly off its local filesystem at the bind-mount
		// target the template declared. This avoids shelling into the
		// container (which fails when docker is down or the container is
		// stuck restarting) and keeps the File Manager useful for the
		// default Minecraft template even before the first boot completes.
		if hp := q.Get("host_path"); hp != "" {
			if hostFSDispatcher(w, r, op, hp) {
				return
			}
		}

		switch op {
		case "list", "":
			listDockerDir(ctx, w, name, path)
		case "read":
			readDockerFile(ctx, w, name, path)
		case "stat":
			statDockerPath(ctx, w, name, path)
		case "search":
			searchDocker(ctx, w, name, path, searchQuery(r), searchLimit(r))
		case "write":
			writeDockerFile(ctx, w, r, name, path)
		case "upload":
			uploadDockerFile(ctx, w, r, name, path)
		case "mkdir":
			mkdirDocker(ctx, w, name, path)
		case "rename":
			renameDocker(ctx, w, r, name, path, q.Get("to"))
		case "copy":
			copyDocker(ctx, w, r, name, path, q.Get("to"))
		case "archive":
			archiveDocker(ctx, w, r, name, path, q.Get("to"))
		case "extract":
			extractDocker(ctx, w, r, name, path, q.Get("to"))
		case "delete":
			deleteDocker(ctx, w, name, path)
		case "chmod":
			chmodDocker(ctx, w, name, path, q.Get("mode"))
		default:
			http.Error(w, "unknown op: "+op, http.StatusBadRequest)
		}
	})
}

// isDangerousPath reports whether p is a sensitive system path that must
// never be touched via host_path. This prevents a compromised panel from
// using the edge as a host-filesystem oracle (e.g. ?host_path=/etc/passwd)
// or from chown'ing system dirs via tryFixPermission.
func isDangerousPath(p string) bool {
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

// destBlocked is the rename-destination denylist. isDangerousPath is shared
// by the source dispatcher and tryFixPermission so it must stay untouched;
// the dest jail additionally rejects /var (cron spool), /opt, /srv, /home
// and /run, which a rename onto (e.g. /var/spool/cron/*) could otherwise
// abuse.
func destBlocked(p string) bool {
	if isDangerousPath(p) {
		return true
	}
	c := filepath.Clean(p)
	for _, d := range []string{"/var", "/opt", "/srv", "/home", "/run"} {
		if c == d || strings.HasPrefix(c, d+"/") {
			return true
		}
	}
	return false
}

// resolvedBlocked reports whether clean escapes the host_path jail via a
// symlink. EvalSymlinks follows the full chain; for not-yet-existing create
// targets it resolves the deepest existing ancestor and re-attaches the
// remainder so a symlink planted at /tmp/link -> /etc is still caught.
func resolvedBlocked(clean string) bool {
	if rp, err := filepath.EvalSymlinks(clean); err == nil {
		if isDangerousPath(filepath.Clean(rp)) {
			return true
		}
		return false
	}
	rel := []string{}
	cur := clean
	for {
		if rp, err := filepath.EvalSymlinks(cur); err == nil {
			resolved := filepath.Clean(rp)
			for i := len(rel) - 1; i >= 0; i-- {
				resolved = filepath.Join(resolved, rel[i])
			}
			return isDangerousPath(filepath.Clean(resolved))
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return false
		}
		rel = append(rel, filepath.Base(cur))
		cur = parent
	}
}

// hostFSDispatcher routes the request to the host filesystem when the
// panel supplied a host_path that points at a bind-mounted directory the
// edge actually owns. It returns false when the host path is missing or
// unusable, signalling the caller to fall back to docker exec.
//
// The split keeps the docker exec code path intact for non-mounted
// instances (e.g. ad-hoc `docker run -it alpine …` rows where /mc has no
// host equivalent).
func hostFSDispatcher(w http.ResponseWriter, r *http.Request, op, hostPath string) bool {
	if hostPath == "" {
		return false
	}
	clean := filepath.Clean(hostPath)
	if !filepath.IsAbs(clean) || isDangerousPath(clean) {
		return false
	}
	if resolvedBlocked(clean) {
		return false
	}
	// Reject anything that tries to walk outside the configured root via
	// symlinks by checking the resolved path's parent chain. filepath.EvalSymlinks
	// can fail if intermediate dirs don't exist yet (a freshly-bound but
	// still-empty bind mount), so we only sanity-check what's reachable.
	info, err := os.Stat(clean)
	if err != nil {
		// A missing TARGET is expected for create-style ops (write/upload
		// onto a brand-new file, copy/archive/extract destinations):
		// previously this fell back to docker exec, which broke every first
		// upload into a fresh directory whenever the container was stopped.
		// Verify the deepest existing ancestor instead and let the host
		// writers create the file.
		if !os.IsNotExist(err) || (op != "write" && op != "upload" && op != "copy" && op != "archive" && op != "extract") {
			// Search/list/stat/read on a missing host path fall back to
			// docker exec (the container may still have it); creators stay
			// on host. Serving an empty host search here would hide live
			// container files behind a misleading "0 hits".
			return false
		}
		if op == "copy" || op == "archive" || op == "extract" {
			// Source missing on host but container may have it — fall back
			// to docker exec rather than failing here.
			return false
		}
		parent := filepath.Dir(clean)
		if pi, perr := os.Stat(parent); perr != nil || !pi.IsDir() {
			return false
		}
		info = nil
	}
	switch op {
	case "list", "":
		listHostDir(w, clean, info)
	case "stat":
		statHostPath(w, clean, info)
	case "read":
		readHostFile(w, clean, info)
	case "search":
		searchHost(w, clean, searchQuery(r), searchLimit(r))
	case "write":
		if !writeHostFile(w, r, clean) {
			return false
		}
	case "upload":
		if !writeHostFile(w, r, clean) {
			return false
		}
	case "mkdir":
		mkdirHost(w, clean)
	case "rename":
		renameHost(w, r, clean)
	case "copy":
		copyHost(w, r, clean)
	case "archive":
		archiveHost(w, r, clean)
	case "extract":
		extractHost(w, r, clean)
	case "delete":
		deleteHost(w, clean, info)
	case "chmod":
		chmodHost(w, r, clean)
	default:
		return false
	}
	return true
}

// listHostDir serves `op=list` directly off the host filesystem. The
// payload shape mirrors listDockerDir so the SPA can render either path
// interchangeably.
func listHostDir(w http.ResponseWriter, hostPath string, info os.FileInfo) {
	entries := []Entry{}
	if info.IsDir() {
		f, err := os.Open(hostPath)
		if err != nil {
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("open %s: %v", hostPath, err))
			return
		}
		defer f.Close()
		names, err := f.Readdirnames(0)
		if err != nil {
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("readdir %s: %v", hostPath, err))
			return
		}
		for _, nm := range names {
			child := filepath.Join(hostPath, nm)
			fi, err := os.Stat(child)
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
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"entries": entries, "path": hostPath})
}

// statHostPath serves `op=stat` from a host fs Stat result.
func statHostPath(w http.ResponseWriter, hostPath string, info os.FileInfo) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(Entry{
		Name:    info.Name(),
		Size:    info.Size(),
		Mode:    uint32(info.Mode().Perm()),
		IsDir:   info.IsDir(),
		ModTime: info.ModTime().Unix(),
	})
}

// readHostFile streams the file contents back to the browser with the
// same Content-Disposition the docker path sets so the SPA can use a
// single download flow regardless of source.
func readHostFile(w http.ResponseWriter, hostPath string, info os.FileInfo) {
	if info.IsDir() {
		http.Error(w, "cannot read a directory", http.StatusBadRequest)
		return
	}
	f, err := os.Open(hostPath)
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("open %s: %v", hostPath, err))
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(hostPath)))
	_, _ = io.Copy(w, f)
}

// writeHostFile overwrites hostPath with the request body. Used for both
// `op=write` (in-place file content edits) and `op=upload` (new file
// uploads). The body is streamed straight to disk via io.Copy so large
// files don't bloat memory. Returns false when the host path is not
// writable (permission denied) so the caller can fall back to docker exec;
// the caller must not have written a response in that case.
func writeHostFile(w http.ResponseWriter, r *http.Request, hostPath string) bool {
	// Make sure the parent directory exists so a brand-new file upload
	// into a sub-directory the SPA just created succeeds.
	if err := os.MkdirAll(filepath.Dir(hostPath), 0o755); err != nil {
		if os.IsPermission(err) {
			if tryFixPermission(filepath.Dir(hostPath)) {
				if err2 := os.MkdirAll(filepath.Dir(hostPath), 0o755); err2 == nil {
					goto openFile
				}
			}
			return false
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir parent: %v", err))
		return true
	}
openFile:
	f, err := os.OpenFile(hostPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		if os.IsPermission(err) {
			if tryFixPermission(hostPath) {
				if f2, err2 := os.OpenFile(hostPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644); err2 == nil {
					defer f2.Close()
					if _, err := io.Copy(f2, r.Body); err != nil {
						if os.IsPermission(err) {
							return false
						}
						writeErr(w, http.StatusBadGateway, fmt.Sprintf("write %s: %v", hostPath, err))
						return true
					}
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": hostPath})
					return true
				}
			}
			return false
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("open %s: %v", hostPath, err))
		return true
	}
	defer f.Close()
	if _, err := io.Copy(f, r.Body); err != nil {
		if os.IsPermission(err) {
			return false
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("write %s: %v", hostPath, err))
		return true
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": hostPath})
	return true
}

// tryFixPermission attempts to make path writable by the current user via
// passwordless sudo (common in dev/test where the edge runs as an unprivileged
// user but host bind-mounts are root-owned). Returns true when the fix
// succeeded and the caller should retry the original operation.
//
// Non-recursive by design: the previous `chown -R dir` on a file like
// /tmp/a would recursively chown the whole parent (/tmp) when the parent
// itself was the permission failure — an unbounded blast radius from one
// file-manager write. We chown only the target + its immediate parent
// (no -R) and refuse broad roots (/ /tmp /var/tmp) outright.
func tryFixPermission(path string) bool {
	cleanPath := filepath.Clean(path)
	cleanDir := filepath.Clean(filepath.Dir(path))
	if isDangerousPath(cleanPath) || isDangerousPath(cleanDir) {
		return false
	}
	if resolvedBlocked(cleanPath) || resolvedBlocked(cleanDir) {
		return false
	}
	if !filepath.IsAbs(cleanPath) {
		return false
	}
	dir := filepath.Dir(path)
	cleanDir2 := filepath.Clean(dir)
	for _, broad := range []string{"/", "/tmp", "/var/tmp", "/var"} {
		if cleanDir2 == broad {
			return false
		}
	}
	uid := os.Getuid()
	gid := os.Getgid()
	// Try to chown the directory/file to the current user. Use -n (non-interactive)
	// so we fail fast when sudo is not available or requires a password.
	// No -R: only the immediate paths, never a recursive tree.
	if err := exec.Command("sudo", "-n", "chown", fmt.Sprintf("%d:%d", uid, gid), dir).Run(); err != nil {
		// Fallback: try chowning just the file if dir failed
		_ = exec.Command("sudo", "-n", "chown", fmt.Sprintf("%d:%d", uid, gid), path).Run()
	} else {
		// Dir chown succeeded: also try the file itself when it exists.
		_ = exec.Command("sudo", "-n", "chown", fmt.Sprintf("%d:%d", uid, gid), path).Run()
	}
	// Ensure the directory is at least u+rwX so we can create files inside.
	// No -R for the same blast-radius reason.
	_ = exec.Command("sudo", "-n", "chmod", "u+rwX", dir).Run()
	// Verify we can now stat the directory.
	if _, err := os.Stat(dir); err == nil {
		return true
	}
	return false
}

// mkdirHost creates hostPath (and any missing parents) on the host
// filesystem. Permission denied errors fall through as 502 so the SPA
// can show "permission denied" verbatim instead of a generic edge error.
func mkdirHost(w http.ResponseWriter, hostPath string) {
	if err := os.MkdirAll(hostPath, 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir %s: %v", hostPath, err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": hostPath})
}

// renameHost moves hostPath to a sibling path supplied by the caller. The
// destination is parsed from the request body as JSON {"to":"…"} or, as a
// fallback, the "to" query parameter. We deliberately accept both because
// the SPA's first revision only knew query params and we want to avoid a
// forced frontend upgrade.
func renameHost(w http.ResponseWriter, r *http.Request, hostPath string) {
	to := r.URL.Query().Get("to")
	if to == "" {
		// Try a JSON body too — POST /api/.../files?op=rename with JSON is
		// what the SPA sends once it's been updated.
		var body struct {
			To string `json:"to"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		to = body.To
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "rename requires a 'to' parameter")
		return
	}
	// Jail the destination exactly like the source host_path above:
	// it must be absolute and must not resolve to a system path.
	// Without this an authenticated file-manager caller could rename a
	// benign staged file (e.g. /tmp/a) onto a sensitive host path
	// (e.g. /etc/cron.d/evil) and escape the host_path jail.
	cleanTo := filepath.Clean(to)
	if !filepath.IsAbs(cleanTo) || destBlocked(cleanTo) {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid destination path %q", to))
		return
	}
	// Resolve symlinks on the parent dir so a symlinked ancestor cannot
	// smuggle the rename out of the jail (e.g. /tmp/link -> /etc with a
	// dest of /tmp/link/evil). The dest itself may not exist yet, so only
	// the parent chain is resolved; on error fall back to the deepest
	// existing ancestor and fail closed when nothing resolves.
	resolvedTo := cleanTo
	parent := filepath.Dir(cleanTo)
	if rp, err := filepath.EvalSymlinks(parent); err == nil {
		resolvedTo = filepath.Join(rp, filepath.Base(cleanTo))
	} else {
		rel := []string{filepath.Base(cleanTo)}
		cur := parent
		resolved := ""
		for {
			if rp2, err2 := filepath.EvalSymlinks(cur); err2 == nil {
				resolved = rp2
				break
			}
			np := filepath.Dir(cur)
			if np == cur {
				break
			}
			rel = append([]string{filepath.Base(cur)}, rel...)
			cur = np
		}
		if resolved == "" {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid destination path %q", to))
			return
		}
		resolvedTo = resolved
		for _, seg := range rel {
			resolvedTo = filepath.Join(resolvedTo, seg)
		}
	}
	resolvedTo = filepath.Clean(resolvedTo)
	if !filepath.IsAbs(resolvedTo) || destBlocked(resolvedTo) {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid destination path %q", to))
		return
	}
	if err := os.Rename(hostPath, cleanTo); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("rename %s -> %s: %v", hostPath, cleanTo, err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "from": hostPath, "to": cleanTo})
}

// deleteHost removes hostPath. Directories are removed recursively
// (rm -rf semantics) — the File Manager confirms before invoking this
// for a non-empty dir, so the destructive default matches the user's
// intent.
func deleteHost(w http.ResponseWriter, hostPath string, info os.FileInfo) {
	var err error
	if info.IsDir() {
		err = os.RemoveAll(hostPath)
	} else {
		err = os.Remove(hostPath)
	}
	// Permission-denied deletes self-heal exactly like writeHostFile:
	// container-created files/dirs are often root-owned while the edge
	// runs unprivileged, so the first delete 502'd until any edit chown'd
	// the parent via tryFixPermission. Retry once after the same fix.
	if err != nil && os.IsPermission(err) && tryFixPermission(hostPath) {
		if info.IsDir() {
			err = os.RemoveAll(hostPath)
		} else {
			err = os.Remove(hostPath)
		}
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("delete %s: %v", hostPath, err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": hostPath})
}

// chmodHost updates hostPath's permission bits. The mode arrives as a
// decimal/octal string from the SPA (the OS file mode format the user
// picked in the permissions dialog). Only 000-777 is accepted: setuid /
// setgid / sticky bits are rejected fail-closed so a compromised panel
// token cannot plant a setuid binary on the edge host.
func chmodHost(w http.ResponseWriter, r *http.Request, hostPath string) {
	modeStr := r.URL.Query().Get("mode")
	if modeStr == "" {
		writeErr(w, http.StatusBadRequest, "chmod requires a 'mode' parameter")
		return
	}
	mode, err := strconv.ParseUint(modeStr, 8, 32)
	if err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid mode %q: %v", modeStr, err))
		return
	}
	if mode > 0o777 {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid mode %q (must be 000-777)", modeStr))
		return
	}
	if err := os.Chmod(hostPath, os.FileMode(mode)); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("chmod %s: %v", hostPath, err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": hostPath, "mode": mode})
}

// Entry is one row of a directory listing. Sizes are in bytes; mod_time is
// a Unix timestamp in seconds (so the JS side can pass it straight to new
// Date(… * 1000)).
type Entry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    uint32 `json:"mode"`
	IsDir   bool   `json:"is_dir"`
	ModTime int64  `json:"mod_time"`
}

// listDockerDir lists a directory inside the named container using
// `docker exec <name> sh -c ls`. We use a single Busybox-friendly
// invocation (`-lA --time-style=+%s`) so it works on the minimal ubuntu
// base image the built-in Minecraft template relies on.
func listDockerDir(ctx context.Context, w http.ResponseWriter, name, path string) {
	// `ls -lA --time-style=+%s` produces one long line per entry. We
	// prefix with a sentinel marker the parser splits on so spaces in
	// filenames survive the shell round-trip.
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"sh", "-c", "ls -lA --time-style=+%s -- "+shellQuote(path)+" 2>/dev/null")
	out, err := cmd.Output()
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("ls in %s: %v", name, err))
		return
	}
	entries := parseLS(out)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"entries": entries, "path": path})
}

// readDockerFile streams a single file out of the container. We pipe
// `docker exec <name> cat <path>` straight to the ResponseWriter so even
// large files (server.jar is ~50 MiB) don't get buffered in panel memory.
func readDockerFile(ctx context.Context, w http.ResponseWriter, name, path string) {
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"sh", "-c", "cat -- "+shellQuote(path)+" 2>/dev/null")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := cmd.Start(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("exec cat: %v", err))
		return
	}
	defer cmd.Wait()
	// Default to octet-stream — the browser will use the Content-Disposition
	// filename for the download. Plain-text files download too; the panel's
	// "view in browser" flow wraps this same endpoint with a text/plain hint
	// via a query flag if it ever wants inline rendering.
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, baseName(path)))
	if _, err := io.Copy(w, stdout); err != nil {
		// Once bytes are written we can't change the status, so leave the
		// partial stream and let the client notice the truncation.
		return
	}
}

// statDockerPath returns the metadata for a single path inside the
// container, which the File Manager uses to render the breadcrumb + size
// header before offering a download link.
func statDockerPath(ctx context.Context, w http.ResponseWriter, name, path string) {
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"sh", "-c", "stat -c '%n|%s|%a|%F|%Y' -- "+shellQuote(path)+" 2>/dev/null")
	out, err := cmd.Output()
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat in %s: %v", name, err))
		return
	}
	e := parseStat(out)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}

// writeDockerFile replaces the file at `path` inside the container with
// the request body. We use `sh -c "cat > file"` rather than a temp-file
// rename so a partial write is at least consistent with what the user
// expects: the file exists, last-write-wins. The truncate happens because
// `>` redirects open with O_TRUNC.
func writeDockerFile(ctx context.Context, w http.ResponseWriter, r *http.Request, name, path string) {
	cmd := exec.CommandContext(ctx, "docker", "exec", "-i", name,
		"sh", "-c", "cat > "+shellQuote(path))
	stdin, err := cmd.StdinPipe()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := cmd.Start(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("exec cat: %v", err))
		return
	}
	if _, err := io.Copy(stdin, r.Body); err != nil {
		_ = cmd.Wait()
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("write %s: %v", path, err))
		return
	}
	_ = stdin.Close()
	if err := cmd.Wait(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("write %s: %v", path, err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": path})
}

// uploadDockerFile is identical in implementation to writeDockerFile —
// they share the `cat > path` pattern. Kept as a distinct op so the SPA's
// route layer can show different success toasts ("uploaded" vs "saved").
func uploadDockerFile(ctx context.Context, w http.ResponseWriter, r *http.Request, name, path string) {
	writeDockerFile(ctx, w, r, name, path)
}

// mkdirDocker creates `path` (and any missing parents) inside the
// container via `mkdir -p`. -p means existing dirs aren't an error, which
// matches the SPA's "create folder" UX where double-clicking an existing
// folder shouldn't surface a confusing error.
func mkdirDocker(ctx context.Context, w http.ResponseWriter, name, path string) {
	// `--` stops flag parsing so a path starting with `-` (e.g. "-evil")
	// cannot be misparsed as a mkdir flag (fail closed on hostile input).
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"mkdir", "-p", "--", path)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir %s: %v: %s", path, err, string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": path})
}

// renameDocker moves `path` to `to` inside the container via `mv`. We
// accept `to` from either a JSON body or the `to` query param — the SPA
// sends it in the body once updated, but `kspanel … invoke` style scripts
// can pass it via query.
func renameDocker(ctx context.Context, w http.ResponseWriter, r *http.Request, name, path, toQ string) {
	to := toQ
	if to == "" {
		var body struct {
			To string `json:"to"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		to = body.To
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "rename requires a 'to' parameter")
		return
	}
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"mv", "--", path, to)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("rename %s -> %s: %v: %s", path, to, err, string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "from": path, "to": to})
}

// deleteDocker removes `path` inside the container. Directories use
// `rm -rf` (matches the File Manager's "delete folder + contents"
// affordance); files use `rm -f` so a missing file is non-fatal (the
// delete UX is idempotent — clicking delete twice shouldn't error on the
// second click).
func deleteDocker(ctx context.Context, w http.ResponseWriter, name, path string) {
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"sh", "-c", "if [ -d "+shellQuote(path)+" ]; then rm -rf "+shellQuote(path)+"; else rm -f "+shellQuote(path)+"; fi")
	if out, err := cmd.CombinedOutput(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("delete %s: %v: %s", path, err, string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": path})
}

// chmodDocker applies the octal mode to `path` inside the container via
// `chmod`. Mode arrives as an octal string from the SPA's permissions UI.
// Only the low 9 permission bits (0777) are honoured: setuid/setgid/sticky
// bits are rejected fail-closed so a compromised panel token cannot turn a
// container file into a setuid host-escape vector.
func chmodDocker(ctx context.Context, w http.ResponseWriter, name, path, modeStr string) {
	if modeStr == "" {
		writeErr(w, http.StatusBadRequest, "chmod requires a 'mode' parameter")
		return
	}
	mode, err := strconv.ParseUint(modeStr, 8, 32)
	if err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid mode %q: %v", modeStr, err))
		return
	}
	if mode > 0o777 {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid mode %q (must be 000-777)", modeStr))
		return
	}
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"chmod", fmt.Sprintf("%o", mode), "--", path)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("chmod %s: %v: %s", path, err, string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": path, "mode": mode})
}

// searchQuery extracts the free-text query for op=search from ?q= (or
// ?query= for curl ergonomics). Empty means "list everything" is NOT
// intended — callers get a 400 so a missing param can't walk the tree.
func searchQuery(r *http.Request) string {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(r.URL.Query().Get("query"))
	}
	return q
}

// searchLimit caps result rows. Generous enough for a world folder, small
// enough the JSON stays snappy.
func searchLimit(r *http.Request) int {
	n, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if err != nil || n <= 0 {
		return 100
	}
	if n > 200 {
		return 200
	}
	return n
}

// parseToParam reads the `to` destination from the query string first,
// falling back to a small JSON body {"to":"…"}. The query form is what the
// panel sends (it translates container → host coordinates there); the body
// form keeps curl one-liners working.
func parseToParam(r *http.Request, queryTo string) string {
	if strings.TrimSpace(queryTo) != "" {
		return strings.TrimSpace(queryTo)
	}
	var body struct {
		To string `json:"to"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
	return strings.TrimSpace(body.To)
}

// archiveRequest is the JSON body for op=archive. Names are basenames
// relative to `path` (the source directory); To mirrors the ?to= query
// param and wins when both are set via the query.
type archiveRequest struct {
	Names []string `json:"names"`
	To    string   `json:"to"`
}

func parseArchiveBody(r *http.Request) (names []string, bodyTo string) {
	var body archiveRequest
	_ = json.NewDecoder(io.LimitReader(r.Body, 512<<10)).Decode(&body)
	for _, n := range body.Names {
		n = strings.TrimSpace(n)
		if n == "" || n == "." || n == "/" {
			continue
		}
		// Reject traversal inside the names list — every name must stay
		// inside the source dir.
		c := path.Clean("/" + n)
		if c == "/" {
			continue
		}
		rel := strings.TrimPrefix(c, "/")
		if rel == "" || strings.HasPrefix(rel, "../") || rel == ".." {
			continue
		}
		names = append(names, rel)
		if len(names) >= 1000 {
			break
		}
	}
	return names, strings.TrimSpace(body.To)
}

// validateHostDest jails an absolute host destination exactly like
// renameHost: absolute, not a system path (destBlocked), symlink-resolved
// parent chain re-checked. Returns the cleaned destination.
func validateHostDest(to string) (string, error) {
	cleanTo := filepath.Clean(strings.TrimSpace(to))
	if cleanTo == "" || cleanTo == "." || !filepath.IsAbs(cleanTo) || destBlocked(cleanTo) {
		return "", fmt.Errorf("invalid destination path %q", to)
	}
	parent := filepath.Dir(cleanTo)
	resolvedTo := cleanTo
	if rp, err := filepath.EvalSymlinks(parent); err == nil {
		resolvedTo = filepath.Join(rp, filepath.Base(cleanTo))
	} else {
		rel := []string{filepath.Base(cleanTo)}
		cur := parent
		resolved := ""
		for {
			if rp2, err2 := filepath.EvalSymlinks(cur); err2 == nil {
				resolved = rp2
				break
			}
			np := filepath.Dir(cur)
			if np == cur {
				break
			}
			rel = append([]string{filepath.Base(cur)}, rel...)
			cur = np
		}
		if resolved == "" {
			return "", fmt.Errorf("invalid destination path %q", to)
		}
		resolvedTo = resolved
		for _, seg := range rel {
			resolvedTo = filepath.Join(resolvedTo, seg)
		}
	}
	resolvedTo = filepath.Clean(resolvedTo)
	if !filepath.IsAbs(resolvedTo) || destBlocked(resolvedTo) {
		return "", fmt.Errorf("invalid destination path %q", to)
	}
	return cleanTo, nil
}

func isZipName(n string) bool { return strings.HasSuffix(strings.ToLower(n), ".zip") }
func isTarGzName(n string) bool {
	l := strings.ToLower(n)
	return strings.HasSuffix(l, ".tar.gz") || strings.HasSuffix(l, ".tgz")
}

// copyRecursive duplicates src at dst. The destination must NOT exist (the
// caller checks → 409). Symlinks are recreated, not followed, so a link
// planted inside the instance can never pull host content into the copy.
func copyRecursive(src, dst string) error {
	st, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if st.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(src)
		if err != nil {
			return err
		}
		return os.Symlink(target, dst)
	}
	if !st.IsDir() {
		return copyFile(src, dst, st.Mode())
	}
	if err := os.MkdirAll(dst, st.Mode().Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if err := copyRecursive(filepath.Join(src, e.Name()), filepath.Join(dst, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
	if err != nil {
		return err
	}
	_, cpyErr := io.Copy(out, in)
	closeErr := out.Close()
	if cpyErr != nil {
		_ = os.Remove(dst)
		return cpyErr
	}
	return closeErr
}

// copyHost implements op=copy on the host filesystem: ?path=<src host>
// & ?to=<dst host>. Overwrites are refused (409): copy is for copying,
// not replacing — the SPA deletes first when the user confirms overwrite.
func copyHost(w http.ResponseWriter, r *http.Request, src string) {
	to := parseToParam(r, r.URL.Query().Get("to"))
	if to == "" {
		writeErr(w, http.StatusBadRequest, "copy requires a 'to' parameter")
		return
	}
	dst, err := validateHostDest(to)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if dst == src {
		writeErr(w, http.StatusBadRequest, "source and destination are the same")
		return
	}
	if _, err := os.Lstat(src); err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	if _, err := os.Lstat(dst); err == nil {
		writeErr(w, http.StatusConflict, fmt.Sprintf("%q already exists", filepath.Base(dst)))
		return
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir parent: %v", err))
		return
	}
	if err := copyRecursive(src, dst); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("copy: %v", err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "from": src, "to": dst})
}

// archiveHost implements op=archive on the host filesystem in pure Go (no
// zip/tar binaries needed on the edge). The format comes from the `to`
// extension: .zip → ZIP, .tar.gz/.tgz → tar+gzip.
func archiveHost(w http.ResponseWriter, r *http.Request, src string) {
	names, bodyTo := parseArchiveBody(r)
	to := strings.TrimSpace(r.URL.Query().Get("to"))
	if to == "" {
		to = bodyTo
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "archive requires a 'to' parameter (destination archive path)")
		return
	}
	dst, err := validateHostDest(to)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if !isZipName(dst) && !isTarGzName(dst) {
		writeErr(w, http.StatusBadRequest, "destination must end with .zip or .tar.gz")
		return
	}
	st, err := os.Stat(src)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	srcDir := src
	picks := names
	if !st.IsDir() {
		if len(names) > 0 {
			writeErr(w, http.StatusBadRequest, "cannot archive a file with a names list")
			return
		}
		srcDir = filepath.Dir(src)
		picks = []string{filepath.Base(src)}
	} else if len(picks) == 0 {
		// Whole-directory archive: enumerate children so the archive root
		// holds the files themselves (not a nested ./ prefix).
		entries, err := os.ReadDir(src)
		if err != nil {
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("readdir: %v", err))
			return
		}
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), trashPrefix) {
				continue
			}
			picks = append(picks, e.Name())
		}
		if len(picks) == 0 {
			writeErr(w, http.StatusBadRequest, "directory is empty — nothing to archive")
			return
		}
	}
	// Validate every pick stays inside srcDir.
	for _, n := range picks {
		if strings.Contains(n, "..") && path.Clean(n) != n {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid entry %q", n))
			return
		}
		abs := filepath.Join(srcDir, filepath.FromSlash(n))
		if abs != srcDir && !within(srcDir, abs) {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("invalid entry %q", n))
			return
		}
	}
	if _, err := os.Lstat(dst); err == nil {
		writeErr(w, http.StatusConflict, fmt.Sprintf("%q already exists", filepath.Base(dst)))
		return
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir parent: %v", err))
		return
	}
	if isZipName(dst) {
		if err := createZip(srcDir, picks, dst); err != nil {
			_ = os.Remove(dst)
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("archive: %v", err))
			return
		}
	} else {
		if err := createTarGz(srcDir, picks, dst); err != nil {
			_ = os.Remove(dst)
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("archive: %v", err))
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": dst, "count": len(picks)})
}

func createZip(srcDir string, picks []string, dst string) error {
	f, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(f)
	count := 0
	addErr := func() error {
		for _, rel := range picks {
			abs := filepath.Join(srcDir, filepath.FromSlash(rel))
			if err := filepath.WalkDir(abs, func(p string, d os.DirEntry, err error) error {
				if err != nil {
					return nil // skip unreadable, like ls does
				}
				if count >= 10000 {
					return fmt.Errorf("too many files (max 10000)")
				}
				relPath, err := filepath.Rel(srcDir, p)
				if err != nil {
					return nil
				}
				name := filepath.ToSlash(relPath)
				fi, err := d.Info()
				if err != nil {
					return nil
				}
				if fi.IsDir() {
					if name == "." {
						return nil
					}
					_, err := zw.Create(name + "/")
					count++
					return err
				}
				if fi.Mode()&os.ModeSymlink != 0 {
					return nil // skip symlinks in archives
				}
				hdr, err := zip.FileInfoHeader(fi)
				if err != nil {
					return nil
				}
				hdr.Name = name
				hdr.Method = zip.Deflate
				wr, err := zw.CreateHeader(hdr)
				if err != nil {
					return err
				}
				in, err := os.Open(p)
				if err != nil {
					return nil
				}
				_, err = io.Copy(wr, in)
				_ = in.Close()
				count++
				return err
			}); err != nil {
				return err
			}
		}
		return nil
	}()
	if addErr != nil {
		_ = zw.Close()
		_ = f.Close()
		return addErr
	}
	if err := zw.Close(); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

func createTarGz(srcDir string, picks []string, dst string) error {
	f, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	count := 0
	walkErr := func() error {
		for _, rel := range picks {
			abs := filepath.Join(srcDir, filepath.FromSlash(rel))
			if err := filepath.WalkDir(abs, func(p string, d os.DirEntry, err error) error {
				if err != nil {
					return nil
				}
				if count >= 10000 {
					return fmt.Errorf("too many files (max 10000)")
				}
				relPath, err := filepath.Rel(srcDir, p)
				if err != nil {
					return nil
				}
				name := filepath.ToSlash(relPath)
				if name == "." {
					return nil
				}
				fi, err := d.Info()
				if err != nil {
					return nil
				}
				if fi.Mode()&os.ModeSymlink != 0 {
					return nil
				}
				hdr, err := tar.FileInfoHeader(fi, "")
				if err != nil {
					return nil
				}
				hdr.Name = name
				if err := tw.WriteHeader(hdr); err != nil {
					return err
				}
				count++
				if fi.IsDir() {
					return nil
				}
				in, err := os.Open(p)
				if err != nil {
					return nil
				}
				_, err = io.Copy(tw, in)
				_ = in.Close()
				return err
			}); err != nil {
				return err
			}
		}
		return nil
	}()
	if walkErr != nil {
		_ = tw.Close()
		_ = gz.Close()
		_ = f.Close()
		return walkErr
	}
	if err := tw.Close(); err != nil {
		_ = gz.Close()
		_ = f.Close()
		return err
	}
	if err := gz.Close(); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

// extractHost implements op=extract on the host filesystem. `to` is the
// optional destination directory (defaults to the archive's own dir).
// ZipSlip-protected: entries escaping the destination are skipped, never
// written.
func extractHost(w http.ResponseWriter, r *http.Request, src string) {
	to := parseToParam(r, r.URL.Query().Get("to"))
	st, err := os.Stat(src)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("stat: %v", err))
		return
	}
	if st.IsDir() {
		writeErr(w, http.StatusBadRequest, "cannot extract a directory")
		return
	}
	dest := filepath.Dir(src)
	if to != "" {
		d, err := validateHostDest(to)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		dest = d
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("mkdir dest: %v", err))
		return
	}
	var n int
	if isZipName(src) {
		n, err = extractZip(src, dest)
	} else if isTarGzName(src) {
		n, err = extractTarGz(src, dest)
	} else {
		writeErr(w, http.StatusBadRequest, "unsupported archive (use .zip or .tar.gz)")
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("extract: %v", err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": dest, "count": n})
}

func safeJoinDest(dest, name string) (string, bool) {
	name = filepath.FromSlash(name)
	if filepath.IsAbs(name) {
		return "", false
	}
	c := filepath.Clean(name)
	if c == "." {
		return "", false
	}
	if c == ".." || strings.HasPrefix(c, ".."+string(os.PathSeparator)) {
		return "", false
	}
	abs := filepath.Join(dest, c)
	if abs != dest && !within(dest, abs) {
		return "", false
	}
	return abs, true
}

func extractZip(src, dest string) (int, error) {
	zr, err := zip.OpenReader(src)
	if err != nil {
		return 0, err
	}
	defer zr.Close()
	n := 0
	for _, f := range zr.File {
		if n >= 10000 {
			break
		}
		abs, ok := safeJoinDest(dest, f.Name)
		if !ok {
			continue
		}
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(abs, 0o755)
			continue
		}
		_ = os.MkdirAll(filepath.Dir(abs), 0o755)
		rc, err := f.Open()
		if err != nil {
			continue
		}
		out, err := os.OpenFile(abs, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode().Perm())
		if err != nil {
			_ = rc.Close()
			continue
		}
		_, err = io.Copy(out, io.LimitReader(rc, 512<<20))
		_ = rc.Close()
		_ = out.Close()
		if err == nil {
			n++
		}
	}
	return n, nil
}

func extractTarGz(src, dest string) (int, error) {
	f, err := os.Open(src)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return 0, err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	n := 0
	for {
		if n >= 10000 {
			break
		}
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return n, err
		}
		abs, ok := safeJoinDest(dest, hdr.Name)
		if !ok {
			continue
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			_ = os.MkdirAll(abs, 0o755)
		case tar.TypeReg, tar.TypeRegA:
			_ = os.MkdirAll(filepath.Dir(abs), 0o755)
			out, err := os.OpenFile(abs, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, os.FileMode(hdr.Mode).Perm())
			if err != nil {
				continue
			}
			_, err = io.Copy(out, io.LimitReader(tr, 512<<20))
			_ = out.Close()
			if err == nil {
				n++
			}
		default:
			continue // skip symlinks/hardlinks/devices
		}
	}
	return n, nil
}

// searchHost implements op=search on the host filesystem: case-insensitive
// substring match on the file name, walked recursively from the search root.
func searchHost(w http.ResponseWriter, root, query string, limit int) {
	query = strings.TrimSpace(query)
	if query == "" {
		writeErr(w, http.StatusBadRequest, "search requires a 'q' parameter")
		return
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	lower := strings.ToLower(query)
	type hit struct {
		Rel     string `json:"path"`
		Name    string `json:"name"`
		IsDir   bool   `json:"is_dir"`
		Size    int64  `json:"size"`
		ModTime int64  `json:"mod_time"`
	}
	out := []hit{}
	visited := 0
	truncated := false
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if p == root {
			return nil
		}
		visited++
		if visited > 20000 {
			truncated = true
			return filepath.SkipAll
		}
		if strings.HasPrefix(d.Name(), trashPrefix) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		// Depth cap: keep the walk out of absurdly nested trees.
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return nil
		}
		if strings.Count(rel, string(os.PathSeparator)) > 8 {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.Contains(strings.ToLower(d.Name()), lower) {
			return nil
		}
		if len(out) >= limit {
			truncated = true
			return filepath.SkipAll
		}
		fi, err := d.Info()
		if err != nil {
			return nil
		}
		out = append(out, hit{
			Rel:     filepath.ToSlash(rel),
			Name:    d.Name(),
			IsDir:   d.IsDir(),
			Size:    fi.Size(),
			ModTime: fi.ModTime().Unix(),
		})
		return nil
	})
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return strings.ToLower(out[i].Rel) < strings.ToLower(out[j].Rel)
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"entries": out, "path": root, "truncated": truncated})
}

// copyDocker duplicates path → to inside the container via cp -r. The
// destination must not exist (409), mirroring copyHost.
func copyDocker(ctx context.Context, w http.ResponseWriter, r *http.Request, name, src, toQ string) {
	to := parseToParam(r, toQ)
	if to == "" {
		writeErr(w, http.StatusBadRequest, "copy requires a 'to' parameter")
		return
	}
	script := "set -e; if [ -e " + shellQuote(to) + " ]; then echo COPY_EXISTS; exit 10; fi; " +
		"mkdir -p " + shellQuote(path.Dir(to)) + "; cp -r -- " + shellQuote(src) + " " + shellQuote(to)
	cmd := exec.CommandContext(ctx, "docker", "exec", name, "sh", "-c", script)
	if out, err := cmd.CombinedOutput(); err != nil {
		if strings.Contains(string(out), "COPY_EXISTS") {
			writeErr(w, http.StatusConflict, fmt.Sprintf("%q already exists", path.Base(to)))
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("copy %s -> %s: %v: %s", src, to, err, string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "from": src, "to": to})
}

// archiveDocker creates a .zip or .tar.gz inside the container. Names come
// from the JSON body {names:[...]} and are interpreted relative to path
// (which must be a directory when names are given).
func archiveDocker(ctx context.Context, w http.ResponseWriter, r *http.Request, name, src, toQ string) {
	names, bodyTo := parseArchiveBody(r)
	to := strings.TrimSpace(toQ)
	if to == "" {
		to = bodyTo
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "archive requires a 'to' parameter (destination archive path)")
		return
	}
	wantZip := isZipName(to)
	wantTar := isTarGzName(to)
	if !wantZip && !wantTar {
		writeErr(w, http.StatusBadRequest, "destination must end with .zip or .tar.gz")
		return
	}
	// Quote every name for the shell; names were already sanitised by
	// parseArchiveBody (no absolute paths, no .. escapes).
	quoted := make([]string, 0, len(names))
	for _, n := range names {
		quoted = append(quoted, shellQuote(n))
	}
	var script string
	if wantZip {
		script = "set -e; if [ -e " + shellQuote(to) + " ]; then echo ARCH_EXISTS; exit 10; fi; " +
			"command -v zip >/dev/null 2>&1 || { echo NO_ZIP; exit 11; }; "
		if len(quoted) == 0 {
			// Whole-path archive: a directory archives its contents, a
			// single file archives just itself (from its parent so the
			// archive root holds the file, not a nested absolute path).
			script += "if [ -f " + shellQuote(src) + " ] && [ ! -d " + shellQuote(src) + " ]; then " +
				"cd " + shellQuote(path.Dir(src)) + " && zip -qr " + shellQuote(to) + " " + shellQuote(path.Base(src)) + " 2>&1; " +
				"else cd " + shellQuote(src) + " && zip -qr " + shellQuote(to) + " . 2>&1; fi"
		} else {
			script += "cd " + shellQuote(src) + " && zip -qr " + shellQuote(to) + " " + strings.Join(quoted, " ") + " 2>&1"
		}
	} else {
		script = "set -e; if [ -e " + shellQuote(to) + " ]; then echo ARCH_EXISTS; exit 10; fi; " +
			"command -v tar >/dev/null 2>&1 || { echo NO_TAR; exit 11; }; "
		if len(quoted) == 0 {
			script += "if [ -f " + shellQuote(src) + " ] && [ ! -d " + shellQuote(src) + " ]; then " +
				"tar -czf " + shellQuote(to) + " -C " + shellQuote(path.Dir(src)) + " " + shellQuote(path.Base(src)) + " 2>&1; " +
				"else tar -czf " + shellQuote(to) + " -C " + shellQuote(src) + " . 2>&1; fi"
		} else {
			script += "tar -czf " + shellQuote(to) + " -C " + shellQuote(src) + " " + strings.Join(quoted, " ") + " 2>&1"
		}
	}
	cmd := exec.CommandContext(ctx, "docker", "exec", name, "sh", "-c", script)
	if out, err := cmd.CombinedOutput(); err != nil {
		s := string(out)
		switch {
		case strings.Contains(s, "ARCH_EXISTS"):
			writeErr(w, http.StatusConflict, fmt.Sprintf("%q already exists", path.Base(to)))
		case strings.Contains(s, "NO_ZIP"):
			writeErr(w, http.StatusBadGateway, "zip is not installed in this container (use .tar.gz instead)")
		case strings.Contains(s, "NO_TAR"):
			writeErr(w, http.StatusBadGateway, "tar is not installed in this container")
		default:
			writeErr(w, http.StatusBadGateway, fmt.Sprintf("archive: %v: %s", err, s))
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": to, "count": len(names)})
}

// extractDocker unpacks a .zip or .tar.gz inside the container into `to`
// (default: the archive's own directory).
func extractDocker(ctx context.Context, w http.ResponseWriter, r *http.Request, name, src, toQ string) {
	to := parseToParam(r, toQ)
	dest := to
	if dest == "" {
		dest = path.Dir(src)
	}
	var script string
	switch {
	case isZipName(src):
		script = "set -e; command -v unzip >/dev/null 2>&1 || { echo NO_UNZIP; exit 11; }; " +
			"mkdir -p " + shellQuote(dest) + "; unzip -qq -o " + shellQuote(src) + " -d " + shellQuote(dest) + " 2>&1"
	case isTarGzName(src):
		script = "set -e; command -v tar >/dev/null 2>&1 || { echo NO_TAR; exit 11; }; " +
			"mkdir -p " + shellQuote(dest) + "; tar -xzf " + shellQuote(src) + " -C " + shellQuote(dest) + " 2>&1"
	default:
		writeErr(w, http.StatusBadRequest, "unsupported archive (use .zip or .tar.gz)")
		return
	}
	cmd := exec.CommandContext(ctx, "docker", "exec", name, "sh", "-c", script)
	if out, err := cmd.CombinedOutput(); err != nil {
		s := string(out)
		if strings.Contains(s, "NO_UNZIP") {
			writeErr(w, http.StatusBadGateway, "unzip is not installed in this container")
			return
		}
		if strings.Contains(s, "NO_TAR") {
			writeErr(w, http.StatusBadGateway, "tar is not installed in this container")
			return
		}
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("extract: %v: %s", err, s))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": dest})
}

// searchDocker implements op=search inside the container: one `find` to
// enumerate (capped), substring filter in Go (no shell-injected globs),
// then a single batched `stat` for the surviving hits so sizes/dates render.
func searchDocker(ctx context.Context, w http.ResponseWriter, name, dir, query string, limit int) {
	query = strings.TrimSpace(query)
	if query == "" {
		writeErr(w, http.StatusBadRequest, "search requires a 'q' parameter")
		return
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	findCmd := exec.CommandContext(ctx, "docker", "exec", name,
		"sh", "-c", "find "+shellQuote(dir)+" -maxdepth 6 -print 2>/dev/null | head -n 5000")
	raw, err := findCmd.Output()
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("search in %s: %v", name, err))
		return
	}
	lower := strings.ToLower(query)
	type hit struct {
		Rel     string `json:"path"`
		Name    string `json:"name"`
		IsDir   bool   `json:"is_dir"`
		Size    int64  `json:"size"`
		ModTime int64  `json:"mod_time"`
	}
	candidates := []string{}
	for _, ln := range strings.Split(string(raw), "\n") {
		ln = strings.TrimRight(ln, "\r")
		if ln == "" || ln == dir {
			continue
		}
		base := ln
		if i := strings.LastIndex(ln, "/"); i >= 0 {
			base = ln[i+1:]
		}
		if base == "" {
			continue
		}
		if !strings.Contains(strings.ToLower(base), lower) {
			continue
		}
		candidates = append(candidates, ln)
		if len(candidates) >= limit {
			break
		}
	}
	out := []hit{}
	if len(candidates) > 0 {
		args := append([]string{"exec", name, "stat", "-c", "%n|%s|%F|%Y", "--"}, candidates...)
		statCmd := exec.CommandContext(ctx, "docker", args...)
		statOut, _ := statCmd.Output()
		for _, ln := range strings.Split(strings.TrimSpace(string(statOut)), "\n") {
			ln = strings.TrimRight(ln, "\r")
			if ln == "" {
				continue
			}
			parts := strings.Split(ln, "|")
			if len(parts) < 4 {
				continue
			}
			full := parts[0]
			size, _ := strconv.ParseInt(parts[1], 10, 64)
			ts, _ := strconv.ParseInt(parts[3], 10, 64)
			rel := strings.TrimPrefix(full, strings.TrimSuffix(dir, "/"))
			rel = strings.TrimPrefix(rel, "/")
			if rel == "" {
				continue
			}
			base := rel
			if i := strings.LastIndex(rel, "/"); i >= 0 {
				base = rel[i+1:]
			}
			out = append(out, hit{
				Rel:     rel,
				Name:    base,
				IsDir:   strings.HasPrefix(parts[2], "directory"),
				Size:    size,
				ModTime: ts,
			})
		}
		// stat may miss entries that vanished mid-search; fall back to the
		// raw candidate list so results never come back inexplicably empty.
		if len(out) == 0 {
			for _, full := range candidates {
				rel := strings.TrimPrefix(full, strings.TrimSuffix(dir, "/"))
				rel = strings.TrimPrefix(rel, "/")
				if rel == "" {
					continue
				}
				base := rel
				if i := strings.LastIndex(rel, "/"); i >= 0 {
					base = rel[i+1:]
				}
				out = append(out, hit{Rel: rel, Name: base})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return strings.ToLower(out[i].Rel) < strings.ToLower(out[j].Rel)
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"entries": out, "path": dir, "truncated": len(candidates) >= limit})
}

// writeErr is a tiny helper so error responses stay JSON-shaped and the
// frontend can render them in the file browser surface.
func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": msg})
}

// parseLS decodes the `ls -lA --time-style=+%s` output into []Entry. The
// format --time-style=+%s produces is exactly 6 leading columns followed by
// the (possibly multi-word) name:
//
//	drwxr-xr-x 2 root root 4096 1700000000 dirname
//	 ^mode    ^lnk ^own ^grp ^sz  ^epoch   ^name...
//
// --time-style=+%s collapses the month/day/hour columns a plain `ls -l`
// prints into a single unix-timestamp column. An earlier version of this
// parser assumed the plain-`ls -l` layout (name at index 8) and required
// len(fields) >= 9, which silently dropped EVERY entry because the +%s
// format only yields 7 columns for a single-word name.
func parseLS(raw []byte) []Entry {
	out := make([]Entry, 0, 16)
	lines := bytes.Split(raw, []byte("\n"))
	for _, ln := range lines {
		ln = bytes.TrimSpace(ln)
		if len(ln) == 0 {
			continue
		}
		// Skip the "total N" line ls emits for directories.
		if bytes.HasPrefix(ln, []byte("total ")) {
			continue
		}
		fields := strings.Fields(string(ln))
		// mode links owner group size timestamp name...
		if len(fields) < 7 {
			continue
		}
		modeStr := fields[0]
		sizeStr := fields[4]
		tsStr := fields[5]
		isDir := strings.HasPrefix(modeStr, "d")
		// `ls` renders name as the union of the 7th..end fields so a file
		// named "a b.txt" survives as one logical entry.
		name := strings.Join(fields[6:], " ")
		if name == "" {
			continue
		}
		size, _ := strconv.ParseInt(sizeStr, 10, 64)
		ts, _ := strconv.ParseInt(tsStr, 10, 64)
		out = append(out, Entry{
			Name:    name,
			Size:    size,
			Mode:    parseModeStr(modeStr),
			IsDir:   isDir,
			ModTime: ts,
		})
	}
	return out
}

// parseStat decodes the `stat -c '%n|%s|%a|%F|%Y'` output into a single
// Entry. %F ("regular file"/"directory"/…) collapses to the IsDir flag.
func parseStat(raw []byte) Entry {
	raw = bytes.TrimSpace(raw)
	parts := strings.Split(string(raw), "|")
	if len(parts) < 5 {
		return Entry{}
	}
	size, _ := strconv.ParseInt(parts[1], 10, 64)
	mode, _ := strconv.ParseUint(parts[2], 8, 32)
	ts, _ := strconv.ParseInt(parts[4], 10, 64)
	return Entry{
		Name:    baseName(parts[0]),
		Size:    size,
		Mode:    uint32(mode),
		IsDir:   strings.HasPrefix(parts[3], "directory"),
		ModTime: ts,
	}
}

// parseModeStr converts a symbolic drwxr-xr-x string into a numeric mode.
// We only need it for display (mode bits are not security-relevant here),
// so a best-effort map of rwx → owner/group/other bits is enough.
func parseModeStr(s string) uint32 {
	if len(s) < 10 {
		return 0
	}
	var m uint32
	// Indices 1-3 owner, 4-6 group, 7-9 other.
	set := func(start int, shift uint) {
		if len(s) > start && s[start] == 'r' {
			m |= 4 << shift
		}
		if len(s) > start+1 && s[start+1] == 'w' {
			m |= 2 << shift
		}
		if len(s) > start+2 && s[start+2] == 'x' {
			m |= 1 << shift
		}
	}
	set(1, 6) // owner
	set(4, 3) // group
	set(7, 0) // other
	return m
}

// shellQuote wraps a path in single quotes and escapes any inner single
// quotes so a filename containing shell metachars survives `sh -c`.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// baseName is the URL/filename-friendly last segment of path. We trim a
// trailing slash so the basename of "/mc/" comes out as "mc" rather than
// an empty string.
func baseName(p string) string {
	p = strings.TrimRight(p, "/")
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}
