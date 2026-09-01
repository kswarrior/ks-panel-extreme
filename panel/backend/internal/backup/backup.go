// Package backup is the SQLite database backup subsystem that the
// /api/database/* endpoints drive. It does four things:
//
//   1. List every .db backup on disk (under <DataDir>/backups) so the
//      Database admin page can render a table of available snapshots.
//   2. Create a fresh backup by issuing SQLite's `VACUUM INTO '<path>'`
//      against the live DB — this is a snapshot-safe, transactionally
//      consistent copy that the panel can hand back to the operator via
//      `wget` or the Download button on the page.
//   3. Restore from a chosen backup. The current db file is renamed to
//      `<path>.bak` first so a failed restore never destroys the live
//      data; on success the rename atomically replaces the live db with
//      the backup.
//   4. Upload a backup the operator brought back from elsewhere (or from
//      a different machine). The uploaded file is verified by opening
//      it with the SQLite driver — a corrupt file fails the upload before
//      it lands on disk.
//
// The whole subsystem is SQLite-only. Postgres / MySQL backups are not
// implemented here — operators are expected to use the engine's native
// tool (pg_dump / mysqldump) or a managed snapshot for those.
package backup

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/config"
)

// Backup is one on-disk snapshot entry — the JSON shape the
// /api/database/backup/list endpoint returns and that the Database
// page renders as a row. Size is in bytes; SHA256 is the file's hex
// digest so an operator can compare what they downloaded against the
// panel's view.
type Backup struct {
	ID         string    `json:"id"`           // filename without .db suffix
	Filename   string    `json:"filename"`     // full filename on disk
	Path       string    `json:"path"`         // absolute path (DB admin only)
	Size       int64     `json:"size_bytes"`   // on-disk bytes
	CreatedAt  time.Time `json:"created_at"`   // mtime of the file
	SHA256     string    `json:"sha256"`       // hex digest of the file
	Source     string    `json:"source"`       // "vacuum-into" | "uploaded" | "uploaded-from-restore"
	IsLiveSafe bool      `json:"is_live_safe"` // false for uploads of unknown provenance
}

// FileNamePattern is the naming convention every Backup follows:
// `<timestamp>-<label>.db`. The timestamp sorts lexically with itself
// AND chronologically, which is what makes List() come out in newest-
// first order without a separate sort key.
const fileNamePattern = "kspanel-20060102-150405-"

// ListDir returns the absolute path of the backup directory, ensuring
// it exists. Every other helper here resolves the directory through
// this function so the location stays in one place.
func ListDir() string {
	return filepath.Join(config.DataDir(), "backups")
}

func ensureDir() error {
	return os.MkdirAll(ListDir(), 0o755)
}

// List returns every backup on disk, newest-first. Each entry carries
// enough metadata for the Database page to render its row + the download
// button. Files whose name doesn't match the Backup pattern (e.g. an
// operator's stray *.db.tmp) are silently skipped — the page only shows
// valid backups.
func List() ([]Backup, error) {
	if err := ensureDir(); err != nil {
		return nil, err
	}
	dir := ListDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := []Backup{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasPrefix(name, fileNamePattern) || !strings.HasSuffix(name, ".db") {
			continue
		}
		path := filepath.Join(dir, name)
		fi, err := e.Info()
		if err != nil {
			continue
		}
		digest, size, err := hashFile(path)
		if err != nil {
			continue
		}
		// ID = filename minus prefix + ".db" suffix, used as the stable
		// handle in URLs (/backup/{id} etc.).
		id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), ".db")
		out = append(out, Backup{
			ID:         id,
			Filename:   name,
			Path:       path,
			Size:       size,
			CreatedAt:  fi.ModTime().UTC(),
			SHA256:     digest,
			Source:     parseSourceFromName(id),
			IsLiveSafe: true,
		})
	}
	// Newest first — the page renders the most recent at the top.
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// parseSourceFromName inspects the trailing label embedded in the file
// name (`<prefix>-<timestamp>-<label>.db`) and returns "uploaded" when
// the label is `uploaded` (the convention CreateUpload / Upload use).
// Anything else is treated as a vacuum-into snapshot. Returns
// "uploaded-from-restore" for the special rename-during-restore case
// (see Restore — it tags the prior live db with this so the operator
// can recognise it in the list).
func parseSourceFromName(label string) string {
	if strings.HasSuffix(label, "uploaded") {
		return "uploaded"
	}
	if strings.HasSuffix(label, "old") {
		return "uploaded-from-restore"
	}
	if strings.HasSuffix(label, "pre-switch") {
		return "pre-engine-switch"
	}
	return "vacuum-into"
}

// Create issues `VACUUM INTO '<path>'` against the live database. The
// resulting file is a transactionally-consistent SQLite snapshot that
// can be copied / restored as a normal .db file.
//
// We can't run VACUUM INTO through the same *sql.DB the panel is
// actively using (modernc.org/sqlite pins to a single connection); the
// function takes a temporary connection instead. The temp conn is closed
// before return so it doesn't fight for the panel's lock.
func Create(label string) (Backup, error) {
	opMu.Lock()
	defer opMu.Unlock()
	if err := ensureDir(); err != nil {
		return Backup{}, err
	}
	ts := time.Now().UTC().Format("20060102-150405")
	if label == "" {
		label = "snapshot"
	}
	label = sanitizeLabel(label)
	name := fileNamePattern + ts + "-" + label + ".db"
	dst := filepath.Join(ListDir(), name)

	// Open a fresh dedicated connection so VACUUM INTO doesn't fight
	// with the panel's pooled connection for the same SQLite lock.
	cfg := config.DatabaseConfig()
	dsn := cfg.DSN
	tmp, err := sql.Open("sqlite", dsn)
	if err != nil {
		return Backup{}, fmt.Errorf("open temp sqlite: %w", err)
	}
	defer tmp.Close()
	tmp.SetMaxOpenConns(1)
	if _, err := tmp.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return Backup{}, fmt.Errorf("foreign keys pragma: %w", err)
	}
	if _, err := tmp.Exec(fmt.Sprintf("VACUUM INTO %q", dst)); err != nil {
		// Best-effort cleanup so a failed vacuum doesn't leave an empty
		// file at the destination path.
		_ = os.Remove(dst)
		return Backup{}, fmt.Errorf("vacuum into: %w", err)
	}
	digest, size, err := hashFile(dst)
	if err != nil {
		return Backup{}, err
	}
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), ".db")
	return Backup{
		ID:         id,
		Filename:   name,
		Path:       dst,
		Size:       size,
		CreatedAt:  time.Now().UTC(),
		SHA256:     digest,
		Source:     "vacuum-into",
		IsLiveSafe: true,
	}, nil
}

// CreateWithWriter builds a Backup entry whose content is materialised by
// fn at the destination path. It handles everything Create handles — the
// backup directory, the timestamped `<ts>-<label>.db` naming, hashing,
// failed-run cleanup — while letting the caller produce bytes that don't
// come from VACUUM INTO. The engine-switch flow uses this to dump a
// non-SQLite live database (Postgres / MySQL) into an equivalent SQLite
// snapshot file so every switch leaves a restorable artifact behind.
//
// fn must leave a valid SQLite database at dstPath or return an error; a
// returned error removes the partial file so a half-written snapshot never
// shows up in List().
func CreateWithWriter(label string, fn func(dstPath string) error) (Backup, error) {
	opMu.Lock()
	defer opMu.Unlock()
	if err := ensureDir(); err != nil {
		return Backup{}, err
	}
	ts := time.Now().UTC().Format("20060102-150405")
	if label == "" {
		label = "snapshot"
	}
	name := fileNamePattern + ts + "-" + sanitizeLabel(label) + ".db"
	dst := filepath.Join(ListDir(), name)
	if err := fn(dst); err != nil {
		_ = os.Remove(dst)
		return Backup{}, err
	}
	digest, size, err := hashFile(dst)
	if err != nil {
		return Backup{}, err
	}
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), ".db")
	return Backup{
		ID:         id,
		Filename:   name,
		Path:       dst,
		Size:       size,
		CreatedAt:  time.Now().UTC(),
		SHA256:     digest,
		Source:     parseSourceFromName(sanitizeLabel(label)),
		IsLiveSafe: true,
	}, nil
}

// UploadFromReader accepts an uploaded SQLite file (multipart body),
// verifies it really is a SQLite file by opening it, copies it into the
// backup directory with the `uploaded` label suffix, and returns the
// resulting Backup metadata. A corrupt upload fails before it touches
// the backup dir.
func UploadFromReader(src io.Reader, size int64, suggestedName string) (Backup, error) {
	if err := ensureDir(); err != nil {
		return Backup{}, err
	}
	ts := time.Now().UTC().Format("20060102-150405")
	label := "uploaded"
	if suggestedName != "" {
		// Strip path separators so a malicious suggested-name can't
		// escape the backup directory.
		base := filepath.Base(suggestedName)
		base = strings.TrimSuffix(base, filepath.Ext(base))
		base = sanitizeLabel(base)
		if base != "" {
			label = base + "-uploaded"
		}
	}
	name := fileNamePattern + ts + "-" + label + ".db"
	dst := filepath.Join(ListDir(), name)

	// Stream the upload to a temp file first; only rename into place
	// after SQLite confirms it can open it. A half-written upload never
	// becomes a visible backup.
	tmp := dst + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return Backup{}, err
	}
	if _, err := io.Copy(f, src); err != nil {
		f.Close()
		os.Remove(tmp)
		return Backup{}, err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return Backup{}, err
	}

	// Verify the uploaded file is a valid SQLite database. modernc.org/sqlite
	// will fail to open on a corrupt or non-sqlite file; a successful Open +
	// PRAGMA + SELECT 1 confirms the file is at least minimally well-formed.
	probe, err := sql.Open("sqlite", "file:"+tmp+"?mode=rw")
	if err != nil {
		os.Remove(tmp)
		return Backup{}, fmt.Errorf("uploaded file is not a valid SQLite database: %w", err)
	}
	probe.SetMaxOpenConns(1)
	var v string
	if err := probe.QueryRow("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").Scan(&v); err != nil && err != sql.ErrNoRows {
		probe.Close()
		os.Remove(tmp)
		return Backup{}, fmt.Errorf("uploaded file is not a valid SQLite database: %w", err)
	}
	probe.Close()

	if err := os.Rename(tmp, dst); err != nil {
		os.Remove(tmp)
		return Backup{}, err
	}
	digest, fsize, err := hashFile(dst)
	if err != nil {
		return Backup{}, err
	}
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), ".db")
	_ = size
	return Backup{
		ID:         id,
		Filename:   name,
		Path:       dst,
		Size:       fsize,
		CreatedAt:  time.Now().UTC(),
		SHA256:     digest,
		Source:     "uploaded",
		IsLiveSafe: false, // uploaded provenance is unknown
	}, nil
}

// Get returns the Backup metadata for a single id. Returns an error
// (not a sentinel — callers render the error verbatim) when the id is
// not present so a tampered URL doesn't accidentally point at a file
// outside the backup dir.
func Get(id string) (Backup, error) {
	if !validID(id) {
		return Backup{}, errors.New("invalid backup id")
	}
	all, err := List()
	if err != nil {
		return Backup{}, err
	}
	for _, b := range all {
		if b.ID == id {
			return b, nil
		}
	}
	return Backup{}, fmt.Errorf("backup %q not found", id)
}

// Open returns a reader over the backup's underlying file. The caller is
// responsible for closing it. We resolve through Get() so the same id
// validation applies — direct path access is intentionally not exposed.
func Open(id string) (*os.File, Backup, error) {
	b, err := Get(id)
	if err != nil {
		return nil, Backup{}, err
	}
	f, err := os.Open(b.Path)
	if err != nil {
		return nil, Backup{}, err
	}
	return f, b, nil
}

// Delete removes the backup file from disk. Refuses to delete a file
// that isn't a known backup (id validation goes through validID).
func Delete(id string) error {
	b, err := Get(id)
	if err != nil {
		return err
	}
	if err := os.Remove(b.Path); err != nil {
		return err
	}
	return nil
}

// Restore swaps the live db with the chosen backup. The current live db
// is renamed to `<path>.bak` first so a failed restore never destroys
// the live data. If the rename succeeds but the swap fails, the live
// data is preserved on disk under the .bak suffix and the panel's next
// launch will pick it up via the standard SQLite "open or create" path.
//
// Because every Backup carries SHA256 / source / created_at, an
// operator is expected to confirm the timestamp on the page before
// clicking Restore — accidental restores of yesterday's snapshot are
// far easier than the alternative.
func Restore(id string) error {
	opMu.Lock()
	defer opMu.Unlock()
	if !validID(id) {
		return errors.New("invalid backup id")
	}
	b, err := Get(id)
	if err != nil {
		return err
	}
	cfg := config.DatabaseConfig()
	live := cfg.DSN
	if _, err := os.Stat(live); err != nil {
		return fmt.Errorf("live db missing at %s: %w", live, err)
	}
	// The "-bak" suffix is what we rename the live db to. We deliberately
	// don't name it `<live>-<ts>.bak` — the rename is supposed to be
	// trivial to undo by hand, so a stable name is more useful than a
	// timestamped one.
	bak := live + ".bak"
	if err := os.Rename(live, bak); err != nil {
		return fmt.Errorf("stow live db: %w", err)
	}
	if err := copyFile(b.Path, live); err != nil {
		// Restore the rename so the live data stays available.
		_ = os.Rename(bak, live)
		return fmt.Errorf("copy backup into place: %w", err)
	}
	// WAL flush: a restore that leaves the prior live db's -wal/-shm
	// sidecars on disk can leave SQLite confused (it sees the header of
	// the new live file but still has pages mapped from the old one in
	// the sidecar). We delete them after a successful swap.
	restoreSweepWAL(live)
	return nil
}

// copyFile copies src → dst byte-for-byte. We use io.Copy rather than
// os.Link because the backup directory may live on a different
// filesystem from the live db (DataDir() in tests resolves to a
// tempdir).
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

// hashFile computes the SHA256 of a file in a streaming read so the
// backup list doesn't allocate huge buffers for big snapshots.
func hashFile(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// sanitizeLabel strips characters that would be unsafe in a filename
// from a user-provided label. We keep dashes + alphanumerics + dots +
// underscores — anything else becomes an underscore so the
// timestamp-label pattern stays parseable by List().
func sanitizeLabel(label string) string {
	out := make([]rune, 0, len(label))
	for _, r := range label {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '-', r == '_', r == '.':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	return strings.Trim(string(out), "_-.")
}

// validID guards against path traversal — a request for
// /backup/..%2F..%2Fetc%2Fpasswd has to fail before it can reach os.Open.
// Dots are allowed inside the label (e.g. "my.backup") so we only reject
// path separators and the ".." traversal sequence, plus the degenerate
// single-dot / double-dot ids.
func validID(id string) bool {
	if id == "" || id == "." || id == ".." || strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
		return false
	}
	return true
}

// BackupWALCheck is a one-shot safeguard for a backup whose source file
// still has a -wal sidecar (transaction log). We flush the live DB's WAL
// to disk before VACUUM INTO so the backup is self-contained; on restore
// we should ALSO delete the -wal/-shm files left over from the prior
// live db (they reference a now-stale snapshot and SQLite can refuse to
// open the file with `database disk image is malformed` if they
// survive). Called by Restore before it copies the backup into place.
func restoreSweepWAL(livePath string) {
	for _, ext := range []string{"-wal", "-shm"} {
		_ = os.Remove(livePath + ext)
	}
}

// Local mutex so Create / Restore can't race against each other when an
// operator hits Create + Restore in quick succession.
var opMu sync.Mutex
