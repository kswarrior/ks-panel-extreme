//go:build !linux

package sysinfo

import (
	"os"
	"runtime"
	"strings"
)

// readPlatform is the non-Linux fallback. We can't read /proc here, so
// we return whatever we CAN from the Go runtime + stdlib. Every Linux-
// specific field stays zero — the React renders "—" gracefully.
func readPlatform() Host {
	h := Host{}
	if name, err := os.Hostname(); err == nil {
		h.Hostname = strings.TrimSpace(name)
	}
	h.Platform = runtime.GOOS
	h.CPUCores = runtime.NumCPU()
	return h
}

// readPanelCPUPercent returns 0 on non-Linux platforms.
func readPanelCPUPercent() float64 {
	return 0
}

// readPanelRSS returns 0 on non-Linux platforms.
func readPanelRSS() float64 {
	return 0
}
