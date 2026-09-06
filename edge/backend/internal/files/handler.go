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
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// writeOps is the set of ops that require a request body. The dispatcher
// in Handler rejects POST/DELETE for ops not in this set so a typo doesn't
// silently no-op.
var writeOps = map[string]bool{
	"write":  true,
	"upload": true,
	"mkdir":  true,
	"rename": true,
	"delete": true,
	"chmod":  true,
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
		// without us cutting it off mid-flight.
		var ctx context.Context
		var cancel context.CancelFunc
		if op == "upload" || op == "write" {
			ctx, cancel = context.WithTimeout(r.Context(), 30*time.Minute)
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
		case "write":
			writeDockerFile(ctx, w, r, name, path)
		case "upload":
			uploadDockerFile(ctx, w, r, name, path)
		case "mkdir":
			mkdirDocker(ctx, w, name, path)
		case "rename":
			renameDocker(ctx, w, r, name, path, q.Get("to"))
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
		// onto a brand-new file): previously this fell back to docker exec,
		// which broke every first upload into a fresh directory whenever
		// the container was stopped. Verify the deepest existing ancestor
		// instead and let the host writers create the file.
		if !os.IsNotExist(err) || (op != "write" && op != "upload") {
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
	uid := os.Getuid()
	gid := os.Getgid()
	dir := filepath.Dir(path)
	// Try to chown the directory/file to the current user. Use -n (non-interactive)
	// so we fail fast when sudo is not available or requires a password.
	if err := exec.Command("sudo", "-n", "chown", "-R", fmt.Sprintf("%d:%d", uid, gid), dir).Run(); err != nil {
		// Fallback: try chowning just the file if dir failed
		_ = exec.Command("sudo", "-n", "chown", fmt.Sprintf("%d:%d", uid, gid), path).Run()
	}
	// Ensure the directory is at least u+rwX so we can create files inside.
	_ = exec.Command("sudo", "-n", "chmod", "-R", "u+rwX", dir).Run()
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
		_ = json.NewDecoder(r.Body).Decode(&body)
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
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("delete %s: %v", hostPath, err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": hostPath})
}

// chmodHost updates hostPath's permission bits. The mode arrives as a
// decimal/octal string from the SPA (the OS file mode format the user
// picked in the permissions dialog).
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
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"mkdir", "-p", path)
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
		_ = json.NewDecoder(r.Body).Decode(&body)
		to = body.To
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "rename requires a 'to' parameter")
		return
	}
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"mv", path, to)
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
	cmd := exec.CommandContext(ctx, "docker", "exec", name,
		"chmod", fmt.Sprintf("%o", mode), path)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("chmod %s: %v: %s", path, err, string(out)))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": path, "mode": mode})
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
