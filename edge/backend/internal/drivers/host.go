package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/creack/pty"
)

// host implements the "host" kind: a simple shell service running directly
// on the edge host filesystem with no container/VM isolation.
//
// Each instance lives under <base>/host-<name>/ where base is
// $KSPANEL_INSTANCES_DIR or /var/lib/kspanel/instances (temp fallback for
// non-root dev boxes). Layout:
//
//	host-<name>/config.json  — persisted deploy spec (command + env)
//	host-<name>/run.sh       — generated launcher (env exports + command)
//	host-<name>/service.pid  — pid of the running service (absent = stopped)
//	host-<name>/service.log  — combined stdout/stderr of the service
//	host-<name>/status       — last known status ("running"/"stopped")
//	host-<name>/snapshots/   — tar.gz snapshots (Snapshot op)
//
// Deploy creates the dir + writes config/run.sh, then starts the service
// when a startup command is configured. Start/Stop/Kill manage the pid.
// Exec runs a command inside the instance dir (used by terminal WS,
// one-shot exec-rpc, install workflows and metrics gathering). Files are
// managed through /api/edge/files kind=host (see files handler) or the
// hostfiles browser. Ports are direct host ports (UpdatePorts is a no-op).
type host struct{}

func newHost() Driver { return &host{} }

func (d *host) Name() string { return "host" }

// Attach is not implemented for host: there is no single PID-1 stdio
// bridge. The Terminal page's interactive shell (Exec WS) and the service
// log cover the console use-cases. Fail closed like kvm/lxd/multipass.
func (d *host) Attach(_ context.Context, _ string) (*ExecSession, error) {
	return nil, fmt.Errorf("console attach is not supported for host instances (use terminal)")
}

// hostBaseDir resolves the instance root. $KSPANEL_INSTANCES_DIR wins
// (the edge CLI can export the configured instances_dir for drivers);
// otherwise the documented default. Non-root dev boxes without write
// access fall back to the OS temp dir so `go test` and local runs work
// without sudo.
func hostBaseDir() string {
	if v := strings.TrimSpace(os.Getenv("KSPANEL_INSTANCES_DIR")); v != "" {
		return filepath.Clean(v)
	}
	const def = "/var/lib/kspanel/instances"
	if err := os.MkdirAll(def, 0o755); err == nil {
		return def
	}
	// Best-effort writability probe: a MkdirAll that succeeded above
	// already returned. If we are here the default is not writable —
	// fall back to temp so non-root runs still function.
	if st, err := os.Stat(def); err == nil && st.IsDir() {
		if f, err := os.OpenFile(filepath.Join(def, ".writetest"), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600); err == nil {
			_ = f.Close()
			_ = os.Remove(filepath.Join(def, ".writetest"))
			return def
		}
	}
	return filepath.Join(os.TempDir(), "kspanel-instances")
}

func validHostName(name string) bool {
	if len(name) == 0 || len(name) > 63 {
		return false
	}
	if !isHostAlnum(name[0]) {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		if !isHostAlnum(c) && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

func isHostAlnum(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
}

func hostDirFor(name string) (string, error) {
	if !validHostName(name) {
		return "", fmt.Errorf("host: invalid instance name %q (1-63 chars, [A-Za-z0-9_-], must start alnum)", name)
	}
	return filepath.Join(hostBaseDir(), "host-"+name), nil
}

// hostStoredConfig is the persisted deploy spec for a host instance.
type hostStoredConfig struct {
	Command    string            `json:"command"`
	Env        map[string]string `json:"env,omitempty"`
	WorkingDir string            `json:"working_dir,omitempty"`
	Image      string            `json:"image,omitempty"`
}

func hostConfigPath(dir string) string { return filepath.Join(dir, "config.json") }
func hostPidPath(dir string) string    { return filepath.Join(dir, "service.pid") }
func hostLogPath(dir string) string    { return filepath.Join(dir, "service.log") }
func hostRunPath(dir string) string    { return filepath.Join(dir, "run.sh") }
func hostStatusPath(dir string) string { return filepath.Join(dir, "status") }

// extractHostCommand pulls the service command out of the merged template
// spec. Accepted spellings (first non-empty wins):
//
//	command (string) | command ([]any joined with spaces)
//	startup_command (string)
//	advanced.startup_command (string)
func extractHostCommand(cfg map[string]any) string {
	if s, ok := cfg["command"].(string); ok && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	if arr, ok := cfg["command"].([]any); ok && len(arr) > 0 {
		parts := make([]string, 0, len(arr))
		for _, it := range arr {
			if s := anyToString(it); strings.TrimSpace(s) != "" {
				parts = append(parts, s)
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, " ")
		}
	}
	if s, ok := cfg["startup_command"].(string); ok && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	if adv, ok := cfg["advanced"].(map[string]any); ok {
		if s, ok := adv["startup_command"].(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func extractHostEnv(cfg map[string]any) map[string]string {
	return asStringMap(cfg["env"])
}

func extractHostWorkingDir(cfg map[string]any) string {
	if s, ok := cfg["working_dir"].(string); ok && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	if adv, ok := cfg["advanced"].(map[string]any); ok {
		if s, ok := adv["working_dir"].(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func readHostConfig(dir string) (hostStoredConfig, error) {
	var hc hostStoredConfig
	raw, err := os.ReadFile(hostConfigPath(dir))
	if err != nil {
		return hc, err
	}
	if err := json.Unmarshal(raw, &hc); err != nil {
		return hc, err
	}
	return hc, nil
}

func readHostPid(dir string) (int, error) {
	raw, err := os.ReadFile(hostPidPath(dir))
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || pid <= 0 {
		return 0, fmt.Errorf("bad pid file")
	}
	return pid, nil
}

func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	if err := proc.Signal(syscall.Signal(0)); err != nil {
		// EPERM means the process exists but we may not signal it.
		return err == syscall.EPERM
	}
	return true
}

func hostStatus(dir string) string {
	if pid, err := readHostPid(dir); err == nil && pidAlive(pid) {
		return "running"
	}
	return "stopped"
}

func writeHostStatus(dir, status string) {
	_ = os.WriteFile(hostStatusPath(dir), []byte(status+"\n"), 0o644)
}

func shellEscapeEnv(v string) string {
	return "'" + strings.ReplaceAll(v, "'", "'\\''") + "'"
}

// isValidHostEnvName mirrors execstage.IsEnvName: POSIX identifier only.
// Run-script export lines interpolate the key unquoted, so anything else
// (spaces, ';', newlines, '=') would break out of the assignment and run
// as shell. Invalid keys are skipped fail-closed.
func isValidHostEnvName(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r == '_' {
			continue
		}
		if r < 'A' || (r > 'Z' && r < 'a') || r > 'z' {
			if r < '0' || r > '9' || i == 0 {
				return false
			}
		}
	}
	return true
}

func writeHostRunScript(dir, command string, env map[string]string) error {
	var b strings.Builder
	b.WriteString("#!/bin/sh\n")
	b.WriteString("# Generated by ksedge host driver — do not edit manually.\n")
	b.WriteString("cd " + shellEscapeEnv(dir) + "\n")
	for k, v := range env {
		if !isValidHostEnvName(k) {
			continue
		}
		b.WriteString("export " + k + "=" + shellEscapeEnv(v) + "\n")
	}
	b.WriteString("exec " + command + "\n")
	if err := os.WriteFile(hostRunPath(dir), []byte(b.String()), 0o755); err != nil {
		return err
	}
	return nil
}

func startHostProcess(dir, command string, env map[string]string) (int, error) {
	if strings.TrimSpace(command) == "" {
		return 0, fmt.Errorf("host: no startup command configured (set command or advanced.startup_command in the template spec)")
	}
	logF, err := os.OpenFile(hostLogPath(dir), os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
	if err != nil {
		return 0, fmt.Errorf("host: open log: %w", err)
	}
	cmd := exec.Command("/bin/sh", "-c", command)
	cmd.Dir = dir
	// Minimal safe base + persisted env. The edge process env is NOT
	// inherited so a service can never observe the daemon's own env.
	cmd.Env = append([]string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"HOME=" + dir,
		"TMPDIR=" + dir,
	}, flattenHostEnv(env)...)
	cmd.Stdout = logF
	cmd.Stderr = logF
	// Detach stdio: the child must not hold the lifecycle HTTP handler's
	// pipes open.
	if err := cmd.Start(); err != nil {
		_ = logF.Close()
		return 0, fmt.Errorf("host: start: %w", err)
	}
	pid := cmd.Process.Pid
	// Reap in background so the child never becomes a zombie; the pid
	// file remains the source of truth for status (kill -0 probe).
	go func() {
		_ = cmd.Wait()
		_ = logF.Close()
	}()
	if err := os.WriteFile(hostPidPath(dir), []byte(strconv.Itoa(pid)+"\n"), 0o644); err != nil {
		return pid, fmt.Errorf("host: write pid: %w", err)
	}
	writeHostStatus(dir, "running")
	return pid, nil
}

func flattenHostEnv(env map[string]string) []string {
	out := make([]string, 0, len(env))
	for k, v := range env {
		if !isValidHostEnvName(k) {
			continue
		}
		out = append(out, k+"="+v)
	}
	return out
}

func stopHostPid(ctx context.Context, pid int, graceful time.Duration) {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return
	}
	_ = proc.Signal(syscall.SIGTERM)
	deadline := time.Now().Add(graceful)
	for time.Now().Before(deadline) {
		if !pidAlive(pid) {
			return
		}
		select {
		case <-ctx.Done():
			_ = proc.Signal(syscall.SIGKILL)
			return
		case <-time.After(200 * time.Millisecond):
		}
	}
	_ = proc.Signal(syscall.SIGKILL)
}

func (d *host) Deploy(ctx context.Context, name string, cfg map[string]any) (Result, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return Result{}, err
	}
	if cfg == nil {
		cfg = map[string]any{}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Result{}, fmt.Errorf("host: create dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "snapshots"), 0o755); err != nil {
		return Result{}, fmt.Errorf("host: create snapshots dir: %w", err)
	}
	command := extractHostCommand(cfg)
	env := extractHostEnv(cfg)
	working := extractHostWorkingDir(cfg)
	image, _ := cfg["image"].(string)
	stored := hostStoredConfig{Command: command, Env: env, WorkingDir: working, Image: image}
	raw, _ := json.MarshalIndent(stored, "", "  ")
	if err := os.WriteFile(hostConfigPath(dir), raw, 0o644); err != nil {
		return Result{}, fmt.Errorf("host: write config: %w", err)
	}
	// If a previous service is somehow still tracked, stop it first so a
	// redeploy never leaves two daemons fighting over the same dir.
	if pid, perr := readHostPid(dir); perr == nil && pidAlive(pid) {
		stopHostPid(ctx, pid, 5*time.Second)
		_ = os.Remove(hostPidPath(dir))
	}
	if strings.TrimSpace(command) == "" {
		writeHostStatus(dir, "stopped")
		return Result{ExternalID: name, Status: "stopped"}, nil
	}
	if err := writeHostRunScript(dir, command, env); err != nil {
		return Result{}, err
	}
	// Respect context cancellation while still starting promptly.
	select {
	case <-ctx.Done():
		return Result{}, ctx.Err()
	default:
	}
	if _, err := startHostProcess(dir, command, env); err != nil {
		writeHostStatus(dir, "stopped")
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

func (d *host) Start(ctx context.Context, name string) (Result, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return Result{}, err
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return Result{}, fmt.Errorf("host: instance %q not found (deploy it first)", name)
	}
	if pid, err := readHostPid(dir); err == nil && pidAlive(pid) {
		writeHostStatus(dir, "running")
		return Result{ExternalID: name, Status: "running"}, nil
	}
	_ = os.Remove(hostPidPath(dir))
	hc, err := readHostConfig(dir)
	if err != nil {
		return Result{}, fmt.Errorf("host: read config: %w", err)
	}
	if strings.TrimSpace(hc.Command) == "" {
		return Result{}, fmt.Errorf("host: no startup command configured (set command or advanced.startup_command in the template spec)")
	}
	if err := writeHostRunScript(dir, hc.Command, hc.Env); err != nil {
		return Result{}, err
	}
	select {
	case <-ctx.Done():
		return Result{}, ctx.Err()
	default:
	}
	if _, err := startHostProcess(dir, hc.Command, hc.Env); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

func (d *host) Stop(ctx context.Context, name string) (Result, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return Result{}, err
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return Result{ExternalID: name, Status: "stopped"}, nil
	}
	pid, err := readHostPid(dir)
	if err != nil || !pidAlive(pid) {
		_ = os.Remove(hostPidPath(dir))
		writeHostStatus(dir, "stopped")
		return Result{ExternalID: name, Status: "stopped"}, nil
	}
	stopHostPid(ctx, pid, 10*time.Second)
	_ = os.Remove(hostPidPath(dir))
	writeHostStatus(dir, "stopped")
	return Result{ExternalID: name, Status: "stopped"}, nil
}

// Kill force-stops the service with SIGKILL (Stop without the graceful
// SIGTERM window), for hung workloads that ignore the polite signal.
func (d *host) Kill(ctx context.Context, name string) (Result, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return Result{}, err
	}
	_ = ctx
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return Result{ExternalID: name, Status: "stopped"}, nil
	}
	pid, err := readHostPid(dir)
	if err != nil || !pidAlive(pid) {
		_ = os.Remove(hostPidPath(dir))
		writeHostStatus(dir, "stopped")
		return Result{ExternalID: name, Status: "stopped"}, nil
	}
	if proc, err := os.FindProcess(pid); err == nil {
		_ = proc.Signal(syscall.SIGKILL)
	}
	_ = os.Remove(hostPidPath(dir))
	writeHostStatus(dir, "stopped")
	return Result{ExternalID: name, Status: "stopped"}, nil
}

func (d *host) Destroy(ctx context.Context, name string) (Result, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return Result{}, err
	}
	_ = ctx
	if pid, err := readHostPid(dir); err == nil && pidAlive(pid) {
		stopHostPid(ctx, pid, 5*time.Second)
	}
	if err := os.RemoveAll(dir); err != nil {
		return Result{}, fmt.Errorf("host: remove dir: %w", err)
	}
	return Result{ExternalID: name, Status: "destroyed"}, nil
}

// Exec runs a command inside the instance dir on the host. tty=true gets a
// real PTY (terminal WS); tty=false gets plain pipes (one-shot exec-rpc,
// install steps, metrics gathering). The working directory is always the
// instance dir so relative paths resolve against the service root.
func (d *host) Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*ExecSession, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return nil, err
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return nil, fmt.Errorf("host: instance %q not found (deploy it first)", name)
	}
	if len(command) == 0 {
		command = []string{"/bin/sh"}
	}
	cmd := exec.CommandContext(ctx, command[0], command[1:]...)
	cmd.Dir = dir
	if tty {
		size := &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}
		master, err := pty.StartWithSize(cmd, size)
		if err != nil {
			return nil, fmt.Errorf("host exec: %w", err)
		}
		resize := func(c, r int) error {
			if c <= 0 || r <= 0 {
				return nil
			}
			return pty.Setsize(master, &pty.Winsize{Cols: uint16(c), Rows: uint16(r)})
		}
		waitCh := make(chan error, 1)
		go func() { waitCh <- cmd.Wait() }()
		wait := func() (int, error) {
			err := <-waitCh
			if err != nil {
				if ee, ok := err.(*exec.ExitError); ok {
					return ee.ExitCode(), err
				}
				return -1, err
			}
			return 0, nil
		}
		return &ExecSession{
			Stdin: master, Stdout: master, Stderr: master,
			Resize: resize, Wait: wait,
			Close: func() error { return master.Close() },
		}, nil
	}
	stdin, stdout, stderr, err := startPiped(cmd)
	if err != nil {
		return nil, fmt.Errorf("host exec: %w", err)
	}
	waitCh := make(chan error, 1)
	go func() { waitCh <- cmd.Wait() }()
	wait := func() (int, error) {
		err := <-waitCh
		if err != nil {
			if ee, ok := err.(*exec.ExitError); ok {
				return ee.ExitCode(), err
			}
			return -1, err
		}
		return 0, nil
	}
	return &ExecSession{
		Stdin: stdin, Stdout: stdout, Stderr: stderr,
		Resize: func(int, int) error { return nil },
		Wait:   wait, Close: func() error { stdin.Close(); stdout.Close(); stderr.Close(); return nil },
	}, nil
}

// Runner gathers live state for a host instance. Host services share the
// host kernel, so the portable /proc scripts report host-wide numbers —
// the correct ceiling for a non-isolated service. The status field is
// injected from the pid probe so the panel's inspect cache can render
// running/stopped without a second RPC.
func (d *host) Runner(ctx context.Context, name string) (metrics, processes, ports, info string, err error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return "{}", "[]", "[]", "{}", err
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return "{}", "[]", "[]", "{}", fmt.Errorf("host: instance %q not found", name)
	}
	metrics, processes, ports, info, err = gatherViaShell(ctx, name, d)
	if err != nil {
		// Metrics collection failed but the instance exists — surface the
		// status anyway so the panel doesn't read a missing dir as gone.
		status := hostStatus(dir)
		fallback := map[string]any{"status": status, "cpu_pct": 0, "mem_used": 0, "mem_total": 0}
		if b, merr := json.Marshal(fallback); merr == nil {
			metrics = string(b)
		} else {
			metrics = `{"status":"` + status + `"}`
		}
		if processes == "" {
			processes = "[]"
		}
		if ports == "" {
			ports = "[]"
		}
		if info == "" {
			info = "{}"
		}
		return metrics, processes, ports, info, nil
	}
	// Inject status + kind into the metrics blob (best-effort; the gathered
	// blob is already complete so a marshal failure must not fail Runner).
	status := hostStatus(dir)
	var m map[string]any
	if json.Unmarshal([]byte(metrics), &m) == nil && m != nil {
		m["status"] = status
		if b, merr := json.Marshal(m); merr == nil {
			metrics = string(b)
		}
	}
	var inf map[string]any
	if json.Unmarshal([]byte(info), &inf) != nil || inf == nil {
		inf = map[string]any{}
	}
	inf["kind"] = "host"
	inf["dir"] = dir
	if b, merr := json.Marshal(inf); merr == nil {
		info = string(b)
	}
	return metrics, processes, ports, info, nil
}

// UpdatePorts is a no-op for host: services bind host ports directly, so
// there is nothing to reconcile. The panel persists the allocation rows
// for display/collision checks; the edge needs no recreate.
func (d *host) UpdatePorts(_ context.Context, _ string, _ []PortAllocation) error {
	return nil
}

// Snapshot tars the instance dir (excluding the snapshots subdir itself).
// create → snapshots/<snap>.tar.gz; restore → extract over the stopped
// service; delete → remove the tarball. Location overrides the snapshots
// dir when absolute; otherwise it is resolved under the instance dir.
func (d *host) Snapshot(ctx context.Context, name string, action string, snapName string, snapType string, location string) (string, int64, error) {
	dir, err := hostDirFor(name)
	if err != nil {
		return "", 0, err
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return "", 0, fmt.Errorf("host: instance %q not found", name)
	}
	snapDir := filepath.Join(dir, "snapshots")
	if strings.TrimSpace(location) != "" {
		loc := strings.TrimSpace(location)
		if filepath.IsAbs(loc) {
			snapDir = filepath.Clean(loc)
		} else {
			// Relative locations stay jailed under the instance dir so a
			// hostile snapshot request can never address /etc.
			clean := filepath.Clean("/" + loc)
			snapDir = filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(clean, "/")))
		}
	}
	_ = snapType
	switch action {
	case "create":
		if strings.TrimSpace(snapName) == "" {
			return "", 0, fmt.Errorf("snapshot name is required for create action")
		}
		safe := filepath.Base(strings.TrimSpace(snapName))
		if safe == "" || safe == "." || safe == ".." || strings.ContainsRune(safe, '/') {
			return "", 0, fmt.Errorf("invalid snapshot name %q", snapName)
		}
		if !strings.HasSuffix(safe, ".tar.gz") {
			safe += ".tar.gz"
		}
		if err := os.MkdirAll(snapDir, 0o755); err != nil {
			return "", 0, fmt.Errorf("host snapshot: mkdir: %w", err)
		}
		dest := filepath.Join(snapDir, safe)
		if _, err := os.Stat(dest); err == nil {
			return "", 0, fmt.Errorf("snapshot %q already exists", safe)
		}
		// tar --exclude must come before the file operands.
		if _, err := asExec(ctx, dir, "tar", "--exclude=snapshots", "-czf", dest, "."); err != nil {
			return "", 0, fmt.Errorf("host snapshot create failed: %w", err)
		}
		var size int64
		if fi, serr := os.Stat(dest); serr == nil {
			size = fi.Size()
		}
		return dest, size, nil
	case "restore":
		if strings.TrimSpace(snapName) == "" {
			return "", 0, fmt.Errorf("snapshot name is required for restore action")
		}
		safe := filepath.Base(strings.TrimSpace(snapName))
		if !strings.HasSuffix(safe, ".tar.gz") {
			safe += ".tar.gz"
		}
		src := filepath.Join(snapDir, safe)
		if _, err := os.Stat(src); err != nil {
			// Also try the raw name (already-suffixed or absolute under snapDir).
			alt := filepath.Join(snapDir, filepath.Base(snapName))
			if _, aerr := os.Stat(alt); aerr == nil {
				src = alt
			} else {
				return "", 0, fmt.Errorf("snapshot %q not found", snapName)
			}
		}
		// Stop the service before overwriting its tree.
		if pid, perr := readHostPid(dir); perr == nil && pidAlive(pid) {
			stopHostPid(pid, 5*time.Second)
			_ = os.Remove(hostPidPath(dir))
		}
		if _, err := asExec(ctx, dir, "tar", "-xzf", src, "-C", dir); err != nil {
			return "", 0, fmt.Errorf("host snapshot restore failed: %w", err)
		}
		writeHostStatus(dir, "stopped")
		return src, 0, nil
	case "delete":
		if strings.TrimSpace(snapName) == "" {
			return "", 0, fmt.Errorf("snapshot name is required for delete action")
		}
		safe := filepath.Base(strings.TrimSpace(snapName))
		if !strings.HasSuffix(safe, ".tar.gz") {
			safe += ".tar.gz"
		}
		target := filepath.Join(snapDir, safe)
		if _, err := os.Stat(target); err != nil {
			alt := filepath.Join(snapDir, filepath.Base(snapName))
			if _, aerr := os.Stat(alt); aerr == nil {
				target = alt
			} else {
				return "", 0, fmt.Errorf("snapshot %q not found", snapName)
			}
		}
		if err := os.Remove(target); err != nil {
			return "", 0, fmt.Errorf("host snapshot delete failed: %w", err)
		}
		return "", 0, nil
	default:
		return "", 0, fmt.Errorf("invalid snapshot action: %s", action)
	}
}

// hostExecDrain is a tiny helper so future host callers share the
// concurrent stdout/stderr drain pattern without importing execrpc.
var _ = io.Discard
