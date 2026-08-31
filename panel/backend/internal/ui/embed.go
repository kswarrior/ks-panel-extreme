package ui

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"time"
)

//go:embed dist
var embeddedUI embed.FS

// FileSystem returns an http.FileSystem for the embedded UI.
// Falls back to a minimal page if the embedded assets are not available.
func FileSystem() http.FileSystem {
	// Try to use embedded dist directory
	subFS, err := fs.Sub(embeddedUI, "dist")
	if err != nil {
		// Fallback to minimal page if dist not embedded
		return fallbackFileSystem{}
	}
	return http.FS(subFS)
}

type fallbackFileSystem struct{}

func (f fallbackFileSystem) Open(name string) (http.File, error) {
	if name == "" || name == "/" || name == "index.html" {
		return &fallbackFile{data: []byte("<html><body><h1>KS Panel</h1></body></html>")}, nil
	}
	return nil, fs.ErrNotExist
}

type fallbackFile struct {
	data []byte
	pos  int64
	name string
	closed bool
}

func (f *fallbackFile) Read(b []byte) (int, error) {
	if f.pos >= int64(len(f.data)) || f.closed {
		return 0, io.EOF
	}
	n := copy(b, f.data[f.pos:])
	f.pos += int64(n)
	return n, nil
}

func (f *fallbackFile) Close() error {
	f.closed = true
	return nil
}

func (f *fallbackFile) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		f.pos = offset
		return f.pos, nil
	case io.SeekCurrent:
		f.pos += offset
		return f.pos, nil
	case io.SeekEnd:
		f.pos = int64(len(f.data)) + offset
		return f.pos, nil
	default:
		return 0, fmt.Errorf("invalid whence: %d", whence)
	}
}

func (f *fallbackFile) Stat() (fs.FileInfo, error) {
	return fallbackFileInfo{name: f.name, size: int64(len(f.data))}, nil
}

func (f *fallbackFile) Readdir(count int) ([]fs.FileInfo, error) {
	if count <= 0 {
		return nil, nil
	}
	return []fs.FileInfo{fallbackFileInfo{name: f.name, size: int64(len(f.data))}}, nil
}

type fallbackFileInfo struct {
	name string
	size int64
}

func (f fallbackFileInfo) Name() string    { return f.name }
func (f fallbackFileInfo) Size() int64    { return f.size }
func (f fallbackFileInfo) Mode() os.FileMode {
	return 0o644
}
func (f fallbackFileInfo) ModTime() time.Time { return time.Time{} }
func (f fallbackFileInfo) IsDir() bool         { return false }
func (f fallbackFileInfo) Sys() any          { return nil }