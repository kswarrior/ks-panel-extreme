package configparse

// Edge execution for config-file parsers: read/modify/write files INSIDE the
// workload via the driver's Exec contract (same as the install engine).
//
// The panel already validated spec.config_files[] and substituted {{VAR}};
// the edge re-validates lightly (fail closed) and applies each file:
//   1. cat the current content (missing → create_if_missing or error)
//   2. ApplyConfigContent(parser, content, find)
//   3. heredoc-write back when changed (mkdir -p dirname, quoted EOF)

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/example/ksedge/internal/drivers"
)

// File mirrors the wire shape the panel sends (edge.ConfigFile equivalent).
type File struct {
	File            string         `json:"file"`
	Parser          string         `json:"parser"`
	Find            map[string]any `json:"find"`
	CreateIfMissing bool           `json:"create_if_missing,omitempty"`
}

// ExecFn mirrors install.ExecFn: run a command inside the workload.
type ExecFn func(ctx context.Context, command []string) (stdout, stderr string, exitCode int, err error)

// ApplyResult is one file's outcome.
type ApplyResult struct {
	File    string `json:"file"`
	Changed bool   `json:"changed"`
	Error   string `json:"error,omitempty"`
}

// ApplyViaExec applies files inside the workload via execFn.
// Returns per-file results; first hard failure aborts (fail closed) unless
// the file entry is missing and create_if_missing handles it.
func ApplyViaExec(ctx context.Context, execFn ExecFn, files []File) ([]ApplyResult, error) {
	results := make([]ApplyResult, 0, len(files))
	for _, f := range files {
		res := ApplyResult{File: f.File}
		parser := strings.ToLower(strings.TrimSpace(f.Parser))
		if parser == "yml" {
			parser = "yaml"
		}
		if !validConfigParsers[parser] {
			res.Error = fmt.Sprintf("unknown parser %q", f.Parser)
			results = append(results, res)
			return results, fmt.Errorf("config %q: %s", f.File, res.Error)
		}
		if err := validateConfigFilePath(strings.TrimSpace(f.File)); err != nil {
			res.Error = err.Error()
			results = append(results, res)
			return results, fmt.Errorf("config %q: %s", f.File, res.Error)
		}
		if len(f.Find) == 0 {
			res.Error = "find must not be empty"
			results = append(results, res)
			return results, fmt.Errorf("config %q: %s", f.File, res.Error)
		}
		path := strings.TrimSpace(f.File)
		// Read current content. Use cat -- to handle dash-prefixed names.
		stdout, stderr, code, err := execFn(ctx, []string{"/bin/sh", "-lc", "cat -- " + shellQuote(path) + " 2>/dev/null; echo \"__KSEXIT:$?\""})
		_ = stderr
		_ = code
		content := ""
		missing := false
		if err != nil {
			missing = true
		} else {
			// Split trailing marker.
			if idx := strings.LastIndex(stdout, "__KSEXIT:"); idx >= 0 {
				marker := strings.TrimSpace(stdout[idx:])
				codestr := strings.TrimPrefix(marker, "__KSEXIT:")
				content = stdout[:idx]
				// Trim one trailing newline added by echo? The echo adds
				// "\n__KSEXIT:N" — content keeps its original bytes minus that.
				content = strings.TrimSuffix(content, "\n")
				// If original file lacked trailing newline, TrimSuffix above
				// is harmless (cat output + echo newline split).
				if codestr != "0" {
					missing = true
					content = ""
				}
			} else {
				content = stdout
			}
		}
		if missing {
			if !f.CreateIfMissing {
				// Distinguish "file does not exist" from exec errors: probe
				// with test -e for a clear message.
				_, _, probeCode, _ := execFn(ctx, []string{"/bin/sh", "-lc", "test -e " + shellQuote(path)})
				if probeCode != 0 {
					res.Error = "file does not exist (set create_if_missing to create it)"
				} else {
					res.Error = "could not read file"
				}
				results = append(results, res)
				return results, fmt.Errorf("config %q: %s", f.File, res.Error)
			}
			content = seedForParser(parser)
		}
		newContent, changed, err := ApplyConfigContent(parser, content, f.Find)
		if err != nil {
			res.Error = err.Error()
			results = append(results, res)
			return results, fmt.Errorf("config %q: %s", f.File, res.Error)
		}
		res.Changed = changed
		if !changed {
			results = append(results, res)
			continue
		}
		if err := writeViaExec(ctx, execFn, path, newContent); err != nil {
			res.Error = err.Error()
			results = append(results, res)
			return results, fmt.Errorf("config %q: write: %s", f.File, res.Error)
		}
		results = append(results, res)
	}
	return results, nil
}

func seedForParser(parser string) string {
	switch parser {
	case "json":
		return "{}\n"
	case "yaml":
		return "{}\n"
	case "toml":
		return ""
	case "xml":
		return ""
	default:
		return ""
	}
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func writeViaExec(ctx context.Context, execFn ExecFn, path, content string) error {
	const marker = "KSEDGE_CONFIG_EOF"
	if strings.Contains(content, "\n"+marker+"\n") || strings.HasPrefix(content, marker+"\n") || strings.HasSuffix(content, "\n"+marker) || content == marker {
		return fmt.Errorf("content contains the heredoc terminator")
	}
	script := strings.Join([]string{
		`set -e`,
		`mkdir -p "$(dirname ` + shellQuote(path) + `)"`,
		`cat > ` + shellQuote(path) + ` <<'` + marker + `'`,
		content,
		marker,
	}, "\n")
	stdout, stderr, code, err := execFn(ctx, []string{"/bin/sh", "-lc", script})
	_ = stdout
	if err != nil {
		if stderr != "" {
			return fmt.Errorf("%s: %s", err.Error(), firstLine(stderr))
		}
		return err
	}
	if code != 0 {
		if stderr != "" {
			return fmt.Errorf("exit %d: %s", code, firstLine(stderr))
		}
		return fmt.Errorf("exit %d", code)
	}
	return nil
}

func firstLine(s string) string {
	for _, ln := range strings.Split(s, "\n") {
		if ln = strings.TrimSpace(ln); ln != "" {
			return ln
		}
	}
	return s
}

// ---------------------------------------------------------------------------
// HTTP handler: POST /api/edge/configparse
// Body: {token, kind, name, files[], timeout_sec?}
// Applies parsers inside the named workload (panel calls this before start
// so hand-edited files are re-synced, and the install engine calls the same
// ApplyViaExec post-steps).
// ---------------------------------------------------------------------------

// Request is the body of POST /api/edge/configparse.
type Request struct {
	Token   string         `json:"token"`
	Kind    string         `json:"kind"`
	Name    string         `json:"name"`
	Files   []File         `json:"files"`
	Timeout int            `json:"timeout_sec,omitempty"`
}

// Response is what the edge hands back.
type Response struct {
	OK      bool          `json:"ok"`
	Applied []ApplyResult `json:"applied,omitempty"`
	Error   string        `json:"error,omitempty"`
}

// Handler returns an http.Handler for /api/edge/configparse.
func Handler(token string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/edge/configparse", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeErr(w, http.StatusBadRequest, "read body: "+err.Error())
			return
		}
		var req Request
		if err := json.Unmarshal(raw, &req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}
		if token == "" || subtle.ConstantTimeCompare([]byte(req.Token), []byte(token)) != 1 {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if req.Name == "" || req.Kind == "" {
			writeErr(w, http.StatusBadRequest, "kind and name are required")
			return
		}
		if len(req.Files) == 0 {
			writeErr(w, http.StatusBadRequest, "files must not be empty")
			return
		}
		if len(req.Files) > configFileMaxEntries {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("at most %d files", configFileMaxEntries))
			return
		}
		drv, ok := drivers.Registry[req.Kind]
		if !ok {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("unknown driver kind: %s", req.Kind))
			return
		}
		timeout := 60 * time.Second
		if req.Timeout > 0 && req.Timeout <= 600 {
			timeout = time.Duration(req.Timeout) * time.Second
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		execFn := func(ctx context.Context, command []string) (string, string, int, error) {
			// Retry on "container is not running" like the install handler.
			var sess *drivers.ExecSession
			var err error
			for attempt := 0; attempt < 15; attempt++ {
				sess, err = drv.Exec(ctx, req.Name, false, 0, 0, command)
				if err == nil {
					break
				}
				msg := strings.ToLower(err.Error())
				if !(strings.Contains(msg, "is not running") && strings.Contains(msg, "container")) {
					return "", "", -1, err
				}
				select {
				case <-ctx.Done():
					return "", "", -1, ctx.Err()
				case <-time.After(time.Second):
				}
			}
			if err != nil {
				return "", "", -1, err
			}
			defer sess.Close()
			stdoutCh := make(chan []byte, 1)
			stderrCh := make(chan []byte, 1)
			go func() { b, _ := io.ReadAll(sess.Stdout); stdoutCh <- b }()
			go func() { b, _ := io.ReadAll(sess.Stderr); stderrCh <- b }()
			stdout := <-stdoutCh
			stderr := <-stderrCh
			code, _ := sess.Wait()
			return string(stdout), string(stderr), code, nil
		}
		applied, err := ApplyViaExec(ctx, execFn, req.Files)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Applied: applied, Error: err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{OK: true, Applied: applied})
	})
	return mux
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
