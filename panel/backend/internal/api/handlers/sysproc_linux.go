//go:build linux

package handlers

import "syscall"

// setDetachSysProcAttr puts the launched process into its own session so
// the panel's HTTP handler returning (or the panel exiting) does not deliver
// a signal that kills the long-running child. Setsid creates a new session,
// making the process a session leader and detaching it from the controlling
// terminal. This is more robust than Setpgid alone for daemon processes.
func setDetachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
