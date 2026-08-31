//go:build linux

package cli

import "syscall"

// detachSysProcAttr isolates the ksedge child in its own process group so
// signals directed at the CLI (Ctrl-C, exit) don't propagate to it. On
// Linux/macOS the Setpgid field exists; on other platforms the fallback in
// setup_localnode_other.go returns the zero value.
func detachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}
