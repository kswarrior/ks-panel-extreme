package handlers

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Stack install-workflow execution.
//
// The Studio form stores the Installation workflow (same step vocabulary as
// templates: shell/download/extract/...) in the manifest's installSteps[]
// (fallback: install[]). The install job executes those steps for real on
// the panel host, inside the stack's workdir, streaming stdout/stderr into
// the job log. Stop kills the in-flight command (exec.CommandContext);
// retries[] and ignore_errors are honoured per step.

// stackWorkflowStep mirrors the template InstallStep shape.
type stackWorkflowStep struct {
	Action       string `json:"action"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	Filename     string `json:"filename"`
	Archive      string `json:"archive"`
	Dest         string `json:"dest"`
	From         string `json:"from"`
	To           string `json:"to"`
	Path         string `json:"path"`
	Content      string `json:"content"`
	Branch       string `json:"branch"`
	Retries      string `json:"retries"`
	IgnoreErrors bool   `json:"ignore_errors"`
}

// stackManifestWorkflowSteps parses the install workflow out of a stack
// manifest. installSteps[] wins; install[] is the legacy fallback.
func stackManifestWorkflowSteps(manifest json.RawMessage) []stackWorkflowStep {
	return stackManifestStepsByKeys(manifest, "installSteps", "install")
}

// stackManifestLaunchSteps parses the launch workflow out of a stack
// manifest. launchSteps[] wins; launch[] is the legacy fallback.
func stackManifestLaunchSteps(manifest json.RawMessage) []stackWorkflowStep {
	return stackManifestStepsByKeys(manifest, "launchSteps", "launch")
}

func stackManifestStepsByKeys(manifest json.RawMessage, primary, fallback string) []stackWorkflowStep {
	if len(manifest) == 0 {
		return nil
	}
	// Struct (not map): real manifests mix strings/objects/arrays, and a
	// map[string][]step would reject every non-array key outright.
	var m struct {
		InstallSteps []stackWorkflowStep `json:"installSteps"`
		Install      []stackWorkflowStep `json:"install"`
		LaunchSteps  []stackWorkflowStep `json:"launchSteps"`
		Launch       []stackWorkflowStep `json:"launch"`
	}
	if err := json.Unmarshal(manifest, &m); err != nil {
		return nil
	}
	all := map[string][]stackWorkflowStep{
		"installSteps": m.InstallSteps,
		"install":      m.Install,
		"launchSteps":  m.LaunchSteps,
		"launch":       m.Launch,
	}
	if len(all[primary]) > 0 {
		return all[primary]
	}
	return all[fallback]
}

// stackWorkflowRel validates a workdir-relative path: no absolutes, no
// ".." escapes. URLs and commands never pass through here.
func stackWorkflowRel(p, what string) (string, error) {
	t := strings.TrimSpace(p)
	if t == "" {
		return "", fmt.Errorf("%s: path is required", what)
	}
	if filepath.IsAbs(t) {
		return "", fmt.Errorf("%s: must be relative to the workdir, got %q", what, p)
	}
	clean := filepath.ToSlash(filepath.Clean(t))
	if clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("%s: must stay inside the workdir", what)
	}
	return t, nil
}

// stackWorkflowShell translates one workflow step into a /bin/sh command
// line. shellQuotePath (application runs) quotes every interpolated value.
func stackWorkflowShell(st stackWorkflowStep, idx int) (string, error) {
	q := shellQuotePath
	switch strings.TrimSpace(st.Action) {
	case "shell":
		if strings.TrimSpace(st.Command) == "" {
			return "", fmt.Errorf("step %d (shell): command is required", idx)
		}
		return st.Command, nil
	case "download":
		u := strings.TrimSpace(st.URL)
		if u == "" {
			return "", fmt.Errorf("step %d (download): url is required", idx)
		}
		fn := strings.TrimSpace(st.Filename)
		if fn == "" {
			if parsed, err := url.Parse(u); err == nil {
				if base := filepath.Base(strings.TrimSuffix(parsed.Path, "/")); base != "" && base != "." && base != "/" {
					fn = base
				}
			}
			if fn == "" {
				fn = "download.bin"
			}
		}
		if _, err := stackWorkflowRel(fn, "download filename"); err != nil {
			return "", fmt.Errorf("step %d (download): %w", idx, err)
		}
		return fmt.Sprintf("curl -fsSL --max-time 600 %s -o %s", q(u), q(fn)), nil
	case "extract":
		archive, err := stackWorkflowRel(st.Archive, "extract archive")
		if err != nil {
			return "", fmt.Errorf("step %d (extract): %w", idx, err)
		}
		dest := strings.TrimSpace(st.Dest)
		if dest == "" {
			dest = "."
		}
		if dest != "." {
			if _, err := stackWorkflowRel(dest, "extract dest"); err != nil {
				return "", fmt.Errorf("step %d (extract): %w", idx, err)
			}
		}
		lower := strings.ToLower(archive)
		extract := ""
		switch {
		case strings.HasSuffix(lower, ".zip"):
			extract = fmt.Sprintf("unzip -o %s", q(archive))
			if dest != "." {
				extract += fmt.Sprintf(" -d %s", q(dest))
			}
		case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
			extract = fmt.Sprintf("tar -xzf %s", q(archive))
		case strings.HasSuffix(lower, ".tar.bz2") || strings.HasSuffix(lower, ".tbz2"):
			extract = fmt.Sprintf("tar -xjf %s", q(archive))
		case strings.HasSuffix(lower, ".tar.xz") || strings.HasSuffix(lower, ".txz"):
			extract = fmt.Sprintf("tar -xJf %s", q(archive))
		case strings.HasSuffix(lower, ".tar"):
			extract = fmt.Sprintf("tar -xf %s", q(archive))
		case strings.HasSuffix(lower, ".gz"):
			extract = fmt.Sprintf("gunzip -kf %s", q(archive))
		default:
			return "", fmt.Errorf("step %d (extract): unsupported archive %q (want .zip/.tar.gz/.tgz/.tar.bz2/.tar.xz/.tar/.gz)", idx, st.Archive)
		}
		if dest != "." && !strings.HasSuffix(lower, ".zip") {
			extract = fmt.Sprintf("mkdir -p %s && %s -C %s", q(dest), extract, q(dest))
		} else if dest != "." {
			extract = fmt.Sprintf("mkdir -p %s && %s", q(dest), extract)
		}
		return extract, nil
	case "move":
		from, err := stackWorkflowRel(st.From, "move from")
		if err != nil {
			return "", fmt.Errorf("step %d (move): %w", idx, err)
		}
		to, err := stackWorkflowRel(st.To, "move to")
		if err != nil {
			return "", fmt.Errorf("step %d (move): %w", idx, err)
		}
		return fmt.Sprintf("mv %s %s", q(from), q(to)), nil
	case "write":
		path, err := stackWorkflowRel(st.Path, "write path")
		if err != nil {
			return "", fmt.Errorf("step %d (write): %w", idx, err)
		}
		// base64 round-trip: content never fights shell quoting, whatever it
		// holds (quotes, newlines, heredoc delimiters).
		b64 := base64.StdEncoding.EncodeToString([]byte(st.Content))
		dir := filepath.Dir(path)
		pre := ""
		if dir != "." {
			pre = fmt.Sprintf("mkdir -p %s && ", q(dir))
		}
		return fmt.Sprintf("%sprintf '%%s' '%s' | base64 -d > %s", pre, b64, q(path)), nil
	case "chmod":
		path, err := stackWorkflowRel(st.Path, "chmod path")
		if err != nil {
			return "", fmt.Errorf("step %d (chmod): %w", idx, err)
		}
		mode := strings.TrimSpace(st.Command)
		if len(mode) < 3 || len(mode) > 4 {
			return "", fmt.Errorf("step %d (chmod): mode %q must be 3-4 octal digits (e.g. 755)", idx, st.Command)
		}
		for _, r := range mode {
			if r < '0' || r > '7' {
				return "", fmt.Errorf("step %d (chmod): mode %q must be 3-4 octal digits (e.g. 755)", idx, st.Command)
			}
		}
		return fmt.Sprintf("chmod %s %s", mode, q(path)), nil
	case "mkdir":
		path, err := stackWorkflowRel(st.Path, "mkdir path")
		if err != nil {
			return "", fmt.Errorf("step %d (mkdir): %w", idx, err)
		}
		return fmt.Sprintf("mkdir -p %s", q(path)), nil
	case "git_clone":
		u := strings.TrimSpace(st.URL)
		if u == "" {
			return "", fmt.Errorf("step %d (git_clone): url is required", idx)
		}
		dest := strings.TrimSpace(st.Dest)
		if dest == "" {
			dest = strings.TrimSuffix(filepath.Base(strings.TrimSuffix(u, "/")), ".git")
			if dest == "" || dest == "." || dest == "/" {
				dest = "repo"
			}
		}
		if _, err := stackWorkflowRel(dest, "git_clone dest"); err != nil {
			return "", fmt.Errorf("step %d (git_clone): %w", idx, err)
		}
		branch := ""
		if b := strings.TrimSpace(st.Branch); b != "" {
			branch = fmt.Sprintf("--branch %s ", q(b))
		}
		return fmt.Sprintf("git clone --depth 1 %s%s %s", branch, q(u), q(dest)), nil
	case "pip_install":
		if strings.TrimSpace(st.Command) == "" {
			return "", fmt.Errorf("step %d (pip_install): package or requirements flag is required", idx)
		}
		return fmt.Sprintf("pip install %s", st.Command), nil
	case "npm_install":
		if strings.TrimSpace(st.Command) == "" {
			return "npm install", nil
		}
		return fmt.Sprintf("npm install %s", st.Command), nil
	case "http_check":
		u := strings.TrimSpace(st.URL)
		if u == "" {
			return "", fmt.Errorf("step %d (http_check): url is required", idx)
		}
		return fmt.Sprintf("curl -fsS --max-time 120 -o /dev/null -w '%%{http_code}' %s", q(u)), nil
	default:
		if strings.TrimSpace(st.Action) == "" {
			return "", fmt.Errorf("step %d: action is required", idx)
		}
		return "", fmt.Errorf("step %d: unknown action %q", idx, st.Action)
	}
}

// stackWorkflowStepLabel is the console row title: "3. shell — <operand>".
func stackWorkflowStepLabel(st stackWorkflowStep, idx int) string {
	action := strings.TrimSpace(st.Action)
	if action == "" {
		action = "step"
	}
	operand := strings.TrimSpace(st.Command)
	switch action {
	case "download", "git_clone", "http_check":
		operand = strings.TrimSpace(st.URL)
	case "extract":
		operand = strings.TrimSpace(st.Archive)
	case "move":
		operand = strings.TrimSpace(st.From + " → " + st.To)
	case "write", "mkdir", "chmod":
		operand = strings.TrimSpace(st.Path)
	case "pip_install", "npm_install":
		operand = strings.TrimSpace(st.Command)
	}
	operand = strings.ReplaceAll(operand, "\n", " ")
	if len(operand) > 60 {
		operand = operand[:60] + "…"
	}
	if operand == "" {
		return fmt.Sprintf("%d. %s", idx, action)
	}
	return fmt.Sprintf("%d. %s — %s", idx, action, operand)
}

// stackWorkflowRetries parses the step retry budget (clamped 0..10).
func stackWorkflowRetries(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 0 {
		return 0
	}
	if n > 10 {
		return 10
	}
	return n
}

// runStackWorkflowStep executes one translated command in dir, streaming
// stdout/stderr into the job log line by line. Cancellation kills the
// process via CommandContext; the caller maps a dead ctx to "stopped".
func runStackWorkflowStep(ctx context.Context, dir, cmd string, job *stackOpJob) error {
	c := exec.CommandContext(ctx, "/bin/sh", "-c", cmd)
	c.Dir = dir
	// Minimal environment (same contract as application panel-shell runs):
	// PATH plus the run's own home/tmp inside the workdir. Nothing leaks
	// from the panel process.
	c.Env = []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"HOME=" + dir,
		"TMPDIR=" + dir,
	}
	stdout, err := c.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := c.StderrPipe()
	if err != nil {
		return err
	}
	if err := c.Start(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("start shell: %w", err)
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(stdout)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			job.appendLog(stackOpTruncateLine(sc.Text()))
		}
	}()
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(stderr)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			job.appendLog("stderr: " + stackOpTruncateLine(sc.Text()))
		}
	}()
	wg.Wait()
	if err := c.Wait(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if ee, ok := err.(*exec.ExitError); ok {
			return fmt.Errorf("exit code %d", ee.ExitCode())
		}
		return err
	}
	return nil
}

// stackOpTimeout reads a whole-workflow budget the form stores as
// <key>_timeout_sec (string digits from the Studio form, number from
// hand-written manifests). Default 30 min, clamped to 1 min .. 6 h.
func stackOpTimeout(manifest json.RawMessage, key string) time.Duration {
	const def = 1800 * time.Second
	var m map[string]any
	if err := json.Unmarshal(manifest, &m); err != nil {
		return def
	}
	raw, ok := m[key]
	if !ok {
		return def
	}
	secs := 0
	switch v := raw.(type) {
	case string:
		secs, _ = strconv.Atoi(strings.TrimSpace(v))
	case float64:
		secs = int(v)
	}
	if secs < 60 {
		return def
	}
	if secs > 21600 {
		secs = 21600
	}
	return time.Duration(secs) * time.Second
}
