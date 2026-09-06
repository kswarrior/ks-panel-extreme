//go:build linux

package sysinfo

import (
	"bufio"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

var (
	panelCPUPrevMu    sync.Mutex
	panelCPUPrevTotal uint64
	panelCPUPrevTime  time.Time
)

// readPanelRSS returns the panel process RSS in MB from /proc/self/status.
func readPanelRSS() float64 {
	f, err := os.Open("/proc/self/status")
	if err != nil {
		return 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "VmRSS:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, err := strconv.ParseUint(fields[1], 10, 64)
				if err == nil {
					return float64(kb) / 1024.0
				}
			}
		}
	}
	return 0
}

// readPanelCPUPercent reads the panel process CPU% from /proc/self/stat.
// Returns 0 on first call (no baseline) or on error.
func readPanelCPUPercent() float64 {
	f, err := os.Open("/proc/self/stat")
	if err != nil {
		return 0
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		return 0
	}

	line := sc.Text()
	// Format: pid (comm) state ppid pgrp session tty_nr tpgid flags minflt cminflt majflt cmajflt utime stime cutime cstime priority nice num_threads itrealvalue starttime vsize rss rsslim startcode endcode startstack kstkesp kstkesp signal blocked sigignore sigcatch wchan nswap cnswap exit_signal processor rt_priority policy delayacct_blkio_tick guest_time cguest_time start_data start_brk arg_start arg_end env_start env_end exit_code
	// We need utime (field 14) and stime (field 15) - 1-indexed after comm
	fields := strings.Fields(line)
	if len(fields) < 17 {
		return 0
	}

	// Find the closing parenthesis of comm
	lastParen := strings.LastIndex(line, ")")
	if lastParen == -1 {
		return 0
	}
	// Everything after the comm
	rest := strings.Fields(line[lastParen+1:])
	if len(rest) < 15 {
		return 0
	}

	utime, err1 := strconv.ParseUint(rest[12], 10, 64) // utime is field 14 (0-indexed 12)
	stime, err2 := strconv.ParseUint(rest[13], 10, 64) // stime is field 15 (0-indexed 13)
	if err1 != nil || err2 != nil {
		return 0
	}

	total := utime + stime
	now := time.Now()

	panelCPUPrevMu.Lock()
	defer panelCPUPrevMu.Unlock()

	if panelCPUPrevTotal == 0 || panelCPUPrevTime.IsZero() {
		panelCPUPrevTotal = total
		panelCPUPrevTime = now
		return 0
	}

	if total < panelCPUPrevTotal {
		panelCPUPrevTotal = total
		panelCPUPrevTime = now
		return 0
	}
	dt := total - panelCPUPrevTotal
	elapsed := now.Sub(panelCPUPrevTime).Seconds()
	panelCPUPrevTotal = total
	panelCPUPrevTime = now
	if elapsed <= 0 {
		return 0
	}

	// USER_HZ is 100 on Linux: dt ticks / 100 = cpu-seconds, / elapsed = fraction, *100 = %.
	// Clamp to 100*cores so a tight poll interval can't amplify jitter past the real ceiling.
	if dt > 0 {
		pct := float64(dt) / elapsed
		max := 100.0 * float64(runtime.NumCPU())
		if max < 100 {
			max = 100
		}
		if pct < 0 {
			return 0
		}
		if pct > max {
			return max
		}
		return pct
	}
	return 0
}

// readPlatform fills the Linux-only fields of Host. It also computes
// CPU% against the previous /proc/stat reading — the first call after
// boot returns 0% because there is no baseline.
func readPlatform() Host {
	h := Host{}

	// Identification ---------------------------------------------------------
	if name, err := os.Hostname(); err == nil {
		h.Hostname = strings.TrimSpace(name)
	}
	if uts, ok := uname(); ok {
		h.Kernel = strings.TrimSpace(uts.Release)
		h.Platform = strings.TrimSpace(uts.Sysname) + " " + strings.TrimSpace(uts.Release)
	}
	if h.Platform == "" {
		h.Platform = "Linux"
	}
	h.CPUCores = countCPUThreads()
	h.CPUModel = readCPUModel()
	h.CPUPercent, h.PerCore = sampleCPU()

	// Load averages ----------------------------------------------------------
	if one, five, fifteen, ok := readLoadAvg(); ok {
		h.Load1, h.Load5, h.Load15 = one, five, fifteen
	}

	// RAM + swap -------------------------------------------------------------
	if totalKB, availKB, cachedKB, buffKB, swapTotalKB, swapFreeKB, ok := readMeminfo(); ok {
		h.RAMTotalMB = kbToMB(totalKB)
		usedKB := totalKB - availKB
		if usedKB < 0 {
			usedKB = 0
		}
		h.RAMUsedMB = kbToMB(usedKB)
		h.RAMAvailMB = kbToMB(availKB)
		h.RAMCachedMB = kbToMB(cachedKB)
		h.RAMBuffMB = kbToMB(buffKB)
		if totalKB > 0 {
			h.RAMUsedPct = 100.0 * float64(usedKB) / float64(totalKB)
		}
		if swapTotalKB > 0 {
			h.SwapTotalMB = kbToMB(swapTotalKB)
			swapUsedKB := swapTotalKB - swapFreeKB
			if swapUsedKB < 0 {
				swapUsedKB = 0
			}
			h.SwapUsedMB = kbToMB(swapUsedKB)
			h.SwapUsedPct = 100.0 * float64(swapUsedKB) / float64(swapTotalKB)
		}
	}

	// Disk for panel working directory -------------------------------------
	cwd, _ := os.Getwd()
	if cwd != "" {
		h.DiskPath = cwd
		if total, used, free, ok := statfsGB(cwd); ok {
			h.DiskTotalGB = total
			h.DiskUsedGB = used
			h.DiskFreeGB = free
			if total > 0 {
				h.DiskUsedPct = 100.0 * used / total
			}
		}
	}

	// Mounts + network + uptime --------------------------------------------
	h.Mounts = readMounts(8)
	h.Interfaces = readNICs()
	h.Addrs = readNonLoopbackAddrs()
	if sec, ok := readUptime(); ok {
		h.UptimeSec = int64(sec)
	}

	return h
}

// --- helpers --------------------------------------------------------------

type procUtsname struct {
	Sysname  string
	Release  string
}

func uname() (*procUtsname, bool) {
	var uts syscall.Utsname
	if err := syscall.Uname(&uts); err != nil {
		return nil, false
	}
	return &procUtsname{
		Sysname: int8ToString(uts.Sysname[:]),
		Release: int8ToString(uts.Release[:]),
	}, true
}

func int8ToString(b []int8) string {
	// Convert each non-zero int8 (which is C's signed char in Utsname)
	// to its byte equivalent, stopping at the first NUL.
	out := make([]byte, 0, len(b))
	for _, c := range b {
		if c == 0 {
			break
		}
		out = append(out, byte(c))
	}
	return string(out)
}

// countCPUThreads counts "processor" lines in /proc/cpuinfo — each is one
// logical thread. The dashboard treats this as "cores" because that's what
// most operators read on the label.
func countCPUThreads() int {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return 0
	}
	n := strings.Count(string(data), "\nprocessor\t")
	if strings.HasPrefix(string(data), "processor\t") {
		n++
	}
	if n == 0 {
		// Fallback for kernels separating with spaces ("processor : 0").
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "processor") {
				n++
			}
		}
	}
	return n
}

// readCPUModel returns the first "model name" entry in /proc/cpuinfo.
func readCPUModel() string {
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "model name\t:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "model name\t:"))
		}
	}
	return ""
}

// readLoadAvg parses /proc/loadavg. Format: "load1 load5 load15 running/total last-pid"
func readLoadAvg() (float64, float64, float64, bool) {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0, false
	}
	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		return 0, 0, 0, false
	}
	one, e1 := strconv.ParseFloat(fields[0], 64)
	five, e2 := strconv.ParseFloat(fields[1], 64)
	fifteen, e3 := strconv.ParseFloat(fields[2], 64)
	if e1 != nil || e2 != nil || e3 != nil {
		return 0, 0, 0, false
	}
	return one, five, fifteen, true
}

// readUptime parses /proc/uptime (first field = seconds since boot).
func readUptime() (float64, bool) {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0, false
	}
	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return 0, false
	}
	v, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

// readMeminfo parses the standard /proc/meminfo entries. Returns kB.
func readMeminfo() (totalKB, availKB, cachedKB, buffKB, swapTotalKB, swapFreeKB uint64, ok bool) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if i := strings.IndexByte(line, ':'); i > 0 {
			key := line[:i]
			rest := strings.Fields(strings.TrimSpace(line[i+1:]))
			if len(rest) == 0 {
				continue
			}
			val, err := strconv.ParseUint(rest[0], 10, 64)
			if err != nil {
				continue
			}
			switch key {
			case "MemTotal":
				totalKB = val
			case "MemAvailable":
				availKB = val
			case "Cached":
				cachedKB = val
			case "Buffers":
				buffKB = val
			case "SwapTotal":
				swapTotalKB = val
			case "SwapFree":
				swapFreeKB = val
			}
		}
	}
	ok = totalKB > 0
	return
}

// statfsGB returns total / used / free in GB for the given path.
func statfsGB(path string) (total, used, free float64, ok bool) {
	var s syscall.Statfs_t
	if err := syscall.Statfs(path, &s); err != nil {
		return
	}
	frsize := uint64(s.Frsize)
	if frsize == 0 {
		frsize = uint64(s.Bsize)
	}
	total = float64(s.Blocks*frsize) / 1024.0 / 1024.0 / 1024.0
	free = float64(s.Bavail*frsize) / 1024.0 / 1024.0 / 1024.0
	used = total - free
	if used < 0 {
		used = 0
	}
	ok = total > 0
	return
}

// readMounts returns up to limit filesystem mount points, sorted by total
// size descending, excluding pseudo-fs types that nobody cares about.
func readMounts(limit int) []DiskMount {
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer f.Close()
	out := make([]DiskMount, 0, 32)
	skipFS := map[string]bool{
		"proc": true, "sysfs": true, "devtmpfs": true, "tmpfs": true,
		"devpts": true, "cgroup": true, "cgroup2": true, "pstore": true,
		"mqueue": true, "selinuxfs": true, "securityfs": true,
		"fusectl": true, "fuse.gvfsd-fuse": true, "rpc_pipefs": true,
		"bpf": true, "tracefs": true, "debugfs": true,
	}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 3 {
			continue
		}
		device, path, fstype := fields[0], fields[1], fields[2]
		if skipFS[fstype] || strings.HasPrefix(path, "/sys/") || strings.HasPrefix(path, "/proc/") || strings.HasPrefix(path, "/dev/") {
			continue
		}
		if device == "none" || device == "rootfs" {
			continue
		}
		total, used, free, ok := statfsGB(path)
		if !ok {
			continue
		}
		usedPct := 0.0
		if total > 0 {
			usedPct = 100.0 * used / total
		}
		out = append(out, DiskMount{
			Device: device, Path: path, FSType: fstype,
			TotalGB: total, UsedGB: used, FreeGB: free, UsedPct: usedPct,
		})
	}
	// Largest first.
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].TotalGB > out[i].TotalGB {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

// readNICs scans /proc/net/dev for row counters AND uses the stdlib net
// package to fold in MAC/MTU/IPs so we don't have to parse /sys per-NIC.
// Returns non-loopback interfaces only.
func readNICs() []NetInterface {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	devBytes := readDevBytes()
	out := make([]NetInterface, 0, len(ifaces))
	for _, i := range ifaces {
		if i.Flags&net.FlagLoopback != 0 || i.Flags&net.FlagUp == 0 {
			continue
		}
		addrsList, _ := i.Addrs()
		addrs := make([]string, 0, len(addrsList))
		for _, a := range addrsList {
			s := strings.SplitN(a.String(), "/", 2)[0]
			if s != "" {
				addrs = append(addrs, s)
			}
		}
		out = append(out, NetInterface{
			Name:  i.Name,
			MAC:   i.HardwareAddr.String(),
			MTU:   i.MTU,
			Addrs: addrs,
			Bytes: devRxByIf(devBytes, i.Name),
		})
	}
	return out
}

// readDevBytes reads /proc/net/dev once per readNICs call. Returns nil
// on any error — the NIC is still returned, just with Bytes = 0.
func readDevBytes() map[string]uint64 {
	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return nil
	}
	defer f.Close()
	out := map[string]uint64{}
	sc := bufio.NewScanner(f)
	skipped := 0
	for sc.Scan() {
		skipped++
		if skipped <= 2 {
			continue
		}
		line := sc.Text()
		idx := strings.IndexByte(line, ':')
		if idx <= 0 {
			continue
		}
		name := strings.TrimSpace(line[:idx])
		rest := strings.Fields(line[idx+1:])
		if len(rest) < 1 {
			continue
		}
		v, _ := strconv.ParseUint(rest[0], 10, 64)
		out[name] = v
	}
	return out
}

func devRxByIf(m map[string]uint64, ifn string) uint64 {
	if m == nil {
		return 0
	}
	return m[ifn]
}

// readNonLoopbackAddrs returns sorted unique local IPv4/IPv6 addresses
// that are bound to an interface and NOT loopback / link-local. Used by
// the dashboard so the operator can copy the URL they should hit.
func readNonLoopbackAddrs() []string {
	out := make([]string, 0, 4)
	nifs, err := net.InterfaceAddrs()
	if err != nil {
		return out
	}
	seen := map[string]bool{}
	for _, a := range nifs {
		var ip net.IP
		switch v := a.(type) {
		case *net.IPNet:
			ip = v.IP
		case *net.IPAddr:
			ip = v.IP
		default:
			continue
		}
		if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			continue
		}
		s := ip.String()
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// percentSample scalars ----------------------------------------------------

// cpuStatDelta carries previous /proc/stat totals so we can compute the
// delta-derived percentage on the next call.
type cpuStatDelta struct {
	total uint64
	idle  uint64 // total idle = idle + iowait
}

var (
	cpuPrevMu   sync.Mutex
	cpuPrevTotal uint64
	cpuPrevIdle  uint64
	cpuPrevPer   []cpuStatDelta
)

// sampleCPU returns whole-host % and per-core %. First call: 0 entries.
func sampleCPU() (float64, []float64) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, nil
	}
	defer f.Close()
	sc := bufio.NewScanner(f)

	var totalNow, idleNow uint64
	var perCoreTotal []uint64
	var perCoreIdle []uint64
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "cpu") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		idle, iow, t, ok := parseCPUFields(fields[1:])
		if !ok {
			continue
		}
		totalIdle := idle + iow
		if fields[0] == "cpu" {
			totalNow = t
			idleNow = totalIdle
			continue
		}
		perCoreTotal = append(perCoreTotal, t)
		perCoreIdle = append(perCoreIdle, totalIdle)
	}

	cpuPrevMu.Lock()
	defer cpuPrevMu.Unlock()

	wholePct := computePct(cpuPrevTotal, totalNow, cpuPrevIdle, idleNow)
	cpuPrevTotal = totalNow
	cpuPrevIdle = idleNow

	perCorePct := make([]float64, len(perCoreTotal))
	for i := range perCoreTotal {
		var prevIdleC, prevTotalC uint64
		if i < len(cpuPrevPer) {
			prevTotalC = cpuPrevPer[i].total
			prevIdleC = cpuPrevPer[i].idle
		}
		perCorePct[i] = computePct(prevTotalC, perCoreTotal[i], prevIdleC, perCoreIdle[i])
	}
	cpuPrevPer = make([]cpuStatDelta, len(perCoreTotal))
	for i := range perCoreTotal {
		cpuPrevPer[i] = cpuStatDelta{total: perCoreTotal[i], idle: perCoreIdle[i]}
	}

	return wholePct, perCorePct
}

// parseCPUFields parses ints from the post-"cpu"/"cpuN" prefix. Returns
// idle, iowait, total of all ticks. The first field is user, second nice,
// third system, fourth idle, fifth iowait (if present).
func parseCPUFields(fields []string) (idle, iow, total uint64, ok bool) {
	if len(fields) < 4 {
		return
	}
	var sum uint64
	for _, s := range fields {
		n, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			// Skipping non-numeric (some kernels end with strings here)
			continue
		}
		sum += n
	}
	idle, _ = strconv.ParseUint(fields[3], 10, 64)
	if len(fields) >= 5 {
		iow, _ = strconv.ParseUint(fields[4], 10, 64)
	}
	total = sum
	ok = true
	return
}

// computePct returns the busy % between two total/idle snapshots.
// Returns 0 when there is no movement (first reading or no activity).
func computePct(prevTotal, totalNow, prevIdle, idleNow uint64) float64 {
	dt := totalNow - prevTotal
	di := idleNow - prevIdle
	if dt == 0 {
		return 0
	}
	busy := dt - di
	if busy > dt {
		busy = dt
	}
	return 100.0 * float64(busy) / float64(dt)
}

func kbToMB(kb uint64) float64 {
	return float64(kb) / 1024.0
}
