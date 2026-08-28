//go:build !linux

package cli

import "syscall"

// detachSysProcAttr is a no-op fallback for non-Linux platforms where the
// Setpgid field doesn't exist on syscall.SysProcAttr. The child still gets
// launched successfully; it just won't be immunised against parent signals.
func detachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}
