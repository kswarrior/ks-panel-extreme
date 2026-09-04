//go:build !linux

package update

import "syscall"

// detachAttr is a no-op session detach on non-linux platforms (the edge
// production target is linux; this keeps `go build` working elsewhere).
func detachAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}
