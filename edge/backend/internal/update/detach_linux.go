//go:build linux

package update

import "syscall"

// detachAttr puts the launched process into its own session so the edge's
// HTTP handler returning (or the edge exiting) does not deliver a signal
// that kills the long-running child. Mirrors the panel's
// setDetachSysProcAttr.
func detachAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
