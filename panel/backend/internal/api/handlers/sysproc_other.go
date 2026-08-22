//go:build !linux

package handlers

import "syscall"

// setDetachSysProcAttr puts the launched process into its own session on
// platforms that support Setsid (Darwin, FreeBSD, etc.). On platforms without
// Setsid support, returns an empty SysProcAttr.
func setDetachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
