package pageaction

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/ksedge/internal/drivers"
	"github.com/example/ksedge/internal/execstage"
)

// ActionType represents the type of action to execute
type ActionType string

const (
	ActionShell     ActionType = "shell"      // Execute shell command
	ActionReadFile  ActionType = "read_file"  // Read file contents
	ActionWriteFile ActionType = "write_file" // Write file contents
	ActionListFiles ActionType = "list_files" // List directory contents
	ActionDockerCmd ActionType = "docker"     // Docker CLI command
	ActionKVMCmd    ActionType = "kvm"        // KVM/Virsh command
	ActionLXDCmd    ActionType = "lxd"        // LXD/LXC command
	ActionStat      ActionType = "stat"       // Stat a path inside the container
	ActionChmod     ActionType = "chmod"      // Chmod a path inside the container
	ActionArchive   ActionType = "archive"    // Create a .zip/.tar.gz inside the container
	ActionExtract   ActionType = "extract"    // Extract a .zip/.tar.gz inside the container
)

// Input is the request body for page action execution
type Input struct {
	Token    string                 `json:"token"`
	Kind     string                 `json:"kind"`    // docker, lxd, kvm, multipass
	Name     string                 `json:"name"`    // instance name
	Type     ActionType             `json:"type"`    // action type
	Command  string                 `json:"command"` // command to execute (for shell)
	Path     string                 `json:"path"`    // file path (for file ops)
	Content  string                 `json:"content"` // file content (for write)
	Args     []string               `json:"args"`    // additional arguments
	Env      map[string]string      `json:"env"`     // environment variables
	Timeout  int                    `json:"timeout"` // timeout in seconds
	Options  map[string]interface{} `json:"options"` // driver-specific options
	ModuleID string                 `json:"module_id,omitempty"` // module-based pages (panel forwards, edge ignores but keeps contract)
	// New edge action types (item 6): explicit fields so the allow-list can
	// pin them exactly. Mode is the chmod octal string; Names is the archive
	// entry list (relative to Path); Dest is the archive path (archive) or
	// the destination dir (extract, optional).
	Mode  string   `json:"mode,omitempty"`
	Names []string `json:"names,omitempty"`
	Dest  string   `json:"dest,omitempty"`
}

// Output is the response from action execution
type Output struct {
	OK       bool   `json:"ok"`
	ExitCode int    `json:"exit_code,omitempty"`
	Stdout   string `json:"stdout,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	Error    string `json:"error,omitempty"`
	Data     any    `json:"data,omitempty"`
}

// Handler returns an http.Handler for the page action endpoint
func Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB limit
		if err != nil {
			writeErr(w, http.StatusBadRequest, "read body: "+err.Error())
			return
		}

		var in Input
		if err := json.Unmarshal(raw, &in); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}

		// Authenticate
		if token == "" || subtle.ConstantTimeCompare([]byte(in.Token), []byte(token)) != 1 {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}

		if in.Kind == "" || in.Name == "" || in.Type == "" {
			writeErr(w, http.StatusBadRequest, "kind, name, and type are required")
			return
		}

		drv, ok := drivers.Registry[in.Kind]
		if !ok {
			writeErr(w, http.StatusBadRequest, "unknown driver kind: "+in.Kind)
			return
		}

		// Timeout budget mirrors the sibling RPCs (execrpc/hostexec): the
		// panel-supplied value is honoured when positive, otherwise the
		// 30s default applies — a NEGATIVE value would hand
		// context.WithTimeout an already-expired deadline and fail every
		// action instantly. An upper clamp keeps a typo'd huge timeout
		// from pinning a goroutine for hours.
		const (
			defaultTimeout = 30 * time.Second
			maxTimeout     = 30 * time.Minute
		)
		timeout := time.Duration(in.Timeout) * time.Second
		if timeout <= 0 {
			timeout = defaultTimeout
		}
		if timeout > maxTimeout {
			timeout = maxTimeout
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()

		var out Output
		switch in.Type {
		case ActionShell:
			out = executeShell(ctx, drv, in.Name, in.Command, in.Args, in.Env)
		case ActionReadFile:
			out = executeReadFile(ctx, drv, in.Name, in.Path)
		case ActionWriteFile:
			out = executeWriteFile(ctx, drv, in.Name, in.Path, in.Content)
		case ActionListFiles:
			out = executeListFiles(ctx, drv, in.Name, in.Path)
		case ActionDockerCmd:
			out = executeDockerCmd(ctx, drv, in.Name, in.Command, in.Args)
		case ActionKVMCmd:
			out = executeKVMCmd(ctx, drv, in.Name, in.Command, in.Args)
		case ActionLXDCmd:
			out = executeLXDCmd(ctx, drv, in.Name, in.Command, in.Args)
		case ActionStat:
			out = executeStat(ctx, drv, in.Name, in.Path)
		case ActionChmod:
			out = executeChmod(ctx, drv, in.Name, in.Path, in.Mode)
		case ActionArchive:
			out = executeArchive(ctx, drv, in.Name, in.Path, in.Names, in.Dest)
		case ActionExtract:
			out = executeExtract(ctx, drv, in.Name, in.Path, in.Dest)
		default:
			writeErr(w, http.StatusBadRequest, "unknown action type: "+string(in.Type))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})
}

func executeShell(ctx context.Context, drv drivers.Driver, name, command string, args []string, env map[string]string) Output {
	if strings.TrimSpace(command) == "" {
		return Output{OK: false, Error: "command is required"}
	}
	// Honor Env via the shared staging builder (env exports + command,
	// no files): the previous code accepted Env from the panel and then
	// silently dropped it, so automation relying on vaulted secrets saw
	// empty vars with no error. execstage validates names (POSIX
	// identifiers) and single-quote-escapes values.
	script, serr := execstage.Script(env, nil, command)
	if serr != nil {
		return Output{OK: false, Error: serr.Error()}
	}
	cmd := []string{"/bin/sh", "-lc", script}
	if len(args) > 0 {
		cmd = append(cmd, args...)
	}

	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	return Output{OK: code == 0, ExitCode: code, Stdout: stdout, Stderr: stderr}
}

func executeReadFile(ctx context.Context, drv drivers.Driver, name, path string) Output {
	if path == "" {
		return Output{OK: false, Error: "path is required"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("cat %s", shellQuote(path))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		return Output{OK: false, ExitCode: code, Error: stderr}
	}
	return Output{OK: true, Data: stdout}
}

func executeWriteFile(ctx context.Context, drv drivers.Driver, name, path, content string) Output {
	if path == "" {
		return Output{OK: false, Error: "path is required"}
	}
	// Quoted heredoc so the content lands verbatim (no $ expansion). The
	// marker is random per request and rejected on collision — a fixed "EOF"
	// marker truncated the file / executed stray shell whenever the content
	// itself contained an EOF line. Content is NOT quote-escaped here: the
	// previous escaping corrupted every literal "'" in the file because
	// quoted heredocs pass bytes through untouched.
	marker, merr := newHeredocMarker()
	if merr != nil {
		return Output{OK: false, Error: merr.Error()}
	}
	if strings.Contains(content, "\n"+marker+"\n") ||
		strings.HasPrefix(content, marker+"\n") ||
		strings.HasSuffix(content, "\n"+marker) ||
		content == marker {
		return Output{OK: false, Error: "content contains the heredoc terminator"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("cat > %s <<'%s'\n%s\n%s", shellQuote(path), marker, content, marker)}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		return Output{OK: false, ExitCode: code, Error: stderr}
	}
	return Output{OK: true, Stdout: stdout}
}

// newHeredocMarker returns an unpredictable terminator so written file
// content can never collide with it by chance.
func newHeredocMarker() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate heredoc marker: %w", err)
	}
	return "KSEDGE_EOF_" + hex.EncodeToString(buf), nil
}

func executeListFiles(ctx context.Context, drv drivers.Driver, name, path string) Output {
	if path == "" {
		path = "/"
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("ls -la %s", shellQuote(path))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		return Output{OK: false, ExitCode: code, Error: stderr}
	}
	// Parse ls output into structured data
	files := parseLsOutput(stdout)
	return Output{OK: true, Data: files}
}

// maxActionPathLen bounds pinned path/dest fields so a crafted saved action
// cannot wedge the edge shell line or the panel proxy with a megabyte path.
const maxActionPathLen = 4096

// validActionPath reports whether p is a usable container path for the new
// edge action types: non-empty, bounded, no NUL bytes. Container paths are
// legitimately absolute (list_files defaults to "/"), so — like the
// read_file/write_file/list_files siblings, which enforce no host jail —
// there is no isDangerousPath check here: that jail guards edge-HOST paths
// in files/handler.go, and applying it inside the instance container would
// block legitimate container paths such as the container's own /etc/hosts.
func validActionPath(p string) bool {
	if p == "" || len(p) > maxActionPathLen {
		return false
	}
	return !strings.ContainsRune(p, 0)
}

// validModeRe is the strict chmod charset: 3-4 octal digits only. The
// numeric cap (<= 0o777, enforced alongside) additionally rejects setuid /
// setgid / sticky bits, mirroring files chmodHost/chmodDocker.
var validModeRe = regexp.MustCompile(`^[0-7]{3,4}$`)

// validActionMode reports whether mode is an acceptable chmod value.
func validActionMode(mode string) bool {
	if !validModeRe.MatchString(mode) {
		return false
	}
	v, err := strconv.ParseUint(mode, 8, 32)
	if err != nil || v > 0o777 {
		return false
	}
	return true
}

// executeStat stats one container path (first-class replacement for the
// hand-rolled `stat -c ...` shell actions). The Data shape reuses FileEntry
// (mode carries the octal permission bits, e.g. "644").
func executeStat(ctx context.Context, drv drivers.Driver, name, actionPath string) Output {
	if !validActionPath(actionPath) {
		return Output{OK: false, Error: "path is required"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("stat -c '%%n|%%s|%%a|%%F|%%Y' -- %s 2>/dev/null", shellQuote(actionPath))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		return Output{OK: false, ExitCode: code, Error: stderr}
	}
	entry, perr := parseStatOutput(stdout)
	if perr != nil {
		return Output{OK: false, Error: perr.Error()}
	}
	return Output{OK: true, Data: entry}
}

// parseStatOutput decodes one `stat -c '%n|%s|%a|%F|%Y'` line into a
// FileEntry. The split runs from the RIGHT (last four separators) so a
// filename containing '|' still parses.
func parseStatOutput(stdout string) (FileEntry, error) {
	line := strings.TrimSpace(stdout)
	if line == "" {
		return FileEntry{}, fmt.Errorf("stat returned no output")
	}
	if i := strings.Index(line, "\n"); i >= 0 {
		line = strings.TrimSpace(line[:i])
	}
	parts := strings.Split(line, "|")
	if len(parts) < 5 {
		return FileEntry{}, fmt.Errorf("stat returned an unrecognized format")
	}
	tail := parts[len(parts)-4:]
	name := strings.Join(parts[:len(parts)-4], "|")
	size, _ := strconv.ParseInt(strings.TrimSpace(tail[0]), 10, 64)
	mode := strings.TrimSpace(tail[1])
	ts, _ := strconv.ParseInt(strings.TrimSpace(tail[3]), 10, 64)
	base := name
	if i := strings.LastIndex(base, "/"); i >= 0 {
		base = base[i+1:]
	}
	return FileEntry{
		Name:    base,
		Size:    size,
		IsDir:   strings.HasPrefix(strings.TrimSpace(tail[2]), "directory"),
		ModTime: ts,
		Mode:    mode,
	}, nil
}

// executeChmod applies an octal mode to one container path (first-class
// replacement for hand-rolled `chmod ...` shell actions).
func executeChmod(ctx context.Context, drv drivers.Driver, name, actionPath, mode string) Output {
	if !validActionPath(actionPath) {
		return Output{OK: false, Error: "path is required"}
	}
	if !validActionMode(mode) {
		return Output{OK: false, Error: fmt.Sprintf("invalid mode %q (must be 000-777)", mode)}
	}
	// mode is regex-pinned to [0-7]{3,4} so it interpolates safely; the
	// path stays shell-quoted like every sibling executor.
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("chmod %s -- %s", mode, shellQuote(actionPath))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		return Output{OK: false, ExitCode: code, Error: stderr}
	}
	return Output{OK: true, Stdout: stdout, Data: map[string]any{"path": actionPath, "mode": mode}}
}

// Archive bomb caps (mirror the host-side extractZip/extractTarGz spirit:
// 10k entries; total unpacked bytes bounded so a 42.zip-style payload fails
// closed instead of filling the instance disk).
const (
	maxArchiveEntries   = 10000
	maxArchiveNameLen   = 1024
	maxArchiveNames     = 1000
	maxExtractBytes     = 4 << 30 // 4 GiB total unpacked
)

func isZipName(n string) bool { return strings.HasSuffix(strings.ToLower(n), ".zip") }
func isTarGzName(n string) bool {
	l := strings.ToLower(n)
	return strings.HasSuffix(l, ".tar.gz") || strings.HasSuffix(l, ".tgz")
}

// sanitizeArchiveName jails one archive member name to the source dir,
// mirroring files parseArchiveBody: no empties, no absolute escapes, no ..
// segments. ok=false must fail the action closed (never silently skip: the
// saved definition is pinned, so a bad entry is a definition error).
func sanitizeArchiveName(n string) (string, bool) {
	n = strings.TrimSpace(n)
	if n == "" || n == "." || n == "/" || len(n) > maxArchiveNameLen {
		return "", false
	}
	c := path.Clean("/" + n)
	if c == "/" {
		return "", false
	}
	rel := strings.TrimPrefix(c, "/")
	if rel == "" || rel == ".." || strings.HasPrefix(rel, "../") {
		return "", false
	}
	return rel, true
}

// safeArchiveEntry reports whether one name LISTED from an existing archive
// is safe to extract: no absolute paths, no empty/dot names, no ".."
// segments (ZipSlip guard — enforced before extraction regardless of which
// unzip/tar binary the container ships).
func safeArchiveEntry(n string) bool {
	n = strings.TrimSpace(n)
	if n == "" || n == "." || n == "/" {
		return false
	}
	if path.IsAbs(n) {
		return false
	}
	for _, seg := range strings.Split(path.Clean(n), "/") {
		if seg == ".." {
			return false
		}
	}
	return true
}

// executeArchive creates a .zip/.tar.gz inside the container (first-class
// replacement for hand-rolled `zip -qr`/`tar -czf` shell actions). src is
// the source dir (or a single file when names is empty); names are
// interpreted relative to src; dest is the archive path.
func executeArchive(ctx context.Context, drv drivers.Driver, name, src string, names []string, dest string) Output {
	if !validActionPath(src) {
		return Output{OK: false, Error: "path is required"}
	}
	if !validActionPath(dest) {
		return Output{OK: false, Error: "dest is required"}
	}
	if !isZipName(dest) && !isTarGzName(dest) {
		return Output{OK: false, Error: "dest must end with .zip or .tar.gz"}
	}
	if len(names) > maxArchiveNames {
		return Output{OK: false, Error: fmt.Sprintf("too many archive entries (max %d)", maxArchiveNames)}
	}
	picks := make([]string, 0, len(names))
	for _, n := range names {
		rel, ok := sanitizeArchiveName(n)
		if !ok {
			return Output{OK: false, Error: fmt.Sprintf("invalid archive entry %q", n)}
		}
		picks = append(picks, rel)
	}
	quoted := make([]string, 0, len(picks))
	for _, n := range picks {
		quoted = append(quoted, shellQuote(n))
	}
	var script string
	if isZipName(dest) {
		script = "set -e; if [ -e " + shellQuote(dest) + " ]; then echo ARCH_EXISTS; exit 10; fi; " +
			"command -v zip >/dev/null 2>&1 || { echo NO_ZIP; exit 11; }; "
		if len(quoted) == 0 {
			script += "if [ -f " + shellQuote(src) + " ] && [ ! -d " + shellQuote(src) + " ]; then " +
				"cd " + shellQuote(path.Dir(src)) + " && zip -qr " + shellQuote(dest) + " " + shellQuote(path.Base(src)) + " 2>&1; " +
				"else cd " + shellQuote(src) + " && zip -qr " + shellQuote(dest) + " . 2>&1; fi"
		} else {
			script += "cd " + shellQuote(src) + " && zip -qr " + shellQuote(dest) + " " + strings.Join(quoted, " ") + " 2>&1"
		}
	} else {
		script = "set -e; if [ -e " + shellQuote(dest) + " ]; then echo ARCH_EXISTS; exit 10; fi; " +
			"command -v tar >/dev/null 2>&1 || { echo NO_TAR; exit 11; }; "
		if len(quoted) == 0 {
			script += "if [ -f " + shellQuote(src) + " ] && [ ! -d " + shellQuote(src) + " ]; then " +
				"tar -czf " + shellQuote(dest) + " -C " + shellQuote(path.Dir(src)) + " " + shellQuote(path.Base(src)) + " 2>&1; " +
				"else tar -czf " + shellQuote(dest) + " -C " + shellQuote(src) + " . 2>&1; fi"
		} else {
			script += "tar -czf " + shellQuote(dest) + " -C " + shellQuote(src) + " " + strings.Join(quoted, " ") + " 2>&1"
		}
	}
	sess, err := drv.Exec(ctx, name, false, 0, 0, []string{"/bin/sh", "-lc", script})
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		combined := stdout + "\n" + stderr
		switch {
		case strings.Contains(combined, "ARCH_EXISTS"):
			return Output{OK: false, ExitCode: code, Error: fmt.Sprintf("%q already exists", path.Base(dest))}
		case strings.Contains(combined, "NO_ZIP"):
			return Output{OK: false, ExitCode: code, Error: "zip is not installed in this container (use .tar.gz instead)"}
		case strings.Contains(combined, "NO_TAR"):
			return Output{OK: false, ExitCode: code, Error: "tar is not installed in this container"}
		default:
			return Output{OK: false, ExitCode: code, Error: stderr}
		}
	}
	return Output{OK: true, Stdout: stdout, Data: map[string]any{"path": dest, "count": len(picks)}}
}

// runContainerCmd runs one sh -lc program inside the instance container and
// returns its captured stdout (readSession caps + ctx deadline apply, like
// every sibling executor).
func runContainerCmd(ctx context.Context, drv drivers.Driver, name, script string) (string, string, int, error) {
	sess, err := drv.Exec(ctx, name, false, 0, 0, []string{"/bin/sh", "-lc", script})
	if err != nil {
		return "", "", -1, err
	}
	defer sess.Close()
	return readSession(ctx, sess)
}

// parseArchiveNameList splits a `unzip -Z1` / `tar -tzf` listing into member
// names, enforcing the entry-count bomb cap.
func parseArchiveNameList(raw string) ([]string, error) {
	var out []string
	for _, ln := range strings.Split(raw, "\n") {
		ln = strings.TrimRight(strings.TrimSpace(ln), "\r")
		if ln == "" {
			continue
		}
		out = append(out, ln)
		if len(out) > maxArchiveEntries {
			return nil, fmt.Errorf("archive entry count exceeds %d", maxArchiveEntries)
		}
	}
	return out, nil
}

// parseUnzipListTotal extracts the total unpacked size from `unzip -l`
// output (its trailing "  <total>  <n> files" line). ok=false when the
// total line is absent (caller treats it as unknown, not as zero).
func parseUnzipListTotal(raw string) (int64, bool) {
	lines := strings.Split(raw, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		ln := strings.TrimSpace(lines[i])
		if !strings.Contains(ln, " file") {
			continue
		}
		fields := strings.Fields(ln)
		if len(fields) == 0 {
			return 0, false
		}
		total, err := strconv.ParseInt(fields[0], 10, 64)
		if err != nil {
			return 0, false
		}
		return total, true
	}
	return 0, false
}

// parseTarListTotal sums the size column of `tar -tzvf` output
// (best-effort: unparseable lines are skipped, the entry-count cap above is
// the strict gate and the byte total is defense-in-depth).
func parseTarListTotal(raw string) int64 {
	var total int64
	for _, ln := range strings.Split(raw, "\n") {
		fields := strings.Fields(strings.TrimRight(strings.TrimSpace(ln), "\r"))
		if len(fields) < 3 {
			continue
		}
		if size, err := strconv.ParseInt(fields[2], 10, 64); err == nil && size > 0 {
			total += size
		}
	}
	return total
}

// executeExtract unpacks a .zip/.tar.gz inside the container (first-class
// replacement for hand-rolled `unzip`/`tar -xzf` shell actions). dest
// defaults to the archive's own directory when empty. ZipSlip-guarded: the
// member listing is validated BEFORE extraction and any absolute or ".."
// entry fails the action closed.
func executeExtract(ctx context.Context, drv drivers.Driver, name, src, dest string) Output {
	if !validActionPath(src) {
		return Output{OK: false, Error: "path is required"}
	}
	if !isZipName(src) && !isTarGzName(src) {
		return Output{OK: false, Error: "path must end with .zip or .tar.gz"}
	}
	if dest != "" && !validActionPath(dest) {
		return Output{OK: false, Error: "invalid dest"}
	}
	if dest == "" {
		dest = path.Dir(src)
	}
	var listScript, sizeScript string
	if isZipName(src) {
		listScript = "unzip -Z1 -- " + shellQuote(src) + " 2>/dev/null | head -n " + strconv.Itoa(maxArchiveEntries+1)
		sizeScript = "unzip -l -- " + shellQuote(src) + " 2>/dev/null"
	} else {
		listScript = "tar -tzf " + shellQuote(src) + " 2>/dev/null | head -n " + strconv.Itoa(maxArchiveEntries+1)
		sizeScript = "tar -tzvf " + shellQuote(src) + " 2>/dev/null | head -n " + strconv.Itoa(maxArchiveEntries+1)
	}
	rawList, listErr, listCode, lerr := runContainerCmd(ctx, drv, name, listScript)
	if lerr != nil {
		return Output{OK: false, Error: lerr.Error()}
	}
	if listCode != 0 {
		return Output{OK: false, ExitCode: listCode, Error: listErr}
	}
	members, merr := parseArchiveNameList(rawList)
	if merr != nil {
		return Output{OK: false, Error: merr.Error()}
	}
	for _, m := range members {
		if !safeArchiveEntry(m) {
			return Output{OK: false, Error: fmt.Sprintf("archive contains an unsafe entry %q", m)}
		}
	}
	rawSize, sizeErr, sizeCode, serr := runContainerCmd(ctx, drv, name, sizeScript)
	if serr != nil {
		return Output{OK: false, Error: serr.Error()}
	}
	if sizeCode == 0 {
		var total int64
		if isZipName(src) {
			if t, ok := parseUnzipListTotal(rawSize); ok {
				total = t
			} else {
				_ = sizeErr
			}
		} else {
			total = parseTarListTotal(rawSize)
		}
		if total > maxExtractBytes {
			return Output{OK: false, Error: fmt.Sprintf("archive unpacked size exceeds %d bytes", int64(maxExtractBytes))}
		}
	}
	var script string
	if isZipName(src) {
		script = "set -e; command -v unzip >/dev/null 2>&1 || { echo NO_UNZIP; exit 11; }; " +
			"mkdir -p " + shellQuote(dest) + "; unzip -qq -o " + shellQuote(src) + " -d " + shellQuote(dest) + " 2>&1"
	} else {
		script = "set -e; command -v tar >/dev/null 2>&1 || { echo NO_TAR; exit 11; }; " +
			"mkdir -p " + shellQuote(dest) + "; tar -xzf " + shellQuote(src) + " -C " + shellQuote(dest) + " 2>&1"
	}
	sess, err := drv.Exec(ctx, name, false, 0, 0, []string{"/bin/sh", "-lc", script})
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	if code != 0 {
		combined := stdout + "\n" + stderr
		switch {
		case strings.Contains(combined, "NO_UNZIP"):
			return Output{OK: false, ExitCode: code, Error: "unzip is not installed in this container"}
		case strings.Contains(combined, "NO_TAR"):
			return Output{OK: false, ExitCode: code, Error: "tar is not installed in this container"}
		default:
			return Output{OK: false, ExitCode: code, Error: stderr}
		}
	}
	return Output{OK: true, Stdout: stdout, Data: map[string]any{"path": dest, "count": len(members)}}
}

func executeDockerCmd(ctx context.Context, drv drivers.Driver, name, command string, args []string) Output {
	if drv.Name() != "docker" {
		return Output{OK: false, Error: "docker commands only available on docker driver"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("docker %s %s", shellQuote(command), shellQuoteArgs(args))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	return Output{OK: code == 0, ExitCode: code, Stdout: stdout, Stderr: stderr}
}

func executeKVMCmd(ctx context.Context, drv drivers.Driver, name, command string, args []string) Output {
	if drv.Name() != "kvm" {
		return Output{OK: false, Error: "kvm commands only available on kvm driver"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("virsh %s %s", shellQuote(command), shellQuoteArgs(args))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	return Output{OK: code == 0, ExitCode: code, Stdout: stdout, Stderr: stderr}
}

func executeLXDCmd(ctx context.Context, drv drivers.Driver, name, command string, args []string) Output {
	if drv.Name() != "lxd" {
		return Output{OK: false, Error: "lxd commands only available on lxd driver"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("lxc %s %s", shellQuote(command), shellQuoteArgs(args))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code, rerr := readSession(ctx, sess)
	if rerr != nil {
		return Output{OK: false, Error: rerr.Error()}
	}
	return Output{OK: code == 0, ExitCode: code, Stdout: stdout, Stderr: stderr}
}

// maxActionOutputBytes caps each captured stream (stdout / stderr) so a
// runaway command (e.g. `cat` of a multi-GB world file) cannot OOM the
// edge daemon or the panel by materialising unbounded output into the JSON
// response. Oversize output fails closed with an explicit error rather
// than returning a silently truncated payload.
const maxActionOutputBytes = 4 << 20 // 4 MiB per stream

func readSession(ctx context.Context, sess *drivers.ExecSession) (string, string, int, error) {
	stdoutCh := make(chan []byte, 1)
	stderrCh := make(chan []byte, 1)

	go func() {
		b, _ := io.ReadAll(io.LimitReader(sess.Stdout, maxActionOutputBytes+1))
		stdoutCh <- b
	}()
	go func() {
		b, _ := io.ReadAll(io.LimitReader(sess.Stderr, maxActionOutputBytes+1))
		stderrCh <- b
	}()

	// Wait for BOTH streams, but honour the action deadline: the previous
	// code blocked on `<-stdoutCh` with no ctx select, so a driver whose
	// pipes never reach EOF parked this handler goroutine past the edge
	// timeout (and past the panel's HTTP deadline) forever.
	var stdout, stderr []byte
	for got := 0; got < 2; {
		select {
		case <-ctx.Done():
			return "", "", -1, ctx.Err()
		case b := <-stdoutCh:
			stdout = b
			got++
		case b := <-stderrCh:
			stderr = b
			got++
		}
	}
	if len(stdout) > maxActionOutputBytes {
		return "", "", -1, fmt.Errorf("action stdout exceeds %d bytes", maxActionOutputBytes)
	}
	if len(stderr) > maxActionOutputBytes {
		return "", "", -1, fmt.Errorf("action stderr exceeds %d bytes", maxActionOutputBytes)
	}

	type waitRes struct{ code int }
	waitCh := make(chan waitRes, 1)
	go func() {
		// A non-zero exit surfaces via code (the payload), not as a Go
		// error — only a hung Wait past the deadline is an error here.
		code, _ := sess.Wait()
		waitCh <- waitRes{code}
	}()
	select {
	case <-ctx.Done():
		return "", "", -1, ctx.Err()
	case w := <-waitCh:
		return string(stdout), string(stderr), w.code, nil
	}
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// shellQuoteArgs quotes each arg so hostile values (e.g. "; rm -rf /")
// stay a single shell word instead of splitting the -lc program.
func shellQuoteArgs(args []string) string {
	q := make([]string, 0, len(args))
	for _, a := range args {
		q = append(q, shellQuote(a))
	}
	return strings.Join(q, " ")
}

type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"is_dir"`
	ModTime int64  `json:"mod_time"`
	Mode    string `json:"mode,omitempty"`
}

func parseLsOutput(output string) []FileEntry {
	var files []FileEntry
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total ") {
			continue
		}
		// Parse ls -la format: perms links owner group size month day time name
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}
		perms := fields[0]
		isDir := strings.HasPrefix(perms, "d")
		sizeStr := fields[4]
		size := int64(0)
		fmt.Sscanf(sizeStr, "%d", &size)
		name := strings.Join(fields[8:], " ")
		files = append(files, FileEntry{
			Name:  name,
			Size:  size,
			IsDir: isDir,
			Mode:  perms,
		})
	}
	return files
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Output{OK: false, Error: msg})
}
