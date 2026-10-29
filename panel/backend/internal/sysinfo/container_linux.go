//go:build linux

package sysinfo

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	containerCPUPrevMu    sync.Mutex
	containerCPUPrevUsage float64
	containerCPUPrevTime  time.Time
	cgroupRoot            = "/sys/fs/cgroup"
)

func applyContainer(h *Host) {
	inContainer, runtime := detectContainer()
	if !inContainer {
		return
	}
	h.InContainer = true
	h.ContainerRuntime = runtime

	if fileExists(cgroupPath("cgroup.controllers")) {
		base := cgroupV2Base()
		limit := parseCPUMax(readText(filepath.Join(base, "cpu.max")))
		usageSec := readCPUStatUsage(filepath.Join(base, "cpu.stat"))
		h.ContainerCPULimitCores = limit
		h.ContainerCPUPercent = containerCPUPercent(usageSec, limit, h.CPUCores)

		usedBytes, _ := readUintFile(filepath.Join(base, "memory.current"))
		limitBytes := readByteLimit(filepath.Join(base, "memory.max"))
		setContainerMemory(h, usedBytes, limitBytes)
		return
	}

	usageSec := readCPUAcctUsage(
		cgroupPath("cpuacct", "cpuacct.usage"),
		cgroupPath("cpu,cpuacct", "cpuacct.usage"),
		cgroupPath("cpu", "cpuacct.usage"),
	)
	limit := readV1CPULimit()
	h.ContainerCPULimitCores = limit
	h.ContainerCPUPercent = containerCPUPercent(usageSec, limit, h.CPUCores)

	usedBytes, _ := readUintFile(cgroupPath("memory", "memory.usage_in_bytes"))
	limitBytes := readByteLimit(cgroupPath("memory", "memory.limit_in_bytes"))
	setContainerMemory(h, usedBytes, limitBytes)
}

func detectContainer() (bool, string) {
	if strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST")) != "" {
		return true, "kubernetes"
	}
	if fileExists("/.dockerenv") {
		return true, "docker"
	}
	if fileExists("/run/.containerenv") {
		return true, "podman"
	}
	if v := strings.TrimSpace(os.Getenv("container")); v != "" {
		return true, v
	}
	for _, path := range []string{"/proc/1/cgroup", "/proc/self/cgroup"} {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		text := strings.ToLower(string(data))
		switch {
		case strings.Contains(text, "kubepods") || strings.Contains(text, "containerd"):
			return true, "kubernetes"
		case strings.Contains(text, "docker"):
			return true, "docker"
		case strings.Contains(text, "libpod"):
			return true, "podman"
		case strings.Contains(text, "lxc"):
			return true, "lxc"
		}
	}
	return false, ""
}

func cgroupV2Base() string {
	data, err := os.ReadFile("/proc/self/cgroup")
	if err != nil {
		return cgroupRoot
	}
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.HasPrefix(line, "0::") {
			continue
		}
		rel := strings.TrimPrefix(line, "0::")
		if rel == "" || rel == "/" {
			continue
		}
		candidate := filepath.Join(cgroupRoot, strings.TrimPrefix(rel, "/"))
		if fileExists(filepath.Join(candidate, "cpu.stat")) ||
			fileExists(filepath.Join(candidate, "memory.current")) {
			return candidate
		}
	}
	return cgroupRoot
}

func readCPUStatUsage(path string) float64 {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != "usage_usec" {
			continue
		}
		usec, err := strconv.ParseFloat(fields[1], 64)
		if err != nil {
			return 0
		}
		return usec / 1e6
	}
	return 0
}

func readCPUAcctUsage(paths ...string) float64 {
	for _, path := range paths {
		ns, ok := readUintFile(path)
		if ok {
			return float64(ns) / 1e9
		}
	}
	return 0
}

func parseCPUMax(raw string) float64 {
	fields := strings.Fields(raw)
	if len(fields) < 2 || fields[0] == "max" {
		return 0
	}
	quota, err1 := strconv.ParseFloat(fields[0], 64)
	period, err2 := strconv.ParseFloat(fields[1], 64)
	if err1 != nil || err2 != nil || quota <= 0 || period <= 0 {
		return 0
	}
	return quota / period
}

func readV1CPULimit() float64 {
	quotaRaw := readText(firstExisting(
		cgroupPath("cpu", "cpu.cfs_quota_us"),
		cgroupPath("cpu,cpuacct", "cpu.cfs_quota_us"),
	))
	periodRaw := readText(firstExisting(
		cgroupPath("cpu", "cpu.cfs_period_us"),
		cgroupPath("cpu,cpuacct", "cpu.cfs_period_us"),
	))
	quota, err1 := strconv.ParseFloat(strings.TrimSpace(quotaRaw), 64)
	period, err2 := strconv.ParseFloat(strings.TrimSpace(periodRaw), 64)
	if err1 != nil || err2 != nil || quota <= 0 || period <= 0 {
		return 0
	}
	return quota / period
}

func containerCPUPercent(usageSec, limitCores float64, hostCores int) float64 {
	now := time.Now()

	containerCPUPrevMu.Lock()
	defer containerCPUPrevMu.Unlock()

	if containerCPUPrevTime.IsZero() || usageSec < containerCPUPrevUsage {
		containerCPUPrevUsage = usageSec
		containerCPUPrevTime = now
		return 0
	}
	deltaSec := usageSec - containerCPUPrevUsage
	elapsed := now.Sub(containerCPUPrevTime).Seconds()
	containerCPUPrevUsage = usageSec
	containerCPUPrevTime = now
	if elapsed <= 0 || deltaSec <= 0 {
		return 0
	}

	denom := limitCores
	if denom <= 0 {
		denom = float64(hostCores)
	}
	if denom < 1 {
		denom = 1
	}
	pct := 100.0 * (deltaSec / elapsed) / denom
	if pct < 0 {
		return 0
	}
	if pct > 100 {
		return 100
	}
	return pct
}

func setContainerMemory(h *Host, usedBytes, limitBytes uint64) {
	if usedBytes == 0 {
		return
	}
	h.ContainerRAMUsedMB = float64(usedBytes) / 1024.0 / 1024.0
	if limitBytes > 0 {
		h.ContainerRAMLimitMB = float64(limitBytes) / 1024.0 / 1024.0
		pct := 100.0 * float64(usedBytes) / float64(limitBytes)
		if pct > 100 {
			pct = 100
		}
		h.ContainerRAMUsedPct = pct
	}
}

func readByteLimit(path string) uint64 {
	raw := strings.TrimSpace(readText(path))
	if raw == "" || raw == "max" {
		return 0
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value >= 1<<60 {
		return 0
	}
	return value
}

func readUintFile(path string) (uint64, bool) {
	raw := strings.TrimSpace(readText(path))
	if raw == "" {
		return 0, false
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

func readText(path string) string {
	if path == "" {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func cgroupPath(parts ...string) string {
	return filepath.Join(append([]string{cgroupRoot}, parts...)...)
}

func firstExisting(paths ...string) string {
	for _, path := range paths {
		if fileExists(path) {
			return path
		}
	}
	return ""
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
