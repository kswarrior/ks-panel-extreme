package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/creack/pty"
)

// docker wraps the local `docker` CLI. The instance name we use is the
// panel-supplied instance name verbatim; the container ID docker prints is
// captured and returned as Result.ExternalID for the panel record.
type docker struct{}

func newDocker() Driver { return &docker{} }

func (d *docker) Name() string { return "docker" }

type portMapping struct {
	Host      int    `json:"host"`
	Container int    `json:"container"`
	Protocol  string `json:"protocol"`
}

// asStringMap and asStringList peel apart the untyped config map the panel
// hands us, with safe defaults – nothing here aims to validate deeply,
// since docker itself does that far better.

func (d *docker) Deploy(ctx context.Context, name string, cfg map[string]any) (Result, error) {
	if err := binMissing("docker"); err != nil {
		return Result{}, err
	}
	args := []string{"run", "--name", name}
	for _, p := range asPorts(cfg["ports"]) {
		proto := p.Protocol
		if proto == "" {
			proto = "tcp"
		}
		args = append(args, "-p", fmt.Sprintf("%d:%d/%s", p.Host, p.Container, proto))
	}
	// Bind mounts. The spec accepts `mounts` (panel admin form format) or
	// `volumes` (docker native format); both produce a host:container[:mode]
	// triple. We forward them straight to `-v`, which lets the operator
	// expose a host path the File Manager can later browser through the
	// edge — without it /mc is an anonymous volume invisible from outside.
	for _, mt := range asMounts(cfg["mounts"], cfg["volumes"]) {
		if mt == "" {
			continue
		}
		args = append(args, "-v", mt)
	}
	for k, v := range asStringMap(cfg["env"]) {
		// `docker run -e KEY=VALUE`
		args = append(args, "-e", fmt.Sprintf("%s=%v", k, v))
	}
	for k, v := range asStringMap(cfg["limits"]) {
		// Pass through real `docker run` resource flags. The config keys are
		// expected to be names like "cpus", "memory", "memory-swap" — we
		// camelCase→kebab-case them so the operator can type "memorySwap"
		// in the spec and still land on --memory-swap.
		//
		// We DON'T forward every key verbatim: the shared template spec
		// carries driver-agnostic fields such as `disk` (valid for kvm /
		// multipass) that docker has no portable `docker run` flag for.
		// Forwarding them used to produce two regressions in turn:
		//   1. `docker run --disk 10g …` → "unknown flag: --disk"
		//      (because there is no --disk flag)
		//   2. `docker run --storage-opt size=10g …` →
		//      "Error response from daemon: --storage-opt is supported
		//       only for overlay over xfs with 'pquota' mount option"
		//      (because `--storage-opt size=…` is a `dockerd` / daemon
		//       option, never accepted by `docker run`, and only honoured
		//       on the overlay+xfs+pquota storage driver anyway).
		// dockerLimitFlag now drops these keys outright; if the operator
		// needs a disk cap for the docker backend, configure the host-level
		// docker-storage quota (dockerd --storage-opt size=…) or use the
		// kvm / multipass driver where the spec field IS enforced.
		flag, ok := dockerLimitFlag(k)
		if !ok {
			continue
		}
		val := fmt.Sprintf("%v", v)
		if val == "" {
			continue
		}
		args = append(args, fmt.Sprintf("--%s", flag), val)
	}
	// Labels — `docker run -l KEY=VALUE` (repeatable). The spec's `labels`
	// accepts an array of `{key, value}` objects (the panel admin form
	// shape) or a flat map; both flatten into `--label` args so an
	// operator who picks one shape doesn't have to convert by hand.
	appendLabels(&args, cfg["labels"])
	// Devices — `--device HOST:CONTAINER[:PERMS]`. Same shape tolerance
	// as labels: array of `{host, container}` objects or a flat string
	// map. Lets the operator expose a /dev/dri/renderD128 or audio device
	// to a container without having to bind-mount the whole /dev tree.
	appendDevices(&args, cfg["devices"])
	// Advanced runtime options (advanced.startup_command / stop_command /
	// hostname / user / privileged / readonly_rootfs / dns / extra_hosts /
	// network_mode / shm_size / pids_limit / ulimits). Each is forwarded
	// to its matching `docker run` flag; missing/empty fields are silently
	// skipped so a template that only sets hostname doesn't break deploys
	// that don't set privileged.
	appendAdvancedRuntime(&args, cfg["advanced"])
	image, _ := cfg["image"].(string)
	if image == "" {
		return Result{}, fmt.Errorf("docker: image is required in spec")
	}
	// The deploy RPC is dispatched synchronously from the panel, and the
	// panel sits behind an upstream proxy (Cloudflare / nginx / etc.) which
	// aborts the origin connection after its own response window (~30s on
	// Cloudflare). That window is shorter than a cold `docker pull` of a
	// large registry image, so a blocking pull here makes the proxy return
	// its own HTML "origin timed out / 500" page BEFORE the panel can emit
	// its structured JSON 502 — the SPA then shows an unreadable banner.
	//
	// The fix: keep the deploy RPC fast. We only pull when the image is
	// genuinely absent from the local daemon cache (the operator's normal
	// steady state is "image already pulled"); when it IS present we skip
	// the pull entirely and `docker run -d` detaches immediately, returning
	// the container ID well inside any proxy window. When the image is
	// missing we still pull up front — `docker run`'s own auto-pull would
	// otherwise bury a registry/auth failure inside the run subprocess and
	// we'd lose the clean "image not found" error for the UI. A cold pull
	// that overruns the proxy is a cold-path; warm deploys (the common case
	// the panel is designed around) stay sub-second.
	if !dockerImagePresent(ctx, image) {
		if _, err := asExec(ctx, "", "docker", "pull", image); err != nil {
			return Result{}, fmt.Errorf("docker pull %s: %w", image, err)
		}
	}
	if restart, ok := cfg["restart"].(string); ok {
		args = append(args, "--restart", restart)
	}
	args = append(args, "-d", image)
	if cmd := asStringList(cfg["command"]); len(cmd) > 0 {
		args = append(args, cmd...)
	}
	out, err := asExec(ctx, "", "docker", args...)
	if err != nil {
		return Result{}, err
	}
	// `docker run -d` prints the container ID. Strip whitespace. Because the
	// container starts detached, this returns immediately.
	extID := trim(out)
	// Reflect the container's real state without an artificial sleep. `docker
	// run -d` returns success even when the main process exits right away
	// (docker restarts it under --restart=always while `docker ps` shows
	// "Restarting"), so we inspect immediately to surface the actual state.
	// We deliberately dropped the previous 1.5s `time.After` wait: that
	// sleep added unconditional latency on the hot deploy path and pushed
	// otherwise-fast deploys closer to the upstream proxy timeout, which is
	// the exact failure mode this RPC must avoid.
	status := "running"
	if actual := dockerStatus(ctx, name); actual != "" {
		status = actual
	}
	return Result{ExternalID: extID, Status: status}, nil
}

// dockerImagePresent reports whether the named image is already loaded into
// the local docker daemon's image cache. `docker image inspect` (not `docker
// inspect`, which targets containers) returns 0 only when the image exists
// locally; a non-zero exit (image absent, daemon down) is treated as "not
// present" so the caller falls through to a real pull. The check is cheap
// (a daemon-local map lookup, no registry round-trip) so the deploy RPC stays
// fast on the warm path — the steady state the deploy proxy-timeout fix
// depends on.
func dockerImagePresent(ctx context.Context, image string) bool {
	if image == "" {
		return false
	}
	out, err := asExec(ctx, "", "docker", "image", "inspect", image)
	if err != nil {
		// Include the captured output in the debug log only — a missing
		// image is the expected case here, not an error to surface.
		_ = out
		return false
	}
	return true
}

// dockerStatus returns the named container's current `docker ps`-style
// status string ("running", "restarting", "exited", "dead", "paused", ...),
// or "" when the container doesn't exist (or the daemon isn't reachable).
// Used after Deploy/Start/Stop to keep the panel's reported status in
// sync with what `docker ps` shows.
func dockerStatus(ctx context.Context, name string) string {
	out, err := asExec(ctx, "", "docker", "inspect", name, "--format", "{{.State.Status}}")
	if err != nil {
		return ""
	}
	s := strings.TrimSpace(string(out))
	// `docker inspect --format` is normally a single line, but transitional
	// states can produce multi-line output. Take the first non-empty line.
	for _, ln := range strings.Split(s, "\n") {
		if ln = strings.TrimSpace(ln); ln != "" {
			return ln
		}
	}
	return ""
}

// dockerLimitFlags is the allowlist of `docker run` resource/limit flags the
// operator may set via the spec's `limits` object. Anything not listed here
// is dropped silently — docker has no matching flag. The shared template
// spec carries driver-agnostic fields such as `disk` (valid for kvm /
// multipass) that have no portable docker equivalent; see dockerLimitFlag
// for why we ignore those rather than fabricating a `--disk` or
// `--storage-opt size=…` flag docker only accepts on the overlay+xfs+pquota
// storage driver.
//
// Keys are the JSON-side names BEFORE camelToKebab is applied, so the table
// holds the canonical flag spelling (already kebab-style, since that's what
// docker expects) and we skip the case-folding for these.
var dockerLimitFlags = map[string]string{
	"cpus":               "cpus",
	"cpu-shares":         "cpu-shares",
	"cpu-quota":          "cpu-quota",
	"cpuset-cpus":        "cpuset-cpus",
	"cpuset-mems":        "cpuset-mems",
	"memory":             "memory",
	"memory-swap":        "memory-swap",
	"memory-reservation": "memory-reservation",
	"memory-swappiness":  "memory-swappiness",
	"kernel-memory":      "kernel-memory",
	"oom-score-adj":      "oom-score-adj",
	"pids-limit":         "pids-limit",
	"blkio-weight":       "blkio-weight",
	"shm-size":           "shm-size",
}

// dockerLimitFlag maps a spec `limits` key to the docker run flag it should
// become. It returns ok=false for keys docker doesn't understand so the caller
// can skip them rather than building a flag docker would reject.
//
// `disk`/`disk_size` are driver-agnostic spec fields (valid for kvm /
// multipass). Docker has no portable per-container disk cap: there is no
// `--disk` flag, `--storage-opt size=…` is a `dockerd` (daemon) option not a
// `docker run` option, and on the common overlay2 / ext4 setup it is
// rejected with "supported only for overlay over xfs with pquota mount
// option". Forwarding it as anything other than a no-op would break every
// deploy on default-storage-driver hosts. We therefore drop it silently
// when running on docker and rely on the host-level quota / thin pool
// cap configured on `dockerd` to enforce disk on that backend.
func dockerLimitFlag(k string) (string, bool) {
	// camelToKebab turns "memorySwap" into "memory-swap" etc. It leaves
	// already-kebab and underscored keys alone, so we look up BOTH the
	// kebab-normalised and the raw spelling so an operator can write
	// "cpu-shares" or "cpuShares" and either resolves.
	kebab := camelToKebab(k)
	if flag, ok := dockerLimitFlags[kebab]; ok {
		return flag, true
	}
	if flag, ok := dockerLimitFlags[k]; ok {
		return flag, true
	}
	// Disk sizing has no portable docker run equivalent. Don't invent a
	// flag docker will reject (the historical regression was forwarding
	// `--storage-opt size=…` from this switch, which only works on
	// overlay+xfs+pquota and never on overlay2/ext4 hosts).
	switch kebab {
	case "disk", "disk_size", "disk-size":
		return "", false
	}
	return "", false
}

func (d *docker) Start(ctx context.Context, name string) (Result, error) {
	if err := binMissing("docker"); err != nil {
		return Result{}, err
	}
	if _, err := asExec(ctx, "", "docker", "start", name); err != nil {
		return Result{}, err
	}
	// Verify the container actually came up. Without this, a container
	// whose main process crashes immediately (e.g. bad entrypoint) goes
	// straight back into restart-loop while the panel still claims
	// "running" — operators were chasing "panel says running but docker
	// ps says restarting" mismatches that this check closes.
	status := "running"
	select {
	case <-ctx.Done():
		return Result{}, ctx.Err()
	case <-time.After(1500 * time.Millisecond):
	}
	if actual := dockerStatus(ctx, name); actual != "" {
		status = actual
	}
	return Result{ExternalID: name, Status: status}, nil
}

func (d *docker) Stop(ctx context.Context, name string) (Result, error) {
	if err := binMissing("docker"); err != nil {
		return Result{}, err
	}
	// If the container isn't running (or doesn't exist), treat stop as a
	// no-op — returning success so the panel doesn't show a 502 for an
	// already-stopped instance.
	status := dockerStatus(ctx, name)
	if status == "" || status != "running" {
		// Container doesn't exist or isn't running — treat as stopped.
		_, _ = asExec(ctx, "", "docker", "update", "--restart=no", name)
		return Result{ExternalID: name, Status: "stopped"}, nil
	}
	if _, err := asExec(ctx, "", "docker", "stop", name); err != nil {
		return Result{}, err
	}
	// Clear --restart so docker doesn't immediately bounce the container
	// back. Without this, an operator who clicked Stop in the panel
	// watched `docker ps` flip from "Up" to "Restarting" within a second
	// — docker honors --restart=always the moment the container stops
	// and re-spawns it. We deliberately drop the restart policy here;
	// the next Deploy re-applies whatever the template's spec says.
	if _, err := asExec(ctx, "", "docker", "update", "--restart=no", name); err != nil {
		// Don't fail the whole stop on a failed update — the container is
		// already stopped; the operator just needs to know it didn't stick.
		log.Printf("docker stop: failed to clear restart policy on %s: %v", name, err)
	}
	return Result{ExternalID: name, Status: "stopped"}, nil
}

// isAlreadyGoneErr reports whether docker rejected the call because the
// container doesn't exist ("No such container: x" on classic endpoints,
// "Error: No such object: x" on newer ones). Destroy's contract mirrors
// Stop's idempotency: destroying an already-destroyed instance must succeed
// so a panel destroy flow that races a manual `docker rm` doesn't surface a
// bogus failure for an end-state the operator asked for.
func isAlreadyGoneErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "no such container") ||
		strings.Contains(msg, "no such object")
}

func (d *docker) Destroy(ctx context.Context, name string) (Result, error) {
	if err := binMissing("docker"); err != nil {
		return Result{}, err
	}
	// Use `docker rm -f` so a stopped container cleans up too. A failed rm
	// of an absent container is non-fatal – treat it as already-gone.
	if _, err := asExec(ctx, "", "docker", "rm", "-f", name); err != nil {
		if !isAlreadyGoneErr(err) {
			return Result{}, err
		}
	}
	return Result{ExternalID: name, Status: "destroyed"}, nil
}

// Exec runs `docker exec -it NAME /bin/sh` against the container and
// bridges the inner shell to the panel's WebSocket.
//
// The bridge is a real pseudo-terminal: creack/pty's StartWithSize allocates
// a /dev/pts/* master/slave pair, attaches the slave to docker's stdin,
// stdout AND stderr (so the inner process sees a TTY and toggles echo +
// line-by-line reads), and hands us back the master that we feed bytes to /
// drain bytes from. That mirrors exactly what `docker exec -it` does when
// you run it from your own terminal, so resize and ANSI output behave
// identically to a local SSH session.
//
// When tty=false we fall back to plain os.Pipe, which is what a "logs"
// viewer would want: bytes only, no echo, no resize.
func (d *docker) Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*ExecSession, error) {
	if err := binMissing("docker"); err != nil {
		return nil, err
	}
	if len(command) == 0 {
		// Default to a login shell. /bin/sh works on alpine and distroless;
		// bash users get an interactive shell by passing ["bash"] from the
		// browser in a follow-up revision.
		command = []string{"/bin/sh"}
	}

	// Common argument list. We do NOT pass `--sig-proxy=false` here even
	// though Engine 20.10+ honours it on interactive exec sessions: it is
	// a host-side ergonomic flag (stops a doubled host Ctrl-C from being
	// forwarded into the container's foreground command), and probed-
	// version "supports it" verdicts have repeatedly disagreed with the
	// real daemon on operator hosts — `docker exec --sig-proxy=false …`
	// then fails with `unknown flag: --sig-proxy` (exit 125), which
	// outright bricked the post-deploy install workflow because every
	// step's exec bailed before running a single byte of the script. The
	// terminal page still works without it (an operator who double-taps
	// Ctrl-C gets the historical behaviour of forwarding the second
	// SIGINT); the install workflow is the load-bearing case, so we
	// removed the flag rather than fighting the probe. Reintroduce ONLY
	// behind a truly reliable runtime check (e.g. `docker exec --help |
	// grep -- --sig-proxy` once, cached) — never a version-string guess.
	//
	// We ALWAYS pass `-i`: it keeps `docker`'s host-side stdin attached
	// and forwarding bytes from the panel bridge into the container's
	// stdin. Without `-i`, `docker exec -t NAME /bin/sh` allocates the
	// container TTY but never wires the host stdin pipe — the inner
	// shell gets EOF the instant whatever quick banner sh printed
	// finishes and exits, the edge sends `{"type":"exit"}`, the panel's
	// pump tears the WS down, and the browser spins an exponential
	// "reconnecting in 1s/2s/4s" loop forever. `pty.StartWithSize` only
	// attaches cmd.Stdin to the PTY slave on OUR side; whether docker
	// forwarded that into the container is governed entirely by `-i`,
	// so the two flags are independent and both must be present for an
	// interactive bridge. The non-TTY logs path needs `-i` too, or its
	// read loop returns EOF on the very first read.
	args := []string{"exec", "-i"}
	if tty {
		args = append(args, "-t")
	}
	args = append(args, name)
	args = append(args, command...)

	cmd := exec.CommandContext(ctx, "docker", args...)

	if tty {
		// pty.StartWithSize returns a single *os.File master that is both
		// readable and writable; stdin/stdout/stderr of cmd are wired to
		// the slave, and a PTY-size ioctl sets the initial rows/cols so the
		// first prompt renders at the right geometry. We do NOT pass `-i`
		// here because creack/pty already owns the stdin end of the slave
		// device; docker routes its inherited stdin through to the inner
		// process so stdin bytes the browser sends come back as the shell's
		// echoed input.
		size := &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}
		master, err := pty.StartWithSize(cmd, size)
		if err != nil {
			return nil, fmt.Errorf("docker exec: %w", err)
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
			Stdin:  master,
			Stdout: master,
			Stderr: master,
			Resize: resize,
			Wait:   wait,
			Close:  func() error { return master.Close() },
		}, nil
	}

	// Non-TTY: plain pipes. The inner process sees a pipe and switches off
	// echo + canonical mode, which is what a "logs"/"exec" viewer wants.
	// We route through startPiped (not the legacy newPipe* helpers) so the
	// parent's stdout/stderr write ends are closed right after Start —
	// otherwise io.ReadAll on sess.Stdout blocks forever waiting on an EOF
	// that only arrives once GC closes the leaked write fds. See
	// startPiped for the full contract.
	stdin, stdout, stderr, err := startPiped(cmd)
	if err != nil {
		return nil, fmt.Errorf("docker exec: %w", err)
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

// Runner gathers live metrics/processes/ports for the docker-driven instance
// by running a portable shell script inside the container through Exec. This
// avoids depending on `docker stats`/`docker top` formatting (which differ
// across CLI versions and break for distroless images) while still reading
// the real /proc of the container's Linux namespace.
//
// IMPORTANT: the in-container script reads /proc/meminfo which is NOT cgroup-
// isolated — it reports the HOST's MemTotal. A container started with
// `--memory 1024M` will therefore surface the host's RAM (e.g. 2.2 GB) as
// mem_total in the script output. The panel's Metrics page would then show
// "2.2 GB / 2.2 GB used" even though the OOM cap is enforced at 1 GB.
// To fix this, after gathering the in-container metrics we run `docker inspect`
// to read the ACTUAL --memory limit from HostConfig.Memory (0 = unlimited)
// and override mem_total in the returned JSON if a limit is set. This keeps
// the script portable (works on lxd/multipass too) while giving docker the
// correct cap.
func (d *docker) Runner(ctx context.Context, name string) (metrics, processes, ports, info string, err error) {
	if err := binMissing("docker"); err != nil {
		return "{}", "[]", "[]", "{}", err
	}
	metrics, processes, ports, info, err = gatherViaShell(ctx, name, d)
	if err != nil {
		return metrics, processes, ports, info, err
	}
	// Override mem_total with docker's --memory limit if one is set.
	// docker inspect --format '{{.HostConfig.Memory}}' returns bytes as a
	// Go integer (0 = no limit). We parse it and if > 0, inject it into
	// the metrics JSON so the panel sees the container's actual cap.
	//
	// The inspect failures are deliberately non-fatal: the metrics blob is
	// already complete from gatherViaShell, so a transient inspect error
	// must not flip the whole Runner into an error (the named-return err
	// would leak into the final return otherwise).
	memLimitStr, ierr := asExec(ctx, "", "docker", "inspect", name, "--format", "{{.HostConfig.Memory}}")
	if ierr == nil {
		memLimitStr = strings.TrimSpace(memLimitStr)
		if memLimitStr != "" && memLimitStr != "0" {
			// Extract digits in case the output includes unexpected characters (e.g., units)
			var digits strings.Builder
			for _, r := range memLimitStr {
				if r >= '0' && r <= '9' {
					digits.WriteRune(r)
				}
			}
			digitStr := digits.String()
			if digitStr != "" {
				if memLimitBytes, err := strconv.ParseInt(digitStr, 10, 64); err == nil {
					var m map[string]any
					if json.Unmarshal([]byte(metrics), &m) == nil {
						m["mem_total"] = memLimitBytes
						if b, err := json.Marshal(m); err == nil {
							metrics = string(b)
						}
					}
				}
			}
		}
	}
	// Override disk_used with container's writable layer size (SizeRw).
	// This shows how much the container has actually written to its writable
	// layer, rather than the host filesystem usage seen by df inside the
	// container (which is misleading for storage drivers like overlay2).
	diskUsedStr, ierr := asExec(ctx, "", "docker", "inspect", name, "--format", "{{.SizeRw}}")
	if ierr == nil {
		diskUsedStr = strings.TrimSpace(diskUsedStr)
		if diskUsedStr != "" && diskUsedStr != "<nil>" {
			// Extract digits in case the output includes unexpected characters (e.g., units)
			var digits strings.Builder
			for _, r := range diskUsedStr {
				if r >= '0' && r <= '9' {
					digits.WriteRune(r)
				}
			}
			digitStr := digits.String()
			if digitStr != "" {
				if diskUsedBytes, err := strconv.ParseInt(digitStr, 10, 64); err == nil {
					var m map[string]any
					if json.Unmarshal([]byte(metrics), &m) == nil {
						m["disk_used"] = diskUsedBytes
						if b, err := json.Marshal(m); err == nil {
							metrics = string(b)
						}
					}
				}
			}
		}
	}
	return metrics, processes, ports, info, err
}

// Snapshot creates, restores, or deletes a snapshot of the instance.
// For docker, we use `docker commit` to create an image from a container,
// and optionally save it to a tar file.
// Action is one of "create", "restore", "delete".
// Type specifies the format (e.g., "zip", "tar", "docker", "lxd").
// Location specifies where to store the snapshot (e.g., "/mc/", "/tmp/snapshots/").
func (d *docker) Snapshot(ctx context.Context, name string, action string, snapName string, snapType string, location string) (string, int64, error) {
	if err := binMissing("docker"); err != nil {
		return "", 0, err
	}

	switch action {
	case "create":
		// Create a snapshot by committing the container to an image
		imageName := snapName
		if imageName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for create action")
		}

		// Commit the container to an image
		out, err := asExec(ctx, "", "docker", "commit", name, imageName)
		if err != nil {
			return "", 0, fmt.Errorf("docker commit failed: %w", err)
		}

		// Get the image ID
		imageID := strings.TrimSpace(out)
		if imageID == "" {
			return "", 0, fmt.Errorf("docker commit returned empty image ID")
		}

		// If requested, save the image to a tar file
		if snapType == "tar" && location != "" {
			tarPath := location + imageName + ".tar"
			if _, err := asExec(ctx, "", "docker", "save", "-o", tarPath, imageName); err != nil {
				return "", 0, fmt.Errorf("failed to save image to tar: %w", err)
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

		// For now, we'll just return the image ID as the external reference
		// In a full implementation, we might save the image to a tar file
		// and return the file path or checksum
		return imageID, 0, nil

	case "restore":
		// Restore from a snapshot by creating a container from the image
		imageName := snapName
		if imageName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for restore action")
		}

		// Check if the image exists
		if !dockerImagePresent(ctx, imageName) {
			return "", 0, fmt.Errorf("image %s not found", imageName)
		}

		// Restoring in place would mean stopping + removing the current
		// container and re-running it from the committed image — but this
		// RPC carries no deploy spec (ports/env/mounts/command), so a
		// recreated container would silently lose its configuration.
		// Failing loudly beats faking success: the operator should use the
		// panel's destroy + re-deploy flow pointed at the snapshot image.
		return "", 0, fmt.Errorf(
			"in-place restore is not supported for docker snapshots (image %q is available; destroy and redeploy from it)", imageName)

	case "delete":
		// Delete the snapshot by removing the image
		imageName := snapName
		if imageName == "" {
			return "", 0, fmt.Errorf("snapshot name is required for delete action")
		}

		// Remove the image
		_, err := asExec(ctx, "", "docker", "rmi", imageName)
		if err != nil {
			return "", 0, fmt.Errorf("failed to remove image %s: %w", imageName, err)
		}

		return "", 0, nil

	default:
		return "", 0, fmt.Errorf("invalid snapshot action: %s", action)
	}
}

// appendLabels flattens the spec's `labels` value into a series of
// `docker run -l KEY=VALUE` arguments. Accepts three shapes because the
// spec flows through three layers:
//
//   - panel admin form: [{"key":"...","value":"..."}, ...]
//   - flat string→string map: {"key": "value", ...}
//   - flat string→any map: {"key": value, ...} (coerced via anyToString)
//
// Each label becomes its own -l flag because docker run doesn't accept a
// comma-joined label list.
func appendLabels(args *[]string, raw any) {
	switch v := raw.(type) {
	case []any:
		for _, it := range v {
			m, ok := it.(map[string]any)
			if !ok {
				continue
			}
			k := anyToString(m["key"])
			if k == "" {
				continue
			}
			val := anyToString(m["value"])
			*args = append(*args, "-l", k+"="+val)
		}
	case map[string]string:
		for k, val := range v {
			if k == "" {
				continue
			}
			*args = append(*args, "-l", k+"="+val)
		}
	case map[string]any:
		for k, val := range v {
			if k == "" {
				continue
			}
			*args = append(*args, "-l", k+"="+anyToString(val))
		}
	}
}

// appendDevices flattens the spec's `devices` value into
// `docker run --device HOST:CONTAINER[:PERMS]` arguments. Accepts the
// same shape trio as labels (panel form array / flat map) so an operator
// doesn't have to convert between them.
func appendDevices(args *[]string, raw any) {
	switch v := raw.(type) {
	case []any:
		for _, it := range v {
			m, ok := it.(map[string]any)
			if !ok {
				continue
			}
			h := anyToString(m["host"])
			c := anyToString(m["container"])
			if h == "" || c == "" {
				continue
			}
			// cgroup-only flag is a separate docker flag, not part of the
			// bind spec — see cgroup handling below.
			*args = append(*args, "--device", h+":"+c)
			if cg, _ := m["cgroup"].(bool); cg {
				*args = append(*args, "--device-cgroup-rule", "c "+anyToString(m["host"])+" rwm")
			}
		}
	case map[string]any:
		for k, val := range v {
			h, c := "", ""
			switch vv := val.(type) {
			case string:
				// "host:container[:perms]"
				parts := strings.SplitN(vv, ":", 2)
				if len(parts) == 2 {
					h, c = parts[0], parts[1]
				}
			case map[string]any:
				h, c = anyToString(vv["host"]), anyToString(vv["container"])
			}
			if k != "" && h != "" && c == "" {
				// map key as the bind spec.
				h, c = k, ""
				parts := strings.SplitN(k, ":", 2)
				if len(parts) == 2 {
					h, c = parts[0], parts[1]
				}
			}
			if h == "" || c == "" {
				continue
			}
			*args = append(*args, "--device", h+":"+c)
		}
	}
}

// appendAdvancedRuntime pulls each advanced.* setting out of the spec and
// turns it into the matching `docker run` flag. Empty / zero / unset
// values are silently skipped so a template that only sets hostname
// doesn't add `--user ""` or `--pids-limit 0` to the command line.
//
// The advanced struct is opaque JSON (map[string]any); we type-assert
// each field with comma-ok so a template that defines only some of the
// advanced fields still deploys cleanly.
func appendAdvancedRuntime(args *[]string, raw any) {
	adv, ok := raw.(map[string]any)
	if !ok {
		return
	}
	// Each entry below mirrors a `docker run` flag. See docker docs:
	// https://docs.docker.com/engine/reference/run/
	if s, _ := adv["working_dir"].(string); s != "" {
		*args = append(*args, "-w", s)
	}
	if s, _ := adv["user"].(string); s != "" {
		*args = append(*args, "-u", s)
	}
	if s, _ := adv["hostname"].(string); s != "" {
		*args = append(*args, "-h", s)
	}
	if b, _ := adv["privileged"].(bool); b {
		*args = append(*args, "--privileged")
	}
	if b, _ := adv["readonly_rootfs"].(bool); b {
		*args = append(*args, "--read-only")
	}
	// DNS — repeatable `--dns HOST`. Accepts comma-separated string or
	// JSON array of strings.
	for _, d := range asStringList(adv["dns"]) {
		*args = append(*args, "--dns", d)
	}
	if s, _ := adv["dns"].(string); s != "" {
		for _, d := range strings.Split(s, ",") {
			if d = strings.TrimSpace(d); d != "" {
				*args = append(*args, "--dns", d)
			}
		}
	}
	// extra_hosts — `docker run --add-host HOST:IP`. Accepts newline-
	// separated "HOST:IP" strings (the template form's textarea format)
	// or a JSON array of strings.
	for _, h := range asStringList(adv["extra_hosts"]) {
		if strings.Contains(h, ":") {
			*args = append(*args, "--add-host", h)
		}
	}
	if s, _ := adv["extra_hosts"].(string); s != "" {
		for _, h := range strings.Split(s, "\n") {
			if h = strings.TrimSpace(h); h != "" && strings.Contains(h, ":") {
				*args = append(*args, "--add-host", h)
			}
		}
	}
	if s, _ := adv["network_mode"].(string); s != "" {
		*args = append(*args, "--network", s)
	}
	if s, _ := adv["shm_size"].(string); s != "" {
		*args = append(*args, "--shm-size", s)
	}
	if n, ok := adv["pids_limit"].(float64); ok && n > 0 {
		*args = append(*args, "--pids-limit", fmt.Sprintf("%d", int64(n)))
	}
	if s, _ := adv["pids_limit"].(string); s != "" {
		*args = append(*args, "--pids-limit", s)
	}
	// Ulimits — `--ulimit NAME=SOFT[:HARD]`. The template form exposes
	// `nofiles` and `nproc`; docker understands both.
	if ul, ok := adv["ulimits"].(map[string]any); ok {
		for k, val := range ul {
			if s := anyToString(val); s != "" {
				*args = append(*args, "--ulimit", k+"="+s)
			}
		}
	}
}
