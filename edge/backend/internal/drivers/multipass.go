package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/creack/pty"
)

// multipass wraps Canonical's multipass CLI for Ubuntu VM orchestration.
// Cloud-init config is supported via the cloud_init key (path or inline YAML)
// and forwarded to `--cloud-init` as supported.
type multipass struct{}

func newMultipass() Driver { return &multipass{} }

func (d *multipass) Name() string { return "multipass" }

func (d *multipass) Deploy(ctx context.Context, name string, cfg map[string]any) (Result, error) {
	if err := binMissing("multipass"); err != nil {
		return Result{}, err
	}
	image, _ := cfg["image"].(string)
	if image == "" {
		image = "lts"
	}
	args := []string{"launch", image, "--name", name}
	if v := anyToString(cfg["cpus"]); v != "" {
		args = append(args, "--cpus", v)
	}
	if v := anyToString(cfg["memory"]); v != "" {
		args = append(args, "--memory", v)
	}
	if v := anyToString(cfg["disk"]); v != "" {
		args = append(args, "--disk", v)
	}
	if cloud := anyToString(cfg["cloud_init"]); cloud != "" {
		args = append(args, "--cloud-init", cloud)
	}
	if _, err := asExec(ctx, "", "multipass", args...); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

func (d *multipass) Start(ctx context.Context, name string) (Result, error) {
	if err := binMissing("multipass"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "multipass", "start", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

func (d *multipass) Stop(ctx context.Context, name string) (Result, error) {
	if err := binMissing("multipass"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "multipass", "stop", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "stopped"}, nil
}

func (d *multipass) Destroy(ctx context.Context, name string) (Result, error) {
	if err := binMissing("multipass"); err != nil {
		return Result{}, err
	}
	// multipass offers `delete --purge` which both stops and removes the
	// instance + disk image in one shot. Passing --purge avoids leaving a
	// dangling volume that would block migrating resources later.
	if _, err := asExec(ctx, "", "multipass", "delete", "--purge", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "destroyed"}, nil
}

// Exec runs `multipass exec NAME -- /bin/sh` inside the Ubuntu VM. In tty
// mode the local process is wrapped in a creack/pty so resize (SIGWINCH
// via TIOCSWINSZ on the master) flows through to the in-VM shell. In
// non-tty mode we fall back to plain pipes for byte-only streams.
func (d *multipass) Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*ExecSession, error) {
	if err := binMissing("multipass"); err != nil {
		return nil, err
	}
	if len(command) == 0 {
		command = []string{"/bin/sh"}
	}
	args := []string{"exec", name, "--"}
	args = append(args, command...)

	cmd := exec.CommandContext(ctx, "multipass", args...)
	if tty {
		size := &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}
		master, err := pty.StartWithSize(cmd, size)
		if err != nil {
			return nil, fmt.Errorf("multipass exec: %w", err)
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
		return nil, fmt.Errorf("multipass exec: %w", err)
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
		Wait:   wait, Close: func() error { stdin.Close(); return nil },
	}, nil
}

// Runner gathers live metrics/processes/ports inside a multipass VM by
// running the portable /proc shell scripts via `multipass exec`.
func (d *multipass) Runner(ctx context.Context, name string) (metrics, processes, ports, info string, err error) {
	if err := binMissing("multipass"); err != nil {
		return "{}", "[]", "[]", "{}", err
	}
	metrics, processes, ports, info, err = gatherViaShell(ctx, name, d)
	if err != nil {
		return metrics, processes, ports, info, err
	}
	// Override mem_total with multipass's --memory if one is set.
	// multipass info <name> --format json returns {"name":..., "memory": "2G", ...}
	// We parse the JSON and extract the memory field.
	infoOut, err := asExec(ctx, "", "multipass", "info", name, "--format", "json")
	if err == nil {
		var m map[string]any
		if json.Unmarshal([]byte(infoOut), &m) == nil {
			if memVal, ok := m["memory"].(string); ok && memVal != "" {
				var parsed map[string]any
				if json.Unmarshal([]byte(metrics), &parsed) == nil {
					parsed["mem_total"] = parseMultipassMemory(memVal)
					if b, err := json.Marshal(parsed); err == nil {
						metrics = string(b)
					}
				}
			}
		}
	}
	return metrics, processes, ports, info, err
}

// Snapshot creates, restores, or deletes a snapshot of the instance.
// For multipass, we use `multipass snapshot` to create a snapshot of a VM.
// Action is one of "create", "restore", "delete".
func (d *multipass) Snapshot(ctx context.Context, name string, action string, snapName string, snapType string, location string) (string, int64, error) {
	if err := binMissing("multipass"); err != nil {
		return "", 0, err
	}

	switch action {
	case "create":
		// Create a snapshot of the VM
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for create action")
		}

		// Create the snapshot
		_, err := asExec(ctx, "", "multipass", "snapshot", name, snapName)
		if err != nil {
			return "", 0, fmt.Errorf("multipass snapshot failed: %w", err)
		}

		// If requested, export the snapshot to a tar file
		if snapType == "tar" && location != "" {
			return "", 0, fmt.Errorf("tar export not implemented for multipass snapshots")
		}

		// Return the snapshot name as the external reference
		return snapName, 0, nil

	case "restore":
		// Restore from a snapshot
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for restore action")
		}

		// Restore the snapshot
		_, err := asExec(ctx, "", "multipass", "restore", name, snapName)
		if err != nil {
			return "", 0, fmt.Errorf("multipass restore failed: %w", err)
		}

		return "", 0, nil

	case "delete":
		// Delete the snapshot
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for delete action")
		}

		_, err := asExec(ctx, "", "multipass", "delete", "snap", name, snapName)
		if err != nil {
			return "", 0, fmt.Errorf("multipass delete snapshot failed: %w", err)
		}

		return "", 0, nil

	default:
		return "", 0, fmt.Errorf("invalid snapshot action: %s", action)
	}
}

// parseMultipassMemory parses multipass memory format (e.g. "2G", "512M",
// "1024M", "2048") into bytes (int64). Returns 0 on failure.
func parseMultipassMemory(s string) int64 {
	s = strings.TrimSpace(strings.ToUpper(s))
	if s == "" {
		return 0
	}
	mult := int64(1)
	if strings.HasSuffix(s, "G") {
		mult = 1024 * 1024 * 1024
		s = strings.TrimSuffix(s, "G")
	} else if strings.HasSuffix(s, "M") {
		mult = 1024 * 1024
		s = strings.TrimSuffix(s, "M")
	} else if strings.HasSuffix(s, "K") {
		mult = 1024
		s = strings.TrimSuffix(s, "K")
	}
	if v, err := strconv.ParseInt(s, 10, 64); err == nil {
		return v * mult
	}
	return 0
}
