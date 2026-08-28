package modengine

// pkgstore.go manages the on-disk .kspm (KS Panel Mod) package store.
//
// A .kspm is a zip archive the admin uploads that bundles everything a mod
// ships: its manifest (manifest.json), an optional spec override (spec.json),
// the backend JS entry the Goja VM evaluates (referenced by the manifest's
// `backendScript` path, e.g. "backend/main.js"), the frontend bundle the
// browser mounts into <Slot /> injection points (referenced by slots[].component),
// and any multipage / page content the mod's spec.pages point at. The panel
// keeps the uploaded zip verbatim under <datadir>/mod-packages/<slug>.kspm and
// extracts it on activation into <datadir>/mod-work/<slug>/ so the JS engine
// can resolve file-based backendScripts and the asset-serving route can stream
// frontend bundles to the browser.
//
// The store is deliberately non-blocking on the DB path: it lives on the same
// filesystem as the SQLite db (config.DataDir()) so backups stay co-located,
// and the per-mod workdir is idempotent to (re)extract. Failures (disk full,
// unreadable zip) are surfaced to the caller and never crash the panel: the
// engine's Error-Isolation contract logs a partial boot and leaves the row
// active-but-empty, exactly like a crashed Goja VM.

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

// kspmExt is the conventional package file extension ("KS Panel Mod"). Both
// .kspm and the legacy .ksmod spelling are accepted on upload for typo safety;
// downloads always emit .kspm.
const kspmExt = ".kspm"

// packageRoot / workRoot sit directly under the panel data dir so they ride
// the same backup / container-mount story as the SQLite db + uploaded logos.
func packageRoot() string { return filepath.Join(config.DataDir(), "mod-packages") }
func workRoot() string    { return filepath.Join(config.DataDir(), "mod-work") }

// safeSlug reduces a mod slug to a filesystem-safe leaf name. Slugs are already
// constrained to [a-z0-9-] by the frontend slugify(), but we harden here so a
// hostile/legacy slug can't escape the per-mod directory (no "..", no leading
// dots, no path separators).
func safeSlug(slug string) (string, error) {
	s := strings.TrimSpace(slug)
	if s == "" {
		return "", errors.New("mod slug is required")
	}
	if strings.ContainsAny(s, `/\`) || s == "." || s == ".." || strings.HasPrefix(s, ".") {
		return "", fmt.Errorf("unsafe mod slug %q", slug)
	}
	// Keep it file-system leaf only.
	if filepath.Base(s) != s {
		return "", fmt.Errorf("unsafe mod slug %q", slug)
	}
	return s, nil
}

// PackagePath returns the absolute path to the .kspm zip on disk for slug. The
// file may not exist (PackageSize == 0): callers should stat it before serving
// and fall back to BuildPackageZip for the synthesize-on-download path.
func PackagePath(slug string) (string, error) {
	s, err := safeSlug(slug)
	if err != nil {
		return "", err
	}
	return filepath.Join(packageRoot(), s+kspmExt), nil
}

// WorkDir returns the absolute path to the extracted package workdir for slug.
// It does NOT create the directory; EnsureWorkDir does. Returns an error on an
// unsafe slug so handlers can bail before touching the filesystem.
func WorkDir(slug string) (string, error) {
	s, err := safeSlug(slug)
	if err != nil {
		return "", err
	}
	return filepath.Join(workRoot(), s), nil
}

// SavePackage writes the uploaded .kspm zip bytes to disk for slug, replacing
// any prior package. It also invalidates the extracted workdir so a subsequent
// activation re-extracts the new contents. The bytes are NOT trusted by the
// caller beyond being a syntactically valid zip; callers must have already
// parsed the manifest and validated capabilities before storing.
func SavePackage(slug string, zipBytes []byte) error {
	s, err := safeSlug(slug)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(packageRoot(), 0o755); err != nil {
		return fmt.Errorf("create mod-packages dir: %w", err)
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
	// Invalidate any stale extracted workdir so the NEXT EnsureWorkDir re-extracts
	// the freshly-saved package. Best-effort; an rm failure leaves a stale dir,
	// which EnsureWorkDir's existence check would skip — but we only extract once
	// per package save anyway, so a stale dir is a (minor) cache risk, not a
	// correctness one. We log rather than fail to keep the install path happy.
	wd, werr := WorkDir(slug)
	if werr == nil {
		_ = os.RemoveAll(wd)
	}
	return nil
}

// LoadPackage reads the stored .kspm zip bytes for slug. Returns os.ErrNotExist
// (wrapped) when no package file is on disk so callers can fall back to
// BuildPackageZip for the synthesize-from-DB download path.
func LoadPackage(slug string) ([]byte, error) {
	p, err := PackagePath(slug)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p)
}

// PackageExists reports whether a .kspm zip is stored on disk for slug.
func PackageExists(slug string) bool {
	p, err := PackagePath(slug)
	if err != nil {
		return false
	}
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// EnsureWorkDir guarantees the extracted package workdir for slug is present
// on disk and up to date with the stored .kspm (idempotent): it extracts only
// when the workdir is missing OR the package file is newer than the workdir's
// marker. When no package file exists (a Studio/URL/JSON install that never
// carried a zip), the workdir is created empty so file-based backendScripts
// resolve to "not found" cleanly. Returns the workdir path.
func EnsureWorkDir(slug string) (string, error) {
	wd, err := WorkDir(slug)
	if err != nil {
		return "", err
	}
	pkgPath, _ := PackagePath(slug)
	pkgInfo, pkgErr := os.Stat(pkgPath)

	// Fast path: workdir already present AND up to date with the package.
	if pkgErr == nil && !pkgInfo.IsDir() {
		marker := filepath.Join(wd, ".ksextracted")
		if mInfo, mErr := os.Stat(marker); mErr == nil && !mInfo.IsDir() && mInfo.ModTime().After(pkgInfo.ModTime()) {
			return wd, nil
		}
	}

	// Slow path: (re)extract. Remove a stale dir first so a half-extracted tree
	// never wins.
	_ = os.RemoveAll(wd)
	if err := os.MkdirAll(wd, 0o755); err != nil {
		return "", fmt.Errorf("create mod workdir: %w", err)
	}

	if pkgErr != nil {
		// No package file — leave an empty workdir. The marker still lands so
		// repeated EnsureWorkDir calls are cheap.
		return wd, touchMarker(wd)
	}
	if pkgInfo.IsDir() {
		return wd, touchMarker(wd) // shouldn't happen (path collision) — bail softly
	}

	if err := extractZipTo(pkgPath, wd); err != nil {
		// Leave the partially-extracted dir; the engine logs the failure and
		// resolves file-based scripts to empty so activation degrades safely.
		return wd, fmt.Errorf("extract .kspm: %w", err)
	}
	return wd, touchMarker(wd)
}

// extractZipTo unpacks the zip at zipPath into dst. It guards against zip-slip
// (entries whose Name resolves outside dst) by cleaning every entry path and
// rejecting any that escapes. Symlinks inside the archive are ignored so a
// package can't trick the panel into writing an arbitrary file via a link.
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

// writeZipEntry writes one zip entry into dst with zip-slip protection.
func writeZipEntry(f *zip.File, dst string) error {
	// Normalise to a forward-slash path and clean it. zip.Name uses forward
	// slashes per the spec; filepath.FromSlash makes it OS-correct.
	name := filepath.FromSlash(f.Name)
	if strings.HasPrefix(name, "/") || filepath.IsAbs(name) {
		return fmt.Errorf("zip entry %q is absolute", f.Name)
	}
	clean := filepath.Clean(name)
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return fmt.Errorf("zip entry %q escapes workdir", f.Name)
	}
	// Skip directory entries that are just path markers; MkdirAll handles them.
	target := filepath.Join(dst, clean)
	if f.FileInfo().IsDir() {
		return os.MkdirAll(target, 0o755)
	}
	// Skip symlinks / non-regular files so a package can't smuggle a link.
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
	marker := filepath.Join(wd, ".ksextracted")
	f, err := os.Create(marker)
	if err != nil {
		return nil // marker is a perf hint, not a correctness gate
	}
	_ = f.Close()
	return nil
}

// RemovePackage deletes the .kspm zip AND the extracted workdir for slug. Used
// on mod delete so a removed mod doesn't leak its package bytes. Idempotent:
// missing files are a no-op. Errors are surfaced so the delete handler can log
// without failing the row delete (the FK cascade already did its job).
func RemovePackage(slug string) error {
	wd, werr := WorkDir(slug)
	if werr == nil {
		_ = os.RemoveAll(wd)
	}
	p, perr := PackagePath(slug)
	if perr != nil {
		return perr
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// ReadAsset returns the bytes of a single asset file inside the extracted
// workdir for slug, addressed by a zip-relative path (e.g. "frontend/bundle.js").
// It guards against path traversal: the resolved path must stay inside the
// mod's workdir. Returns os.ErrNotExist (wrapped) when the file is absent so
// the HTTP asset handler can return a clean 404.
func ReadAsset(slug, rel string) ([]byte, error) {
	wd, err := WorkDir(slug)
	if err != nil {
		return nil, err
	}
	// Re-clean to a relative, OS-correct leaf path and ensure it stays under wd.
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

// extractMu serialises concurrent EnsureWorkDir calls for the same slug so two
// parallel activations don't fight over the workdir (remove + extract racing).
// Per-slug locks keep unrelated mods concurrent.
var extractMu sync.Map

// extractLock returns a per-slug mutex, creating it on first use.
func extractLock(slug string) *sync.Mutex {
	v, _ := extractMu.LoadOrStore(slug, &sync.Mutex{})
	return v.(*sync.Mutex)
}

// EnsureWorkDirLocked is the concurrency-safe variant the engine uses: it takes
// the per-slug lock around EnsureWorkDir so two concurrent activate() calls for
// the same slug extract exactly once.
func EnsureWorkDirLocked(slug string) (string, error) {
	mu := extractLock(slug)
	mu.Lock()
	defer mu.Unlock()
	return EnsureWorkDir(slug)
}

// ---------------------------------------------------------------------------
// Package build helpers (download + synthesize-on-install for Studio/URL/JSON).
// ---------------------------------------------------------------------------

// BuildPackageZip synthesises a .kspm zip from the stored manifest + spec and
// returns the bytes. Used in two places:
//
//   - The download handler when a mod has no on-disk package (a Studio / URL /
//     JSON install that never carried a zip) so every mod is still downloadable.
//   - The create handler for the Studio / URL / JSON paths to persist a real
//     .kspm on disk (so subsequent downloads are byte-identical to installs and
//     the workdir resolves consistently).
//
// `manifest` and `spec` are the raw JSON blobs the panel already stored; `spec`
// may be nil/empty in which case no spec.json entry is written. `extra` carries
// any additional entry name -> bytes (e.g. an inline backendScriptSource the
// Studio wants shipped as backend/main.js so the v2 engine can resolve the file
// path form too); nil maps to no extra entries.
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

// ReadManifestFromZip locates and returns the manifest JSON inside a .kspm zip,
// plus an optional spec.json override. Resolution order for the manifest:
//
//  1. manifest.json     (canonical)
//  2. manifest.ksmod    (legacy single-file spelling)
//  3. any *.ksmod at the archive root
//  4. any *.json at the archive root (last resort)
//
// `zipBytes` is the raw uploaded .kspm body. The returned (manifest, spec) pair
// is fed straight to repository.ParseManifest; spec may be nil when no
// spec.json entry is present.
func ReadManifestFromZip(zipBytes []byte) (manifest, spec []byte, err error) {
	r, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, nil, fmt.Errorf("open .kspm zip: %w", err)
	}
	// Collect zip-root-relative candidates (no subdirs) to keep resolution
	// deterministic: only top-level manifest/spec files qualify so a mod can't
	// accidentally ship two manifests with different capabilities.
	type cand struct {
		name string
		f    *zip.File
	}
	var manifestJSON, manifestKsmod, anyKsmod, anyJSON *cand
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		dir := path.Dir(f.Name)
		if dir != "." && dir != "" && dir != "/" {
			continue // only archive-root entries qualify
		}
		base := strings.ToLower(path.Base(f.Name))
		switch {
		case base == "manifest.json":
			manifestJSON = &cand{base, f}
		case base == "manifest.ksmod":
			manifestKsmod = &cand{base, f}
		case strings.HasSuffix(base, ".ksmod"):
			if anyKsmod == nil {
				anyKsmod = &cand{base, f}
			}
		case base != "spec.json" && strings.HasSuffix(base, ".json"):
			// Last-resort: the first root .json that isn't spec.json (so a mod
			// alt-named its manifest still installs). Kept lowest priority so
			// the canonical manifest.json / .ksmod names win.
			if anyJSON == nil {
				anyJSON = &cand{base, f}
			}
		}
	}

	// Prefer manifest.json, then manifest.ksmod, then any *.ksmod, then any *.json.
	picked := manifestJSON
	if picked == nil {
		picked = manifestKsmod
	}
	if picked == nil {
		picked = anyKsmod
	}
	if picked == nil {
		picked = anyJSON
	}
	if picked == nil {
		return nil, nil, errors.New(".kspm zip has no manifest: add a manifest.json at the archive root")
	}
	manifest, err = readZipFileBytes(picked.f)
	if err != nil {
		return nil, nil, fmt.Errorf("read %s: %w", picked.name, err)
	}
	// Optional spec.json override.
	if sf := findRootEntry(r, "spec.json"); sf != nil {
		spec, err = readZipFileBytes(sf)
		if err != nil {
			return nil, nil, fmt.Errorf("read spec.json: %w", err)
		}
	}
	return manifest, spec, nil
}

// findRootEntry looks up a top-level (archive-root) file by exact name.
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

// IsZipBytes reports whether b starts with a zip local-file-header magic
// (PK\x03\x04). Used by the install path so a Studio/URL/JSON install that
// posts a bare manifest JSON can be auto-wrapped into a .kspm without the
// caller having to know the content shape up front.
func IsZipBytes(b []byte) bool {
	return len(b) >= 4 && b[0] == 'P' && b[1] == 'K' && b[2] == 0x03 && b[3] == 0x04
}
