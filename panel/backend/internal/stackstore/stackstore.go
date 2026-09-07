package stackstore

// stackstore.go manages the on-disk .ksps (KS Panel Stack) package store.
//
// A .ksps is a zip the admin uploads bundling everything a stack ships:
// manifest.json, optional spec.json, frontend/dist/** (spa bundle or simple
// pages + optional theme.css), backend/** (sidecar entry). The panel keeps
// the zip verbatim under <datadir>/stack-packages/<slug>.ksps and extracts
// it on activation into <datadir>/stack-work/<slug>/; per-stack data
// (sqlite file, KV overflow, snapshots) lives under
// <datadir>/stack-data/<slug>/ so re-install keeps data unless wiped.
//
// Shape mirrors modengine/pkgstore.go deliberately (zip-slip guard, symlink
// skip, per-slug extract locks, synthesize-on-download) but lives in its own
// package so Stacks never shares fate with the mod engine.

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/example/kspanel/internal/config"
)

// kspmExt is the conventional package file extension ("KS Panel Stack").
const kspmExt = ".ksps"

// packageRoot / workRoot / dataRoot sit under the panel data dir so they
// ride the same backup / container-mount story as the SQLite db.
func packageRoot() string { return filepath.Join(config.DataDir(), "stack-packages") }
func workRoot() string    { return filepath.Join(config.DataDir(), "stack-work") }
func dataRoot() string    { return filepath.Join(config.DataDir(), "stack-data") }

// safeSlug reduces a stack slug to a filesystem-safe leaf name. Slugs are
// already constrained to [a-z0-9-] by ValidStackSlug, but harden here so a
// hostile/legacy slug can't escape the per-stack directory.
func safeSlug(slug string) (string, error) {
	s := strings.TrimSpace(slug)
	if s == "" {
		return "", errors.New("stack slug is required")
	}
	if strings.ContainsAny(s, `/\`) || s == "." || s == ".." || strings.HasPrefix(s, ".") {
		return "", fmt.Errorf("unsafe stack slug %q", slug)
	}
	if filepath.Base(s) != s {
		return "", fmt.Errorf("unsafe stack slug %q", slug)
	}
	return s, nil
}

// PackagePath returns the absolute path to the .ksps zip for slug. The file
// may not exist: callers stat it and fall back to BuildPackageZip.
func PackagePath(slug string) (string, error) {
	s, err := safeSlug(slug)
	if err != nil {
		return "", err
	}
	return filepath.Join(packageRoot(), s+kspmExt), nil
}

// WorkDir returns the extracted workdir path for slug (does NOT create it).
func WorkDir(slug string) (string, error) {
	s, err := safeSlug(slug)
	if err != nil {
		return "", err
	}
	return filepath.Join(workRoot(), s), nil
}

// DataDir returns the per-stack data dir path for slug (does NOT create it).
// Holds data.db (isolated SQL), snapshots/ and KV overflow.
func DataDir(slug string) (string, error) {
	s, err := safeSlug(slug)
	if err != nil {
		return "", err
	}
	return filepath.Join(dataRoot(), s), nil
}

// EnsureDataDir creates the per-stack data dir (idempotent). Data survives
// package re-installs and workdir re-extracts by design.
func EnsureDataDir(slug string) (string, error) {
	d, err := DataDir(slug)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(d, 0o755); err != nil {
		return "", fmt.Errorf("create stack data dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(d, "snapshots"), 0o755); err != nil {
		return "", fmt.Errorf("create stack snapshots dir: %w", err)
	}
	return d, nil
}

// SavePackage writes the uploaded .ksps bytes for slug, invalidating the
// extracted workdir so the next EnsureWorkDir re-extracts. Data dir is left
// alone (re-install keeps data unless the admin wipes).
func SavePackage(slug string, zipBytes []byte) error {
	s, err := safeSlug(slug)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(packageRoot(), 0o755); err != nil {
		return fmt.Errorf("create stack-packages dir: %w", err)
	}
	dst := filepath.Join(packageRoot(), s+kspmExt)
	tmp := dst + ".tmp"
	if err := os.WriteFile(tmp, zipBytes, 0o644); err != nil {
		return fmt.Errorf("write package: %w", err)
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("commit package: %w", err)
	}
	if wd, werr := WorkDir(slug); werr == nil {
		_ = os.RemoveAll(wd)
	}
	return nil
}

// LoadPackage reads the stored .ksps bytes for slug.
func LoadPackage(slug string) ([]byte, error) {
	p, err := PackagePath(slug)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p)
}

// PackageExists reports whether a .ksps zip is stored for slug.
func PackageExists(slug string) bool {
	p, err := PackagePath(slug)
	if err != nil {
		return false
	}
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// EnsureWorkDir guarantees the extracted workdir is present and up to date
// (idempotent via the .ksextracted marker). With no package file (studio /
// URL / JSON installs) it creates an empty workdir.
func EnsureWorkDir(slug string) (string, error) {
	wd, err := WorkDir(slug)
	if err != nil {
		return "", err
	}
	pkgPath, _ := PackagePath(slug)
	pkgInfo, pkgErr := os.Stat(pkgPath)

	if pkgErr == nil && !pkgInfo.IsDir() {
		marker := filepath.Join(wd, ".ksextracted")
		if mInfo, mErr := os.Stat(marker); mErr == nil && !mInfo.IsDir() && mInfo.ModTime().After(pkgInfo.ModTime()) {
			return wd, nil
		}
	}

	_ = os.RemoveAll(wd)
	if err := os.MkdirAll(wd, 0o755); err != nil {
		return "", fmt.Errorf("create stack workdir: %w", err)
	}
	if pkgErr != nil {
		return wd, touchMarker(wd)
	}
	if pkgInfo.IsDir() {
		return wd, touchMarker(wd)
	}
	if err := extractZipTo(pkgPath, wd); err != nil {
		return wd, fmt.Errorf("extract .ksps: %w", err)
	}
	return wd, touchMarker(wd)
}

func extractZipTo(zipPath, dst string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer r.Close()
	for _, f := range r.File {
		if err := writeZipEntry(f, dst); err != nil {
			return err
		}
	}
	return nil
}

// writeZipEntry writes one zip entry with zip-slip protection; symlinks and
// non-regular files are skipped so a package can't smuggle a link.
func writeZipEntry(f *zip.File, dst string) error {
	name := filepath.FromSlash(f.Name)
	if strings.HasPrefix(name, "/") || filepath.IsAbs(name) {
		return fmt.Errorf("zip entry %q is absolute", f.Name)
	}
	clean := filepath.Clean(name)
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return fmt.Errorf("zip entry %q escapes workdir", f.Name)
	}
	target := filepath.Join(dst, clean)
	if f.FileInfo().IsDir() {
		return os.MkdirAll(target, 0o755)
	}
	if f.Mode()&os.ModeSymlink != 0 || !f.Mode().IsRegular() {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode()&0o755)
	if err != nil {
		return err
	}
	defer out.Close()
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	_, err = io.Copy(out, rc)
	return err
}

func touchMarker(wd string) error {
	f, err := os.Create(filepath.Join(wd, ".ksextracted"))
	if err != nil {
		return nil
	}
	_ = f.Close()
	return nil
}

// RemoveAll deletes the .ksps zip AND the extracted workdir. Data dir is
// kept unless wipeData is true (re-install keeps data by design).
func RemoveAll(slug string, wipeData bool) error {
	if wd, werr := WorkDir(slug); werr == nil {
		_ = os.RemoveAll(wd)
	}
	if p, perr := PackagePath(slug); perr == nil {
		if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	if wipeData {
		if d, derr := DataDir(slug); derr == nil {
			_ = os.RemoveAll(d)
		}
	}
	return nil
}

// ReadAsset returns one file inside the extracted workdir, traversal-guarded.
func ReadAsset(slug, rel string) ([]byte, error) {
	wd, err := WorkDir(slug)
	if err != nil {
		return nil, err
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	if filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("unsafe asset path %q", rel)
	}
	full := filepath.Join(wd, clean)
	if !strings.HasPrefix(full, wd+string(filepath.Separator)) && full != wd {
		return nil, fmt.Errorf("unsafe asset path %q", rel)
	}
	return os.ReadFile(full)
}

var extractMu sync.Map

func extractLock(slug string) *sync.Mutex {
	v, _ := extractMu.LoadOrStore(slug, &sync.Mutex{})
	return v.(*sync.Mutex)
}

// EnsureWorkDirLocked is the concurrency-safe variant for parallel activates.
func EnsureWorkDirLocked(slug string) (string, error) {
	mu := extractLock(slug)
	mu.Lock()
	defer mu.Unlock()
	return EnsureWorkDir(slug)
}

// BuildPackageZip synthesises a .ksps from manifest + spec (+ optional
// extra entries). Used for studio/URL/JSON installs and the download path
// when no on-disk package exists.
func BuildPackageZip(manifest, spec []byte, extra map[string][]byte) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	if err := addZipEntry(zw, "manifest.json", manifest); err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(spec)) > 0 {
		if err := addZipEntry(zw, "spec.json", spec); err != nil {
			return nil, err
		}
	}
	for name, data := range extra {
		if err := addZipEntry(zw, name, data); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("close zip: %w", err)
	}
	return buf.Bytes(), nil
}

func addZipEntry(zw *zip.Writer, name string, data []byte) error {
	w, err := zw.Create(name)
	if err != nil {
		return fmt.Errorf("zip entry %q: %w", name, err)
	}
	if _, err := w.Write(data); err != nil {
		return fmt.Errorf("zip write %q: %w", name, err)
	}
	return nil
}

// ReadManifestFromZip locates manifest.json (canonical), manifest.ksps,
// any root *.ksps, then any root *.json — plus optional spec.json override.
func ReadManifestFromZip(zipBytes []byte) (manifest, spec []byte, err error) {
	r, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, nil, fmt.Errorf("open .ksps zip: %w", err)
	}
	type cand struct {
		name string
		f    *zip.File
	}
	var manifestJSON, manifestKsps, anyKsps, anyJSON *cand
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		dir := path.Dir(f.Name)
		if dir != "." && dir != "" && dir != "/" {
			continue
		}
		base := strings.ToLower(path.Base(f.Name))
		switch {
		case base == "manifest.json":
			manifestJSON = &cand{base, f}
		case base == "manifest.ksps":
			manifestKsps = &cand{base, f}
		case strings.HasSuffix(base, ".ksps"):
			if anyKsps == nil {
				anyKsps = &cand{base, f}
			}
		case base != "spec.json" && strings.HasSuffix(base, ".json"):
			if anyJSON == nil {
				anyJSON = &cand{base, f}
			}
		}
	}
	picked := manifestJSON
	if picked == nil {
		picked = manifestKsps
	}
	if picked == nil {
		picked = anyKsps
	}
	if picked == nil {
		picked = anyJSON
	}
	if picked == nil {
		return nil, nil, errors.New(".ksps zip has no manifest: add a manifest.json at the archive root")
	}
	manifest, err = readZipFileBytes(picked.f)
	if err != nil {
		return nil, nil, fmt.Errorf("read %s: %w", picked.name, err)
	}
	if sf := findRootEntry(r, "spec.json"); sf != nil {
		spec, err = readZipFileBytes(sf)
		if err != nil {
			return nil, nil, fmt.Errorf("read spec.json: %w", err)
		}
	}
	return manifest, spec, nil
}

func findRootEntry(r *zip.Reader, want string) *zip.File {
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		dir := path.Dir(f.Name)
		if (dir == "." || dir == "" || dir == "/") && path.Base(f.Name) == want {
			return f
		}
	}
	return nil
}

func readZipFileBytes(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

// IsZipBytes reports whether b starts with a zip local-file-header magic.
func IsZipBytes(b []byte) bool {
	return len(b) >= 4 && b[0] == 'P' && b[1] == 'K' && b[2] == 0x03 && b[3] == 0x04
}
