package files

import (
	"encoding/json"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// hostInstanceBaseDir mirrors drivers.hostBaseDir without importing the
// drivers package (drivers never imports files, so the reverse import is
// safe — but duplicating the 10-line resolution keeps the files package
// dependency-free and avoids a new import edge for a path helper).
func hostInstanceBaseDir() string {
	if v := strings.TrimSpace(os.Getenv("KSPANEL_INSTANCES_DIR")); v != "" {
		return filepath.Clean(v)
	}
	const def = "/var/lib/kspanel/instances"
	if err := os.MkdirAll(def, 0o755); err == nil {
		return def
	}
	if st, err := os.Stat(def); err == nil && st.IsDir() {
		if f, err := os.OpenFile(filepath.Join(def, ".writetest"), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600); err == nil {
			_ = f.Close()
			_ = os.Remove(filepath.Join(def, ".writetest"))
			return def
		}
	}
	return filepath.Join(os.TempDir(), "kspanel-instances")
}

func validHostInstanceName(name string) bool {
	if len(name) == 0 || len(name) > 63 {
		return false
	}
	isAlnum := func(b byte) bool {
		return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
	}
	if !isAlnum(name[0]) {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		if !isAlnum(c) && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

func hostInstanceRoot(name string) (string, error) {
	if !validHostInstanceName(name) {
		return "", errInvalidName()
	}
	return filepath.Join(hostInstanceBaseDir(), "host-"+name), nil
}

func errInvalidName() error {
	return errMsg("invalid instance name")
}

type errMsg string

func (e errMsg) Error() string { return string(e) }

// resolveHostInstancePath maps a container-absolute path ("/", "/sub/file")
// to an absolute host path jailed under the instance root. Lexical ".."
// escapes are rejected, then symlinks are resolved and re-checked so a
// symlink planted inside the instance can never smuggle access outside.
func resolveHostInstancePath(root, containerPath string) (string, error) {
	cp := strings.TrimSpace(containerPath)
	if cp == "" {
		cp = "/"
	}
	if !path.IsAbs(cp) {
		cp = "/" + cp
	}
	cp = path.Clean(cp)
	rel := strings.TrimPrefix(cp, "/")
	target := filepath.Join(root, filepath.FromSlash(rel))
	if target != root && !within(root, target) {
		return "", errMsg("invalid path")
	}
	resolved, err := filepath.EvalSymlinks(target)
	if err != nil {
		// Not-yet-existing path: resolve deepest existing ancestor.
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
			return target, nil
		}
	}
	resolved = filepath.Clean(resolved)
	realRoot := root
	if rp, err := filepath.EvalSymlinks(root); err == nil {
		realRoot = filepath.Clean(rp)
	}
	if resolved != realRoot && !within(realRoot, resolved) {
		return "", errMsg("invalid path")
	}
	return target, nil
}

// hostInstanceDispatcher serves /api/edge/files ops for kind=host directly
// off the instance dir on the edge host filesystem. Container path "/"
// is the instance root itself. Returns true when the request was handled
// (success or a written error); false is never returned — every branch
// writes a response so the caller can simply return.
func hostInstanceDispatcher(w http.ResponseWriter, r *http.Request, op, name, containerPath string) bool {
	root, err := hostInstanceRoot(name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return true
	}
	if st, err := os.Stat(root); err != nil || !st.IsDir() {
		writeErr(w, http.StatusNotFound, "host instance not found (deploy it first)")
		return true
	}
	abs, err := resolveHostInstancePath(root, containerPath)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return true
	}
	q := r.URL.Query()
	switch op {
	case "list", "":
		info, err := os.Stat(abs)
		if err != nil {
			if os.IsNotExist(err) {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"entries": []Entry{}, "path": containerPath})
				return true
			}
			writeErr(w, http.StatusBadGateway, "stat failed")
			return true
		}
		if !info.IsDir() {
			writeErr(w, http.StatusBadRequest, "not a directory")
			return true
		}
		listHostDir(w, abs, info)
	case "stat":
		info, err := os.Stat(abs)
		if err != nil {
			if os.IsNotExist(err) {
				writeErr(w, http.StatusNotFound, "no such file or directory")
				return true
			}
			writeErr(w, http.StatusBadGateway, "stat failed")
			return true
		}
		statHostPath(w, abs, info)
	case "read":
		info, err := os.Stat(abs)
		if err != nil {
			if os.IsNotExist(err) {
				writeErr(w, http.StatusNotFound, "no such file or directory")
				return true
			}
			writeErr(w, http.StatusBadGateway, "stat failed")
			return true
		}
		readHostFile(w, abs, info)
	case "search":
		searchHost(w, abs, searchQuery(r), searchLimit(r))
	case "write", "upload":
		writeHostFile(w, r, abs)
	case "mkdir":
		mkdirHost(w, abs)
	case "rename":
		renameHostInstance(w, r, root, abs)
	case "copy":
		copyHostInstance(w, r, root, abs)
	case "archive":
		archiveHostInstance(w, r, root, abs)
	case "extract":
		extractHostInstance(w, r, root, abs)
	case "delete":
		info, err := os.Stat(abs)
		if err != nil {
			if os.IsNotExist(err) {
				writeErr(w, http.StatusNotFound, "no such file or directory")
				return true
			}
			writeErr(w, http.StatusBadGateway, "stat failed")
			return true
		}
		// Never allow deleting the instance root itself via the file
		// manager (use Destroy lifecycle for that).
		if abs == root {
			writeErr(w, http.StatusBadRequest, "cannot delete the instance root (use destroy)")
			return true
		}
		deleteHost(w, abs, info)
	case "chmod":
		chmodHost(w, r, abs)
	default:
		http.Error(w, "unknown op: "+op, http.StatusBadRequest)
	}
	_ = q
	return true
}

func renameHostInstance(w http.ResponseWriter, r *http.Request, root, src string) {
	to := parseToParam(r, r.URL.Query().Get("to"))
	if to == "" {
		writeErr(w, http.StatusBadRequest, "rename requires a 'to' parameter")
		return
	}
	// "to" is a container path ("/newname" or "sub/newname") inside the
	// same host instance — resolve it under the same jail.
	if !path.IsAbs(to) {
		to = "/" + to
	}
	dst, err := resolveHostInstancePath(root, to)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if dst == src {
		writeErr(w, http.StatusBadRequest, "source and destination are the same")
		return
	}
	if dst == root {
		writeErr(w, http.StatusBadRequest, "cannot rename onto the instance root")
		return
	}
	if _, err := os.Stat(src); err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, "stat failed")
		return
	}
	if _, err := os.Stat(dst); err == nil {
		writeErr(w, http.StatusConflict, "destination already exists")
		return
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, "mkdir parent failed")
		return
	}
	if err := os.Rename(src, dst); err != nil {
		writeErr(w, http.StatusBadGateway, "rename failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func copyHostInstance(w http.ResponseWriter, r *http.Request, root, src string) {
	to := parseToParam(r, r.URL.Query().Get("to"))
	if to == "" {
		writeErr(w, http.StatusBadRequest, "copy requires a 'to' parameter")
		return
	}
	if !path.IsAbs(to) {
		to = "/" + to
	}
	dst, err := resolveHostInstancePath(root, to)
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
		writeErr(w, http.StatusBadGateway, "stat failed")
		return
	}
	if _, err := os.Lstat(dst); err == nil {
		writeErr(w, http.StatusConflict, "destination already exists")
		return
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, "mkdir parent failed")
		return
	}
	if err := copyRecursive(src, dst); err != nil {
		writeErr(w, http.StatusBadGateway, "copy failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func archiveHostInstance(w http.ResponseWriter, r *http.Request, root, src string) {
	names, bodyTo := parseArchiveBody(r)
	to := strings.TrimSpace(r.URL.Query().Get("to"))
	if to == "" {
		to = bodyTo
	}
	if to == "" {
		writeErr(w, http.StatusBadRequest, "archive requires a 'to' parameter (destination archive path)")
		return
	}
	if !path.IsAbs(to) {
		to = "/" + to
	}
	dst, err := resolveHostInstancePath(root, to)
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
		writeErr(w, http.StatusBadGateway, "stat failed")
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
		entries, err := os.ReadDir(src)
		if err != nil {
			writeErr(w, http.StatusBadGateway, "readdir failed")
			return
		}
		for _, e := range entries {
			picks = append(picks, e.Name())
		}
		if len(picks) == 0 {
			writeErr(w, http.StatusBadRequest, "directory is empty — nothing to archive")
			return
		}
	}
	for _, n := range picks {
		if strings.Contains(n, "..") {
			writeErr(w, http.StatusBadRequest, "invalid entry")
			return
		}
		abs := filepath.Join(srcDir, filepath.FromSlash(n))
		if abs != srcDir && !within(srcDir, abs) {
			writeErr(w, http.StatusBadRequest, "invalid entry")
			return
		}
	}
	if _, err := os.Lstat(dst); err == nil {
		writeErr(w, http.StatusConflict, "destination already exists")
		return
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, "mkdir parent failed")
		return
	}
	if isZipName(dst) {
		if err := createZip(srcDir, picks, dst); err != nil {
			_ = os.Remove(dst)
			writeErr(w, http.StatusBadGateway, "archive failed")
			return
		}
	} else {
		if err := createTarGz(srcDir, picks, dst); err != nil {
			_ = os.Remove(dst)
			writeErr(w, http.StatusBadGateway, "archive failed")
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "count": len(picks)})
}

func extractHostInstance(w http.ResponseWriter, r *http.Request, root, src string) {
	to := parseToParam(r, r.URL.Query().Get("to"))
	st, err := os.Stat(src)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, http.StatusNotFound, "no such file or directory")
			return
		}
		writeErr(w, http.StatusBadGateway, "stat failed")
		return
	}
	if st.IsDir() {
		writeErr(w, http.StatusBadRequest, "cannot extract a directory")
		return
	}
	dest := filepath.Dir(src)
	if to != "" {
		if !path.IsAbs(to) {
			to = "/" + to
		}
		d, err := resolveHostInstancePath(root, to)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		// If "to" names an existing dir, extract into it; else treat it
		// as the dest dir to create.
		if dstSt, derr := os.Stat(d); derr == nil && dstSt.IsDir() {
			dest = d
		} else {
			dest = d
		}
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		writeErr(w, http.StatusBadGateway, "mkdir dest failed")
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
		writeErr(w, http.StatusBadGateway, "extract failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "count": n})
}
