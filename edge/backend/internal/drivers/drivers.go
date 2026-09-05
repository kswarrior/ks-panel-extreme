// Package drivers implements the per-instance lifecycle backends: docker,
// lxd, kvm, multipass. Each driver is a thin shell-out layer – they don't
// reinvent the local CLI; they invoke the real binary on the host (docker,
// lxc, virsh, multipass). The advantage is each driver inherits whatever
// version semantics the local install provides, so an operator can update
// the daemon and ksedge keeps working unchanged.
//
// Every driver implements the same `Driver` interface; ksedge picks one at
// runtime using the kind the panel sent (docker | lxd | kvm | multipass).
package drivers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
)

// Op describes a lifecycle action the panel can request.
type Op string

const (
	OpDeploy  Op = "deploy"
	OpStart   Op = "start"
	OpStop    Op = "stop"
	OpKill    Op = "kill"
	OpDestroy Op = "destroy"
)

// Result is what drivers return after a successful action. ExternalID is the
// real workload identifier (container name, lxc name, virsh domain,
// multipass name) so the panel can reference this exact instance on future
// start/stop/destroy calls. Status is what ksedge believes the workload is
// in right now.
type Result struct {
	ExternalID string
	Status     string
}

// PortAllocation is one host->container binding the panel's PUT
// /api/instances/{id}/ports editor reconciles. The edge receives the full
// desired set and makes the live container match it when it is running.
type PortAllocation struct {
	Host      int    `json:"host"`
	Container int    `json:"container"`
	Protocol  string `json:"protocol"`
	IP        string `json:"ip,omitempty"`
}

// Driver is the contract each backend implements.
type Driver interface {
	// Name returns the kind string the panel uses ("docker", "lxd", …).
	Name() string
	// Deploy creates a new instance and returns the driver-side ID.
	Deploy(ctx context.Context, name string, cfg map[string]any) (Result, error)
	// Start re-launches an existing instance by name.
	Start(ctx context.Context, name string) (Result, error)
	// Stop halts an instance while leaving it on disk.
	Stop(ctx context.Context, name string) (Result, error)
	// Kill force-stops an instance NOW (SIGKILL semantics) while leaving
	// it on disk. It is Stop without the graceful-shutdown grace period,
	// for hung workloads that ignore the polite signal.
	Kill(ctx context.Context, name string) (Result, error)
	// Destroy removes the instance and frees its resources.
	Destroy(ctx context.Context, name string) (Result, error)
	// Exec launches the given command inside the instance and exposes its
	// stdin / stdout / stderr through the returned io.Pipes. Closing Stdin
	// signals EOF to the inner process; readers on Stdout/Stderr see the
	// process output until the command exits.
	//
	// tty is true when the caller wants a real PTY with WinSize (resize is
	// ignorted when tty=false). Cols/Rows are ignored if the driver can't
	// size its stdin pipe.
	Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*ExecSession, error)
// Runner collects read-only live state (metrics, processes, ports, info)
// for the per-instance Processes / Metrics / Ports / Settings pages. Each
// return value is a raw JSON blob; the panel stores it verbatim in the
// instance_live_state cache and the SPA decodes the driver-specific
// fields. A driver that cannot gather a given blob returns its empty
// form ("{}" / "[]") rather than failing the whole call, so a missing
// CLI surfaces as "no metrics yet" rather than a hard error.
//
// Metric blobs SHOULD use these panel-friendly field names so the
// frontend MetricsSnapshot renders without per-driver translations:
//   {"cpu_pct":float,"mem_used":int,"mem_total":int,
//    "disk_used":int,"disk_total":int,
//    "net_in":int,"net_out":int,"load1":float,"uptime":int}
Runner(ctx context.Context, name string) (metrics, processes, ports, info string, err error)
// UpdatePorts reconciles the desired host->container port allocations
// into the live container. For docker it re-creates the container with
// new -p flags when it is running; for stopped / missing containers it
// is a no-op (DB-only path). Drivers that don't support ports (kvm,
// lxd, multipass) return nil without touching the workload.
UpdatePorts(ctx context.Context, name string, allocs []PortAllocation) error
// Snapshot creates, restores, or deletes a snapshot of the instance.
// Action is one of "create", "restore", "delete".
// For "create", SnapName is the name of the snapshot to create.
// For "restore" and "delete", SnapName is the name of the snapshot to restore/delete.
// Type specifies the format (e.g., "zip", "tar", "docker", "lxd").
// Location specifies where to store the snapshot (e.g., "/mc/", "/tmp/snapshots/").
// Returns a reference to the snapshot and its size in bytes.
Snapshot(ctx context.Context, name string, action string, snapName string, snapType string, location string) (string, int64, error)
}

// ExecSession is the live handle to a running `Exec` invocation owned by
// the panel's terminal endpoint. The close hook lets drivers release any
// per-TTY resources (e.g. /dev/pts/N) when the caller severs the WS.
type ExecSession struct {
	Stdin  io.WriteCloser
	Stdout io.ReadCloser
	Stderr io.ReadCloser
	// Resize is optional; nil when the driver is purely stream-based.
	Resize func(cols, rows int) error
	// Wait blocks until the inner process exits and returns its exit code.
	Wait func() (int, error)
	// Close tears down any extra resources held open behind the scene.
	Close func() error
}

// Registry maps kind → Driver. Built once in init() so the lifecycle
// endpoint can look up the right backend without a switch in hot path.
var Registry = map[string]Driver{}

// Register is exposed for unit tests + future plugins.
func Register(d Driver) { Registry[d.Name()] = d }

// asExec runs an external command and returns its combined stdout/stderr as
// a single string. We capture both to make driver errors self-explanatory –
// guff like "name conflicts with one in lxdbr0" would be otherwise lost.
//
// A non-zero exit returns an error whose message includes the exit status
// and the captured output, so the panel API can surface that to the UI
// instead of a generic "edge rejected".
func asExec(ctx context.Context, dir, bin string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	// Capture both streams so an error message has everything in one place.
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s exited %v: %s", bin, err, string(out))
	}
	return string(out), nil
}

// binMissing returns a friendly error when the driver binary isn't
// installed on the host. The lifecycle endpoint maps this to 200-with-error
// body so the panel can show "docker: command not found" verbatim.
func binMissing(bin string) error {
	_, err := exec.LookPath(bin)
	if err == nil {
		return nil
	}
	var pathErr *fs.PathError
	if errors.As(err, &pathErr) || os.IsNotExist(err) {
		return fmt.Errorf("%s: command not installed on edge host", bin)
	}
	return err
}

// init registers the four bundled drivers. They always attempt the local
// CLI; missing CLIs surface as binMissing() errors at call time, not at
// startup, so ksedge bootstraps cleanly on minimal containers.
func init() {
	Register(newDocker())
	Register(newLXD())
	Register(newKVM())
	Register(newMultipass())
}
