//go:build linux

package sysinfo

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func resetContainerCPU() {
	containerCPUPrevMu.Lock()
	containerCPUPrevUsage = 0
	containerCPUPrevTime = time.Time{}
	containerCPUPrevMu.Unlock()
}

func TestApplyContainerCgroupV2(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "cgroup.controllers"), "")
	writeTestFile(t, filepath.Join(root, "cpu.max"), "100000 100000\n")
	writeTestFile(t, filepath.Join(root, "cpu.stat"), "usage_usec 1000000\n")
	writeTestFile(t, filepath.Join(root, "memory.current"), "104857600\n")
	writeTestFile(t, filepath.Join(root, "memory.max"), "209715200\n")

	oldRoot := cgroupRoot
	cgroupRoot = root
	defer func() { cgroupRoot = oldRoot }()
	resetContainerCPU()
	t.Setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")

	var host Host
	host.CPUCores = 4
	applyContainer(&host)

	if !host.InContainer || host.ContainerRuntime != "kubernetes" {
		t.Fatalf("container detection = %v/%q", host.InContainer, host.ContainerRuntime)
	}
	if host.ContainerCPULimitCores != 1 {
		t.Fatalf("cpu limit = %v, want 1", host.ContainerCPULimitCores)
	}
	if host.ContainerRAMUsedMB != 100 {
		t.Fatalf("ram used = %v, want 100", host.ContainerRAMUsedMB)
	}
	if host.ContainerRAMLimitMB != 200 {
		t.Fatalf("ram limit = %v, want 200", host.ContainerRAMLimitMB)
	}
	if host.ContainerRAMUsedPct != 50 {
		t.Fatalf("ram pct = %v, want 50", host.ContainerRAMUsedPct)
	}
}

func TestApplyContainerCgroupV1(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "cpuacct", "cpuacct.usage"), "1000000000\n")
	writeTestFile(t, filepath.Join(root, "cpu", "cpu.cfs_quota_us"), "150000\n")
	writeTestFile(t, filepath.Join(root, "cpu", "cpu.cfs_period_us"), "100000\n")
	writeTestFile(t, filepath.Join(root, "memory", "memory.usage_in_bytes"), "268435456\n")
	writeTestFile(t, filepath.Join(root, "memory", "memory.limit_in_bytes"), "1073741824\n")

	oldRoot := cgroupRoot
	cgroupRoot = root
	defer func() { cgroupRoot = oldRoot }()
	resetContainerCPU()
	t.Setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")

	var host Host
	host.CPUCores = 2
	applyContainer(&host)

	if !host.InContainer {
		t.Fatal("expected container detection")
	}
	if host.ContainerCPULimitCores != 1.5 {
		t.Fatalf("cpu limit = %v, want 1.5", host.ContainerCPULimitCores)
	}
	if host.ContainerRAMUsedMB != 256 {
		t.Fatalf("ram used = %v, want 256", host.ContainerRAMUsedMB)
	}
	if host.ContainerRAMLimitMB != 1024 {
		t.Fatalf("ram limit = %v, want 1024", host.ContainerRAMLimitMB)
	}
	if host.ContainerRAMUsedPct != 25 {
		t.Fatalf("ram pct = %v, want 25", host.ContainerRAMUsedPct)
	}
}

func TestContainerCPUPercent(t *testing.T) {
	resetContainerCPU()
	containerCPUPrevMu.Lock()
	containerCPUPrevUsage = 0
	containerCPUPrevTime = time.Now().Add(-time.Second)
	containerCPUPrevMu.Unlock()

	if got := containerCPUPercent(0.5, 1, 4); got < 49 || got > 51 {
		t.Fatalf("limited cpu pct = %v, want ~50", got)
	}

	resetContainerCPU()
	containerCPUPrevMu.Lock()
	containerCPUPrevUsage = 0
	containerCPUPrevTime = time.Now().Add(-time.Second)
	containerCPUPrevMu.Unlock()

	if got := containerCPUPercent(0.5, 0, 4); got < 12 || got > 13 {
		t.Fatalf("host-relative cpu pct = %v, want ~12.5", got)
	}
}

func TestContainerParsing(t *testing.T) {
	if got := parseCPUMax("max 100000"); got != 0 {
		t.Fatalf("unlimited cpu max = %v", got)
	}
	if got := parseCPUMax("250000 100000"); got != 2.5 {
		t.Fatalf("cpu max = %v, want 2.5", got)
	}

	root := t.TempDir()
	limit := filepath.Join(root, "memory.max")
	writeTestFile(t, limit, "max\n")
	if got := readByteLimit(limit); got != 0 {
		t.Fatalf("max byte limit = %v, want 0", got)
	}
	writeTestFile(t, limit, "1073741824\n")
	if got := readByteLimit(limit); got != 1073741824 {
		t.Fatalf("byte limit = %v", got)
	}
}
