package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/creack/pty"
)

// lxd wraps the local `lxc` CLI. We treat the instance name as the panel-
// supplied identifier; on deploy we hand it as an explicit --instance flag
// (newer 5.x lxc) instead of as a positional, since positional semantics
// vary across versions.
type lxd struct{}

func newLXD() Driver { return &lxd{} }

func (d *lxd) Name() string { return "lxd" }

func (d *lxd) Deploy(ctx context.Context, name string, cfg map[string]any) (Result, error) {
	if err := binMissing("lxc"); err != nil {
		return Result{}, err
	}
	args, err := buildLXDDeployArgs(name, cfg)
	if err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "lxc", args...); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

// buildLXDDeployArgs turns the merged template spec the panel hands us into
// the `lxc launch` argv. Factored out so the profile-alias resolution that
// the four-driver "template → instance" flow depends on is unit-testable
// without shelling out to `lxc`.
//
// Profile field-name aliases:
//
//   - "profile" (singular string): the shared-spec / builtin "alpine-lxd"
//     template's spelling for the common single-profile case. The original
//     driver only read "profiles" (the LXD-native array form), so the
//     builtin template's `"profile": "default"` was silently dropped at
//     deploy time and the container came up on the LXD default profile
//     instead of whatever the operator authored.
//   - "profiles" (LXD-native): a JSON array of strings (`["default",
//     "privileged"]`) OR a comma-separated string operator shorthand
//     (`"default,privileged"`). Both shapes forward to a series of
//     repeated `--profile NAME` flags because `lxc launch` is repeatable.
//
// "profile" (singular) wins when both are set since it's the explicit form
// the operator authored; "profiles" only applies when "profile" is empty
// so a hybrid spec (e.g. someone with both keys) doesn't double-apply.
func buildLXDDeployArgs(name string, cfg map[string]any) ([]string, error) {
	image, _ := cfg["image"].(string)
	if image == "" {
		return nil, fmt.Errorf("lxd: image is required (e.g. images:ubuntu/22.04)")
	}
	args := []string{"launch", image, name}
	for _, p := range resolveLXDProfiles(cfg) {
		args = append(args, "--profile", p)
	}
	// `lxc launch -c limits.cpu=2 -c limits.memory=2GB ...`
	for k, v := range asStringMap(cfg["config"]) {
		args = append(args, "-c", fmt.Sprintf("%s=%s", k, v))
	}
	return args, nil
}

// resolveLXDProfiles turns the spec's profile(s) into a clean []string of
// profile names (no leading/trailing whitespace, no empties). Returns nil
// when no profile was authored so the driver falls through to LXD's own
// default profile rather than emitting a bare `--profile ""`.
func resolveLXDProfiles(cfg map[string]any) []string {
	if p := strings.TrimSpace(anyToString(cfg["profile"])); p != "" {
		return []string{p}
	}
	if list := asStringList(cfg["profiles"]); len(list) > 0 {
		out := make([]string, 0, len(list))
		for _, p := range list {
			if p = strings.TrimSpace(p); p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	// String-CSV operator shorthand for a single shared profile e.g.
	// "default,privileged". asStringList returns nil for a plain string,
	// so we hand-split on "," to honour this shape too. The string type
	// assertion guards against a non-string "profiles" value (e.g. an
	// empty `[]any{}`) being coerced by anyToString to "[]" and slipped
	// in as a bogus profile name.
	if s, ok := cfg["profiles"].(string); ok {
		s = strings.TrimSpace(s)
		if s != "" {
			parts := strings.Split(s, ",")
			out := make([]string, 0, len(parts))
			for _, p := range parts {
				if p = strings.TrimSpace(p); p != "" {
					out = append(out, p)
				}
			}
			return out
		}
	}
	return nil
}

func (d *lxd) Start(ctx context.Context, name string) (Result, error) {
	if err := binMissing("lxc"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "lxc", "start", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

func (d *lxd) Stop(ctx context.Context, name string) (Result, error) {
	if err := binMissing("lxc"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "lxc", "stop", name); err != nil {
		if !isAlreadyStoppedErr(err) {
			return Result{}, err
		}
	}
	return Result{ExternalID: name, Status: "stopped"}, nil
}

// Kill force-stops an instance (lxc stop --force, i.e. SIGKILL instead of
// the graceful shutdown Stop requests). Idempotent like Stop.
func (d *lxd) Kill(ctx context.Context, name string) (Result, error) {
	if err := binMissing("lxc"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "lxc", "stop", "--force", name); err != nil {
		if !isAlreadyStoppedErr(err) {
			return Result{}, err
		}
	}
	return Result{ExternalID: name, Status: "stopped"}, nil
}

// isAlreadyStoppedErr reports whether the CLI rejected a stop because the
// workload was already down. The drivers' stop contract is idempotent (see
// docker.Stop): stopping a stopped instance must succeed so a panel Stop /
// restart flow that races a natural exit doesn't surface a bogus 502.
// Matches LXD's "The instance is already stopped" and libvirt's
// "domain is not running" phrasings.
func isAlreadyStoppedErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already stopped") ||
		strings.Contains(msg, "not running")
}

func (d *lxd) Destroy(ctx context.Context, name string) (Result, error) {
	if err := binMissing("lxc"); err != nil {
		return Result{}, err
	}
	// --force so a running instance is shut down before removal.
	if _, err := asExec(ctx, "", "lxc", "delete", "--force", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "destroyed"}, nil
}

// Exec pipes `lxc exec NAME -- /bin/sh` through a real PTY in tty mode so
// the inner container shell behaves like a local terminal (echo, line
// editing, resize via SIGWINCH). `lxc exec` itself already allocates a pty
// and multiplexes stdin/out/err over its own RPC; we still wrap the local
// process with creack/pty because docker desktop-style CLIs sometimes
// disable their built-in pty when the parent stdin/stdout aren't TTYs —
// wrapping it ourselves keeps the contract uniform across drivers.
func (d *lxd) Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*ExecSession, error) {
	if err := binMissing("lxc"); err != nil {
		return nil, err
	}
	if len(command) == 0 {
		command = []string{"/bin/sh"}
	}
	args := []string{"exec", name, "--"}
	args = append(args, command...)

	cmd := exec.CommandContext(ctx, "lxc", args...)
	if tty {
		size := &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}
		master, err := pty.StartWithSize(cmd, size)
		if err != nil {
			return nil, fmt.Errorf("lxc exec: %w", err)
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
	// Non-TTY: plain pipes, routed through startPiped so the parent's
	// stdout/stderr write ends close right after Start — otherwise io.ReadAll
	// on sess.Stdout never sees EOF. See startPiped's contract and docker.go
	// for the identical block + the hang this fixes.
	stdin, stdout, stderr, err := startPiped(cmd)
	if err != nil {
		return nil, fmt.Errorf("lxc exec: %w", err)
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

func (d *lxd) UpdatePorts(ctx context.Context, name string, allocs []PortAllocation) error {
	return nil
}

// Runner gathers live metrics/processes/ports inside an LXD container by
// running the portable /proc shell scripts via `lxc exec`.
func (d *lxd) Runner(ctx context.Context, name string) (metrics, processes, ports, info string, err error) {
	if err := binMissing("lxc"); err != nil {
		return "{}", "[]", "[]", "{}", err
	}
	metrics, processes, ports, info, err = gatherViaShell(ctx, name, d)
	if err != nil {
		return metrics, processes, ports, info, err
	}
	// Override mem_total with LXD's limits.memory if one is set.
	// lxc config get <name> limits.memory returns e.g. "2GB" or "2147483648"
	// (bytes). If unset, returns empty. We parse and inject if present.
	// The config-get failure is deliberately non-fatal: the metrics blob is
	// already complete from gatherViaShell, so a transient CLI error must
	// not flip the whole Runner into an error via the named-return err.
	memLimitStr, ierr := asExec(ctx, "", "lxc", "config", "get", name, "limits.memory")
	if ierr == nil {
		// Only inject when the limit actually parsed to a positive byte
		// count. parseLXDMemory returns 0 for formats it can't read; the
		// previous unconditional assignment used to OVERWRITE the good
		// /proc-derived mem_total with a 0 whenever LXD echoed an
		// unparsed spelling (e.g. "2GiB"), blanking the Metrics page.
		if limit := parseLXDMemory(strings.TrimSpace(memLimitStr)); limit > 0 {
			var m map[string]any
			if json.Unmarshal([]byte(metrics), &m) == nil {
				m["mem_total"] = limit
				if b, err := json.Marshal(m); err == nil {
					metrics = string(b)
				}
			}
		}
	}
	return metrics, processes, ports, info, err
}

// Snapshot creates, restores, or deletes a snapshot of the instance.
// For LXD, we use `lxc snapshot` to create a snapshot of a container.
// Action is one of "create", "restore", "delete".
func (d *lxd) Snapshot(ctx context.Context, name string, action string, snapName string, snapType string, location string) (string, int64, error) {
	if err := binMissing("lxc"); err != nil {
		return "", 0, err
	}

	switch action {
	case "create":
		// Create a snapshot of the container
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for create action")
		}

		// Create the snapshot
		_, err := asExec(ctx, "", "lxc", "snapshot", name, snapName)
		if err != nil {
			return "", 0, fmt.Errorf("lxc snapshot failed: %w", err)
		}

		// If requested, export the snapshot to a tar file. `lxc export`
		// takes at most two positionals (<instance> [target]); a snapshot is
		// addressed as <instance>/<snapshot-name>. The previous three-
		// positional form made the CLI reject the call outright.
		if snapType == "tar" && location != "" {
			tarPath := location + name + "-" + snapName + ".tar"
			_, err := asExec(ctx, "", "lxc", "export", name+"/"+snapName, tarPath)
			if err != nil {
				return "", 0, fmt.Errorf("failed to export snapshot to tar: %w", err)
			}
			// Return the tar file path as the external reference, with its
			// real size so the panel renders actual bytes instead of a
			// placeholder 0 (stat failure stays non-fatal — the snapshot
			// itself is complete).
			var size int64
			if fi, serr := os.Stat(tarPath); serr == nil {
				size = fi.Size()
			}
			return tarPath, size, nil
		}

		// Return the snapshot name as the external reference
		return snapName, 0, nil

	case "restore":
		// Restore from a snapshot
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for restore action")
		}

		// For simplicity, we'll just attempt to restore
		// A full implementation would check if the snapshot exists first
		_, err := asExec(ctx, "", "lxc", "restore", name, snapName)
		if err != nil {
			return "", 0, fmt.Errorf("lxc restore failed: %w", err)
		}

		return "", 0, nil

	case "delete":
		// Delete the snapshot
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for delete action")
		}

		_, err := asExec(ctx, "", "lxc", "delete", fmt.Sprintf("%s/%s", name, snapName))
		if err != nil {
			return "", 0, fmt.Errorf("failed to delete snapshot %s/%s: %w", name, snapName, err)
		}

		return "", 0, nil

	default:
		return "", 0, fmt.Errorf("invalid snapshot action: %s", action)
	}
}

// parseLXDMemory parses LXD's limits.memory format into bytes (int64).
// Accepts the plain byte count ("2147483648"), decimal magnitudes ("1.5GB")
// and every suffix LXD echoes back — SI (KB/MB/GB/TB) and binary
// (KiB/MiB/GiB/TiB; the CLI happily round-trips an operator-typed "2GiB").
// Returns 0 on failure so callers can skip the override rather than inject
// a bogus zero.
func parseLXDMemory(s string) int64 {
	s = strings.TrimSpace(strings.ToUpper(s))
	if s == "" {
		return 0
	}
	mult := int64(1)
	suffixes := []struct {
		suffix string
		mult   int64
	}{
		// Binary suffixes must be tested before their SI prefixes'
		// shorter spellings ("2GIB" ends in both "GIB" and… nothing
		// else, but "TIB"/"PIB"-style ordering keeps the match exact).
		{"KIB", 1 << 10},
		{"MIB", 1 << 20},
		{"GIB", 1 << 30},
		{"TIB", 1 << 40},
		{"KB", 1 << 10},
		{"MB", 1 << 20},
		{"GB", 1 << 30},
		{"TB", 1 << 40},
		{"B", 1},
	}
	for _, suf := range suffixes {
		if strings.HasSuffix(s, suf.suffix) {
			mult = suf.mult
			s = strings.TrimSuffix(s, suf.suffix)
			break
		}
	}
	if v, err := strconv.ParseFloat(s, 64); err == nil {
		return int64(v * float64(mult))
	}
	return 0
}
