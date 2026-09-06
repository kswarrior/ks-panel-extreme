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
	"strings"
	"time"

	"github.com/example/ksedge/internal/drivers"
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
		default:
			writeErr(w, http.StatusBadRequest, "unknown action type: "+string(in.Type))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})
}

func executeShell(ctx context.Context, drv drivers.Driver, name, command string, args []string, env map[string]string) Output {
	cmd := []string{"/bin/sh", "-lc", command}
	if len(args) > 0 {
		cmd = append(cmd, args...)
	}

	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code := readSession(sess)
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

	stdout, stderr, code := readSession(sess)
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

	stdout, stderr, code := readSession(sess)
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

	stdout, stderr, code := readSession(sess)
	if code != 0 {
		return Output{OK: false, ExitCode: code, Error: stderr}
	}
	// Parse ls output into structured data
	files := parseLsOutput(stdout)
	return Output{OK: true, Data: files}
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

	stdout, stderr, code := readSession(sess)
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

	stdout, stderr, code := readSession(sess)
	return Output{OK: code == 0, ExitCode: code, Stdout: stdout, Stderr: stderr}
}

func executeLXDCmd(ctx context.Context, drv drivers.Driver, name, command string, args []string) Output {
	if drv.Name() != "lxd" {
		return Output{OK: false, Error: "lxd commands only available on lxd driver"}
	}
	cmd := []string{"/bin/sh", "-lc", fmt.Sprintf("lxc %s %s", command, strings.Join(args, " "))}
	sess, err := drv.Exec(ctx, name, false, 0, 0, cmd)
	if err != nil {
		return Output{OK: false, Error: err.Error()}
	}
	defer sess.Close()

	stdout, stderr, code := readSession(sess)
	return Output{OK: code == 0, ExitCode: code, Stdout: stdout, Stderr: stderr}
}

func readSession(sess *drivers.ExecSession) (string, string, int) {
	stdoutCh := make(chan []byte, 1)
	stderrCh := make(chan []byte, 1)

	go func() {
		b, _ := io.ReadAll(sess.Stdout)
		stdoutCh <- b
	}()
	go func() {
		b, _ := io.ReadAll(sess.Stderr)
		stderrCh <- b
	}()

	stdout := <-stdoutCh
	stderr := <-stderrCh
	code, _ := sess.Wait()

	return string(stdout), string(stderr), code
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
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
