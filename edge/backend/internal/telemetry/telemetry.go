// Package telemetry collects host-level resource usage so the edge can report
// real numbers in its heartbeat instead of the placeholder constants the
// original demo binary used.
//
// The collectors intentionally stay stdlib-only (no gopsutil dependency) to
// keep the edge binary tiny and dependency-free — important when many edges
// run on small VPSes. Read paths are /proc/* on Linux and we degrade
// gracefully (returning zeros) on unsupported platforms so a dev machine still
// shows a heartbeat.
package telemetry

import (
	"bufio"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Snapshot is the bundle of metrics the heartbeat sender ships to the panel.
// Field names match the JSON the panel's ingest handler expects, including the
// per-metric `hw_*_ok` flags below — they let the card distinguish "idle box"
// (collected a real 0) from "edge gave up reading /proc this tick" (sent a 0
// it knows is fake). The original telemetry shipped zeros on every failure
// mode, which the panel had no way to tell apart from a legitimately empty
// host, so a half-broken edge looked identical to a fully-healthy idle one.
type Snapshot struct {
	RAMUsed    int64   `json:"ram_used"`
	RAMTotal   int64   `json:"ram_total"`
	CPUPercent float64 `json:"cpu_percent"`
	DiskUsed   int64   `json:"disk_used"`
	DiskTotal  int64   `json:"disk_total"`
	UptimeSecs int64   `json:"uptime_secs"`
	// Quality flags — true when the matching collector succeeded for this
	// snapshot. The panel stores them so its card can dim only the metrics
	// that actually failed rather than the whole card.
	HwRAMOK    bool `json:"hw_ram_ok"`
	HwCPUOK    bool `json:"hw_cpu_ok"`
	HwDiskOK   bool `json:"hw_disk_ok"`
	HwUptimeOK bool `json:"hw_uptime_ok"`
	// Drivers reports which workload drivers the edge can actually execute.
	// The panel renders the four known kinds (docker/kvm/multipass/lxd) as a
	// coloured ring on the node card; a driver not installed on the host is
	// reported false so its arc stays grey.
	Drivers    Drivers `json:"drivers"`
	HwDriversOK bool    `json:"hw_drivers_ok"`
}

// Drivers is the per-driver availability map the heartbeat ships. Keys mirror
// the ksedge driver registry ("docker" | "kvm" | "multipass" | "lxd").
type Drivers struct {
	Docker    bool `json:"docker"`
	KVM       bool `json:"kvm"`
	Multipass bool `json:"multipass"`
	LXD       bool `json:"lxd"`
}

// Collect gathers a fresh Snapshot from the host right now. Each collector
// reports whether it actually produced real numbers; on failure the snapshot
// gets a zero for that metric AND the matching `hw_*_ok` flag stays false, so
// the panel never has to guess whether a 0 means "idle" or "broken".
//
// The disk usage reflects the filesystem holding the working directory of the
// ksedge process, which is the same convention Docker / Pterodactyl use for
// the "container volume" metric.
func Collect() Snapshot {
	var s Snapshot
	var ok bool
	s.RAMTotal, s.RAMUsed, ok = meminfo()
	s.HwRAMOK = ok
	s.CPUPercent, ok = cpuPercent()
	s.HwCPUOK = ok
	s.DiskTotal, s.DiskUsed, ok = diskUsage(".")
	s.HwDiskOK = ok
	s.UptimeSecs, ok = uptimeSeconds()
	s.HwUptimeOK = ok
	s.Drivers, ok = detectDrivers()
	s.HwDriversOK = ok
	return s
}

// detectDrivers probes the host for the four workload drivers ksedge supports.
// We use exec.LookPath so a missing tool is simply reported as false — no
// dependency on a shell-out that could hang. KVM additionally checks /dev/kvm
// because a minimal install may have the CLI tools but no usable accelerator.
//
// The returned ok is false only if the host filesystem itself is broken in a
// way exec.LookPath can't tolerate (e.g. PATH unset and a stat returns an
// unexpected error). A box with no drivers installed at all still returns ok
// true — having all four flags as false is a legitimate, reportable state, so
// we shouldn't conflate it with "we couldn't run the probe".
func detectDrivers() (Drivers, bool) {
	return Drivers{
		Docker:    lookPath("docker", "dockerd", "podman"),
		KVM:       hasFile("/dev/kvm") || lookPath("virsh", "qemu-system-x86_64"),
		Multipass: lookPath("multipass"),
		LXD:       lookPath("lxd", "lxc"),
	}, true
}

// lookPath returns true if any of the given binaries is on PATH.
func lookPath(names ...string) bool {
	for _, n := range names {
		if _, err := exec.LookPath(n); err == nil {
			return true
		}
	}
	return false
}

// hasFile reports whether the path exists (used for /dev/kvm).
func hasFile(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// meminfo reads /proc/meminfo (Linux). On non-Linux we return 0/0 and ok=false
// so the panel renders the RAM bar as "no data" rather than an empty bar that
// pretends the box genuinely has zero memory.
func meminfo() (total, used int64, ok bool) {
	if runtime.GOOS != "linux" {
		return 0, 0, false
	}
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, false
	}
	defer f.Close()

	var memTotal, memAvail int64
	scan := bufio.NewScanner(f)
	for scan.Scan() {
		line := scan.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			memTotal = parseKB(line)
		} else if strings.HasPrefix(line, "MemAvailable:") {
			memAvail = parseKB(line)
		}
	}
	if memTotal == 0 {
		return 0, 0, false
	}
	used = memTotal - memAvail
	if used < 0 {
		used = 0
	}
	return memTotal * 1024, used * 1024, true
}

// parseKB extracts the integer kB value out of a "MemTotal:       8042 kB" row.
func parseKB(line string) int64 {
	fields := strings.Fields(line)
	for _, f := range fields[1:] {
		if n, err := strconv.ParseInt(f, 10, 64); err == nil {
			return n
		}
	}
	return 0
}

// prevCPUTimes holds the last sampled aggregate idle+busy jiffies so we can
// compute the delta between heartbeats. A process-wide var is fine because
// collectors are single-threaded by design (one ticker per edge).
var prevCPUTimes struct {
	busy, idle int64
	seen       bool
}

// cpuPercent returns the CPU usage as a 0-100 percentage computed from the
// delta since the previous call. The first call after startup always reports
// 0 with ok=true ("baseline, not broken"), because returning ok=false would
// make a freshly-booted edge briefly render its CPU bar as "no data" even
// though the collector is working fine — the next tick will hold a real value.
func cpuPercent() (float64, bool) {
	if runtime.GOOS != "linux" {
		return 0, false
	}
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, false
	}
	defer f.Close()

	scan := bufio.NewScanner(f)
	if !scan.Scan() {
		return 0, false
	}
	fields := strings.Fields(scan.Text())
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, false
	}
	var vals []int64
	for _, fl := range fields[1:] {
		n, _ := strconv.ParseInt(fl, 10, 64)
		vals = append(vals, n)
	}
	// /proc/stat cpu row: user nice system idle iowait irq softirq steal
	// (guest / guest_nice may follow). idle = idle + iowait; everything
	// else is busy. We must NOT double-count idle as busy, or the
	// reported CPU% skews high (idle jiffies would inflate both sides
	// of the ratio). Sum defensively for shorter rows.
	idle := vals[3]
	if len(vals) > 4 {
		idle += vals[4]
	}
	var busy int64
	// user + nice + system
	for i := 0; i < 3 && i < len(vals); i++ {
		busy += vals[i]
	}
	// irq + softirq + steal (+ guest/guest_nice if present)
	for i := 5; i < len(vals); i++ {
		busy += vals[i]
	}

	if !prevCPUTimes.seen {
		prevCPUTimes.busy = busy
		prevCPUTimes.idle = idle
		prevCPUTimes.seen = true
		return 0, true
	}
	totalDelta := (busy + idle) - (prevCPUTimes.busy + prevCPUTimes.idle)
	idleDelta := idle - prevCPUTimes.idle
	prevCPUTimes.busy = busy
	prevCPUTimes.idle = idle
	if totalDelta <= 0 {
		return 0, true
	}
	pct := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	return pct, true
}

// diskUsage reports total/used bytes for the filesystem containing dir using
// statvfs(2). On platforms without a usable statvfs we return ok=false so the
// panel distinguishes "empty filesystem" from "couldn't stat the partition".
func diskUsage(dir string) (total, used int64, ok bool) {
	var s syscall.Statfs_t
	if err := syscall.Statfs(dir, &s); err != nil {
		return 0, 0, false
	}
	total = int64(s.Blocks) * int64(s.Bsize)
	avail := int64(s.Bavail) * int64(s.Bsize)
	used = total - avail
	if used < 0 {
		used = 0
	}
	return total, used, true
}

// uptimeSeconds returns host uptime via /proc/uptime. A coarse boot-time
// fallback is avoided to keep the helper stdlib-only; if /proc isn't
// available we fall back to seconds-since-process-start as a best effort AND
// set ok=false so the panel knows the number isn't the real host uptime (it
// resets every time the edge daemon restarts, so uptime_pct over a window
// could otherwise look wildly wrong on a dev box).
var bootTime = time.Now()

func uptimeSeconds() (int64, bool) {
	if runtime.GOOS == "linux" {
		f, err := os.Open("/proc/uptime")
		if err == nil {
			defer f.Close()
			scan := bufio.NewScanner(f)
			if scan.Scan() {
				fields := strings.Fields(scan.Text())
				if len(fields) > 0 {
					if secs, err := strconv.ParseFloat(fields[0], 64); err == nil {
						return int64(secs), true
					}
				}
			}
		}
	}
	return int64(time.Since(bootTime).Seconds()), false
}
