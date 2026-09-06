package drivers

import (
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/creack/pty"
)

// kvm wraps the `virsh` + `virt-install` CLIs. virt-install builds the
// domain at deploy; subsequent lifecycle uses virsh only. If only one of
// the tools is on PATH we surface that in the error message so the
// operator can install the missing CLI.
type kvm struct{}

func newKVM() Driver { return &kvm{} }

func (d *kvm) Name() string { return "kvm" }

func (d *kvm) Deploy(ctx context.Context, name string, cfg map[string]any) (Result, error) {
	if err := binMissing("virt-install"); err != nil {
		return Result{}, err
	}
	args, err := buildKVMDeployArgs(name, cfg)
	if err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "virt-install", args...); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "stopped"}, nil // --noreboot leaves it off
}

// buildKVMDeployArgs turns the merged template spec the panel hands us into
// the `virt-install` argv. It is factored out of Deploy so the alias
// resolution + empty-flag skipping logic the four-driver "template →
// instance" flow depends on is unit-testable without shelling out to
// virt-install.
//
// Field-name aliases:
//
//   - vcpus: top-level "vcpus" (driver-native) OR "cpus" (the shared-spec
//     key the builtin "ubuntu-vm" template + multipass use). The original
//     driver only read "vcpus", so the builtin template silently deployed
//     with vcpus=1 instead of the operator's chosen "cpus": 2. We accept
//     both shapes — driver-native wins when both are set.
//   - disk: top-level "disk_size" (driver-native) OR "disk" (shared-spec).
//     virt-install's `--disk size=N` interprets N as gigabytes; strip a
//     trailing "G"/"g" the operator may have typed (the shared spec uses
//     "20G") so we don't pass `--disk size=20G`, which older libvirt
//     rejects with "could not convert size".
//
// Empty-flag skipping:
//
//   - `--network ""` was previously always emitted, which virt-install
//     rejects when the operator didn't configure a network. We now omit
//     the flag entirely when unset, letting virt-install fall back to its
//     default network (matches `virsh start` semantics).
//   - `--os-variant ""` is replaced with `--os-variant auto` so libosinfo
//     picks a reasonable default when the operator didn't restrict it.
//     The args slice is now built linearly so every<field, value> pair is
//     in one place — the previous "rebuild the whole slice if osv is
//     empty" pattern duplicated every flag, which silently dropped new
//     settings any future operator added.
func buildKVMDeployArgs(name string, cfg map[string]any) ([]string, error) {
	image, _ := cfg["image"].(string)
	if image == "" {
		return nil, fmt.Errorf("kvm: image (install media path or URL) is required")
	}
	ram := anyToString(cfg["memory"]) // MB or expressed string
	if ram == "" {
		ram = "1024"
	}
	// vcpus with a "cpus" alias — the shared spec/builtin "ubuntu-vm"
	// template spells it "cpus" (matching multipass); accept both so the
	// same canned spec deploys via KVM without silent defaults.
	vcpus := anyToString(cfg["vcpus"])
	if vcpus == "" {
		vcpus = anyToString(cfg["cpus"])
	}
	if vcpus == "" {
		vcpus = "1"
	}
	// disk with a "disk" alias — same rationale. virt-install's
	// `--disk size=N` accepts N as a GB magnitude; strip a trailing
	// "G"/"g" so "20G" (the shared spec) doesn't reach virt-install as
	// `--disk size=20G` (which older libvirt's parser rejects).
	disk := anyToString(cfg["disk_size"])
	if disk == "" {
		disk = anyToString(cfg["disk"])
	}
	if disk == "" {
		disk = "20"
	}
	disk = strings.TrimSuffix(strings.TrimSuffix(disk, "G"), "g")

	osv := anyToString(cfg["os_variant"]) // e.g. ubuntu22.04
	args := []string{
		"--name", name,
		"--ram", ram,
		"--vcpus", vcpus,
		"--disk", fmt.Sprintf("size=%s", disk),
		"--cdrom", image, // operator may also pre-stage a volume and switch this
		"--import",   // skip the interactive install wizard
		"--noreboot", // don't auto-start; we'll explicitly `virsh start`
	}
	// virt-install requires --os-variant — fall back to "auto" so
	// libosinfo picks something reasonable when the operator didn't
	// specify. We NEVER pass `--os-variant ""` (the parser rejects it).
	if osv != "" {
		args = append(args, "--os-variant", osv)
	} else {
		args = append(args, "--os-variant", "auto")
	}
	// Only emit --network when the operator provided a value — an empty
	// `--network ""` is invalid syntax virt-install refuses with
	// " network configuration is missing 'NETWORK' or 'BRIDGE'".
	if net := anyToString(cfg["network"]); net != "" {
		args = append(args, "--network", net)
	}
	return args, nil
}

func (d *kvm) Start(ctx context.Context, name string) (Result, error) {
	if err := binMissing("virsh"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "virsh", "start", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "running"}, nil
}

func (d *kvm) Stop(ctx context.Context, name string) (Result, error) {
	if err := binMissing("virsh"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "virsh", "shutdown", name); err != nil {
		if !isAlreadyStoppedErr(err) {
			return Result{}, err
		}
	}
	return Result{ExternalID: name, Status: "stopped"}, nil
}

// Kill force-powers-off a domain (virsh destroy ≈ pulling the plug),
// where Stop asks the guest OS to shut down cleanly first. Idempotent
// like Stop: destroying a domain that isn't running reports stopped.
func (d *kvm) Kill(ctx context.Context, name string) (Result, error) {
	if err := binMissing("virsh"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "virsh", "destroy", name); err != nil {
		if !isAlreadyStoppedErr(err) {
			return Result{}, err
		}
	}
	return Result{ExternalID: name, Status: "stopped"}, nil
}

func (d *kvm) Destroy(ctx context.Context, name string) (Result, error) {
	if err := binMissing("virsh"); err != nil {
		return Result{}, err
	}
	// Undefine + remove storage. The disk management is intentionally
	// conservative – we delete the "vda" volume tied to the domain so a
	// re-deploy with the same name doesn't collide.
	if _, err := asExec(ctx, "", "virsh", "destroy", name); err != nil {
		// Destroy fails if the domain isn't running; that's fine.
	}
	if _, err := asExec(ctx, "", "virsh", "undefine", "--remove-all-storage", name); err != nil {
		return Result{}, err
	}
	return Result{ExternalID: name, Status: "destroyed"}, nil
}

// Exec spawns `virsh console NAME` against the QEMU/KVM domain so the
// operator can log into the guest via the serial console (cloud images
// expose ttyS0 by default). We wrap the local process in a pty so resize
// and ANSI behave identically to a real SSH/console client.
func (d *kvm) Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*ExecSession, error) {
	if err := binMissing("virsh"); err != nil {
		return nil, err
	}
	_ = command

	cmd := exec.CommandContext(ctx, "virsh", "console", name)
	if tty {
		size := &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}
		master, err := pty.StartWithSize(cmd, size)
		if err != nil {
			return nil, fmt.Errorf("virsh console: %w", err)
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
	// stdout/stderr write ends are closed right after Start — otherwise
	// io.ReadAll on sess.Stdout blocks forever waiting on an EOF that
	// only arrives once GC closes the leaked write fds. Mirrors the fix
	// applied to the docker / lxd / multipass non-TTY Exec paths.
	stdin, stdout, stderr, err := startPiped(cmd)
	if err != nil {
		return nil, err
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

// Runner gathers host-visible VM metrics via `virsh`. KVM guests don't expose
// a clean captured-exec path (the serial console is interactive only), so we
// lean on libvirt's own counters instead of running a script inside the
// guest. Processes/ports stay empty — the panel renders "no data" for them.
func (d *kvm) UpdatePorts(ctx context.Context, name string, allocs []PortAllocation) error {
	return nil
}

func (d *kvm) Runner(ctx context.Context, name string) (metrics, processes, ports, info string, err error) {
	if err := binMissing("virsh"); err != nil {
		return "{}", "[]", "[]", "{}", err
	}

	var memUsed, memTotal int64
	if out, err := asExec(ctx, "", "virsh", "dommemstat", "--domain", name); err == nil {
		for _, line := range strings.Split(out, "\n") {
			fs := strings.Fields(line)
			if len(fs) != 2 {
				continue
			}
			v := parseInt(fs[1]) * 1024
			switch fs[0] {
			case "rss":
				memUsed = v
			case "actual":
				memTotal = v
			}
		}
	}
	if memTotal == 0 && memUsed > 0 {
		memTotal = memUsed
	}

	var cpuTime int64
	if out, err := asExec(ctx, "", "virsh", "cpu-stats", "--domain", name); err == nil {
		for _, line := range strings.SplitN(out, "\n", -1) {
			if strings.Contains(line, "Total") {
				fs := strings.Fields(line)
				for _, f := range fs {
					if n := parseInt(f); n > 0 {
						cpuTime = n
						break
					}
				}
			}
		}
	}

	var netIn, netOut int64
	if out, err := asExec(ctx, "", "virsh", "domstats", "--domain", name, "--interface", "--balloon"); err == nil {
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "net.") {
				continue
			}
			fs := strings.SplitN(line, "=", 2)
			if len(fs) != 2 {
				continue
			}
			val := parseInt(strings.TrimSpace(fs[1]))
			switch {
			case strings.HasSuffix(fs[0], ".rx.bytes"):
				netIn += val
			case strings.HasSuffix(fs[0], ".tx.bytes"):
				netOut += val
			}
		}
	}

	status := ""
	if out, err := asExec(ctx, "", "virsh", "domstate", "--domain", name); err == nil {
		status = strings.TrimSpace(out)
	}

	info = fmt.Sprintf(`{"status":%q,"cpu_time_ns":%d}`, status, cpuTime)
	metrics = fmt.Sprintf(`{"cpu_pct":0,"cpu":0,"mem_used":%d,"mem_total":%d,"mem":%d,"disk_used":0,"disk_total":0,"disk":0,"net_in":%d,"net_out":%d,"load1":0,"uptime":0,"status":%q}`,
		memUsed, memTotal, memUsed, netIn, netOut, status)
	return metrics, "[]", "[]", info, nil
}

// Snapshot creates, restores, or deletes a snapshot of the instance.
// For KVM, we use `virsh snapshot-create` to create a snapshot of a domain.
// Action is one of "create", "restore", "delete".
func (d *kvm) Snapshot(ctx context.Context, name string, action string, snapName string, snapType string, location string) (string, int64, error) {
	if err := binMissing("virsh"); err != nil {
		return "", 0, err
	}

	switch action {
	case "create":
		// Create a snapshot of the domain
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for create action")
		}

		// Create the snapshot
		out, err := asExec(ctx, "", "virsh", "snapshot-create-as", "--domain", name, "--name", snapName, "--disk-only", "--atomic")
		if err != nil {
			return "", 0, fmt.Errorf("virsh snapshot-create failed: %w", err)
		}

		// The output contains the snapshot name
		snapshotName := strings.TrimSpace(out)
		if snapshotName == "" {
			return "", 0, fmt.Errorf("virsh snapshot-create returned empty snapshot name")
		}

		// If requested, export the snapshot to a tar file
		if snapType == "tar" && location != "" {
			return "", 0, fmt.Errorf("tar export not implemented for KVM snapshots")
		}

		return snapshotName, 0, nil

	case "restore":
		// Restore from a snapshot
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for restore action")
		}

		// Restore the snapshot
		_, err := asExec(ctx, "", "virsh", "snapshot-revert", "--domain", name, "--snapshotname", snapName, "--running")
		if err != nil {
			return "", 0, fmt.Errorf("virsh snapshot-revert failed: %w", err)
		}

		return "", 0, nil

	case "delete":
		// Delete the snapshot
		if snapName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for delete action")
		}

		_, err := asExec(ctx, "", "virsh", "snapshot-delete", "--domain", name, "--snapshotname", snapName)
		if err != nil {
			return "", 0, fmt.Errorf("virsh snapshot-delete failed: %w", err)
		}

		return "", 0, nil

	default:
		return "", 0, fmt.Errorf("invalid snapshot action: %s", action)
	}
}
