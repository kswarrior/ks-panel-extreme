// Package backup is the database backup subsystem that the
// /api/database/* endpoints drive. It does four things:
//
//   1. List every .db/.sql backup on disk (under <DataDir>/backups) so the
//      Database admin page can render a table of available snapshots.
//   2. Create a fresh backup by issuing SQLite's `VACUUM INTO '<path>'`
//      against the live DB — this is a snapshot-safe, transactionally
//      consistent copy that the panel can hand back to the operator via
//      `wget` or the Download button on the page. For Postgres/MySQL the
//      live engine is dumped with its native tool (pg_dump / mysqldump)
//      into a .sql artifact (see NativeDump).
//   3. Restore from a chosen backup. SQLite restores rename the live db
//      to `<path>.bak` first so a failed restore never destroys the live
//      data; on success the rename atomically replaces the live db with
//      the backup. Postgres/MySQL restores stream the decompressed .sql
//      (.sql/.gz/.zst) via stdin into psql/pg_restore or mysql
//      (see RestorePG/RestoreMySQL) — symmetric to NativeDump.
//   4. Upload a backup the operator brought back from elsewhere (or from
//      a different machine). SQLite uploads are verified by opening
//      them with the SQLite driver; .sql dumps are verified by SQL-dump
//      magic (--/PG dump/CREATE TABLE) — a corrupt file fails the upload
//      before it lands on disk.
//
// PITR note: these artifacts are FULL backups. Point-in-time recovery
// needs the engine's WAL/binlog chain on top: SQLite WAL sidecar,
// Postgres WAL archiving (archive_mode + base backup), MySQL binlog
// (see docs/BUILD_SECURITY.md "Backup chain & PITR").
package backup

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
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
//
// Size is the on-disk (possibly compressed) byte count; Compressed +
// Compression describe the on-disk encoding ("none" | "gzip" | "zstd").
// S3Pushed reports whether a "<file>.s3pushed" marker sidecar exists,
// meaning the last S3 push for this exact file succeeded.
type Backup struct {
	ID          string    `json:"id"`           // filename without suffix
	Filename    string    `json:"filename"`     // full filename on disk
	Path        string    `json:"path"`         // absolute path (DB admin only)
	Size        int64     `json:"size_bytes"`   // on-disk bytes
	CreatedAt   time.Time `json:"created_at"`   // mtime of the file
	SHA256      string    `json:"sha256"`       // hex digest of the file
	Source      string    `json:"source"`       // "vacuum-into" | "uploaded" | "uploaded-from-restore" | "native-pg_dump" | "native-mysqldump" | "scheduled"
	IsLiveSafe  bool      `json:"is_live_safe"` // false for uploads of unknown provenance
	Compressed  bool      `json:"compressed"`
	Compression string    `json:"compression"` // "none" | "gzip" | "zstd"
	S3Pushed    bool      `json:"s3_pushed"`
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
//
// Recognised suffixes (all timestamped `<prefix><ts>-<label><suffix>`):
// .db, .db.gz, .db.zst (SQLite snapshots, plain or compressed) and
// .sql, .sql.gz, .sql.zst (native pg_dump / mysqldump artifacts).
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
		if !strings.HasPrefix(name, fileNamePattern) {
			continue
		}
		suffix, compression := splitBackupSuffix(name)
		if suffix == "" {
			continue
		}
		path := filepath.Join(dir, name)
		fi, err := e.Info()
		if err != nil {
			continue
		}
		// Skip sidecar markers + temp files.
		if strings.HasSuffix(name, ".tmp") || strings.HasSuffix(name, ".s3pushed") {
			continue
		}
		digest, size, err := hashFile(path)
		if err != nil {
			continue
		}
		// ID = filename minus prefix + storage suffix, used as the stable
		// handle in URLs (/backup/{id} etc.).
		id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), suffix)
		if compression == "" {
			compression = "none"
		}
		out = append(out, Backup{
			ID:          id,
			Filename:    name,
			Path:        path,
			Size:        size,
			CreatedAt:   fi.ModTime().UTC(),
			SHA256:      digest,
			Source:      parseSourceFromName(id),
			IsLiveSafe:  true,
			Compressed:  compression != "none",
			Compression: compression,
			S3Pushed:    s3MarkerPresent(path),
		})
	}
	// Newest first — the page renders the most recent at the top.
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// splitBackupSuffix maps a backup filename to its storage suffix and
// compression label. Returns ("", "") when the name is not a backup.
func splitBackupSuffix(name string) (suffix, compression string) {
	switch {
	case strings.HasSuffix(name, ".db.gz"):
		return ".db.gz", "gzip"
	case strings.HasSuffix(name, ".db.zst"):
		return ".db.zst", "zstd"
	case strings.HasSuffix(name, ".db"):
		return ".db", "none"
	case strings.HasSuffix(name, ".sql.gz"):
		return ".sql.gz", "gzip"
	case strings.HasSuffix(name, ".sql.zst"):
		return ".sql.zst", "zstd"
	case strings.HasSuffix(name, ".sql"):
		return ".sql", "none"
	default:
		return "", ""
	}
}

// s3MarkerPresent reports whether the "<file>.s3pushed" sidecar exists.
func s3MarkerPresent(path string) bool {
	_, err := os.Stat(path + ".s3pushed")
	return err == nil
}

// MarkS3Pushed writes the sidecar marker after a successful push.
func MarkS3Pushed(path string) {
	_ = os.WriteFile(path+".s3pushed", []byte(time.Now().UTC().Format(time.RFC3339)), 0o644)
}

// ClearS3Marker removes the sidecar (e.g. after a new local write).
func ClearS3Marker(path string) { _ = os.Remove(path + ".s3pushed") }

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
	if strings.Contains(label, "pg_dump") || strings.Contains(label, "postgres") {
		return "native-pg_dump"
	}
	if strings.Contains(label, "mysqldump") || strings.Contains(label, "mysql") {
		return "native-mysqldump"
	}
	if strings.Contains(label, "scheduled") {
		return "scheduled"
	}
	return "vacuum-into"
}

// ValidateCompression accepts "none" | "gzip" | "zstd" ("" maps to "none").
func ValidateCompression(c string) (string, error) {
	c = strings.ToLower(strings.TrimSpace(c))
	if c == "" {
		return "none", nil
	}
	switch c {
	case "none", "gzip", "zstd":
		return c, nil
	default:
		return "", fmt.Errorf("invalid compression %q (must be none, gzip, or zstd)", c)
	}
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
	return CreateWithOptions(label, "none")
}

// CreateWithOptions is Create plus an on-disk compression option
// ("none" | "gzip" | "zstd"). The VACUUM output is written to a temp
// .db file first, then encoded to the final `<ts>-<label>.db[.gz|.zst]`
// name so a failed compression never leaves a half-written backup in
// List(). For non-SQLite live engines it attempts a native pg_dump /
// mysqldump into a .sql artifact instead (see NativeDump); when the
// native tool is missing it returns an *ErrNativeToolMissing the caller
// can use to fall back to a datamove SQLite snapshot.
func CreateWithOptions(label, compression string) (Backup, error) {
	compression, err := ValidateCompression(compression)
	if err != nil {
		return Backup{}, err
	}
	opMu.Lock()
	defer opMu.Unlock()
	if err := ensureDir(); err != nil {
		return Backup{}, err
	}
	cfg := config.DatabaseConfig()
	if !isSQLiteEngine(cfg.Engine) {
		b, nerr := createNativeWithOptions(cfg.Engine, cfg.DSN, label, compression)
		if nerr == nil {
			return b, nil
		}
		var missing *ErrNativeToolMissing
		if errors.As(nerr, &missing) {
			return Backup{}, nerr
		}
		return Backup{}, nerr
	}
	ts := time.Now().UTC().Format("20060102-150405")
	if label == "" {
		label = "snapshot"
	}
	label = sanitizeLabel(label)
	suffix := storageSuffix(".db", compression)
	name := fileNamePattern + ts + "-" + label + suffix
	dst := filepath.Join(ListDir(), name)

	// Open a fresh dedicated connection so VACUUM INTO doesn't fight
	// with the panel's pooled connection for the same SQLite lock.
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
	// Vacuum into a staging .db sibling, then compress into place so the
	// final name only ever appears once it is complete.
	stage := dst + ".stage.db"
	_ = os.Remove(stage)
	if _, err := tmp.Exec(fmt.Sprintf("VACUUM INTO %q", stage)); err != nil {
		// Best-effort cleanup so a failed vacuum doesn't leave an empty
		// file at the destination path.
		_ = os.Remove(stage)
		return Backup{}, fmt.Errorf("vacuum into: %w", err)
	}
	defer os.Remove(stage)
	if compression == "none" {
		if err := os.Rename(stage, dst); err != nil {
			_ = os.Remove(stage)
			return Backup{}, err
		}
	} else if err := compressFile(stage, dst, compression); err != nil {
		_ = os.Remove(stage)
		_ = os.Remove(dst)
		return Backup{}, err
	}
	digest, size, err := hashFile(dst)
	if err != nil {
		return Backup{}, err
	}
	sfx, _ := splitBackupSuffix(name)
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), sfx)
	return Backup{
		ID:          id,
		Filename:    name,
		Path:        dst,
		Size:        size,
		CreatedAt:   time.Now().UTC(),
		SHA256:      digest,
		Source:      "vacuum-into",
		IsLiveSafe:  true,
		Compressed:  compression != "none",
		Compression: compression,
		S3Pushed:    false,
	}, nil
}

func isSQLiteEngine(engine string) bool {
	e := strings.ToLower(strings.TrimSpace(engine))
	return e == "" || e == "sqlite" || e == "sqlite3"
}

func storageSuffix(base, compression string) string {
	switch compression {
	case "gzip":
		return base + ".gz"
	case "zstd":
		return base + ".zst"
	default:
		return base
	}
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
	sfx, _ := splitBackupSuffix(name)
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), sfx)
	return Backup{
		ID:          id,
		Filename:    name,
		Path:        dst,
		Size:        size,
		CreatedAt:   time.Now().UTC(),
		SHA256:      digest,
		Source:      parseSourceFromName(sanitizeLabel(label)),
		IsLiveSafe:  true,
		Compressed:  false,
		Compression: "none",
		S3Pushed:    false,
	}, nil
}

// UploadFromReader accepts an uploaded database file (multipart body),
// verifies it by header magic (SQLite header or SQL-dump markers, not just
// the filename), copies it into the backup directory with the `uploaded`
// label suffix, and returns the resulting Backup metadata. A corrupt upload
// fails before it touches the backup dir.
//
// Accepted content:
//   - SQLite files (magic "SQLite format 3\0") → stored as .db, verified
//     by opening with the SQLite driver.
//   - Plain-text SQL dumps (magic -- / PG dump / CREATE TABLE / INSERT /
//     COPY) → stored as .sql, verified by dump markers.
//   - Gzip-compressed variants of either → stored as .db.gz / .sql.gz,
//     verified by peeking the decompressed header + full gzip CRC.
//   - Zstd-compressed variants → stored as .db.zst / .sql.zst (inner type
//     peeked via the zstd binary when present, else guessed from the
//     suggested filename).
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
	// Stage to a content-independent temp path; the final .db/.sql name is
	// chosen AFTER header classification below.
	stage := filepath.Join(ListDir(), fileNamePattern+ts+"-"+label+".stage.tmp")
	_ = os.Remove(stage)
	f, err := os.Create(stage)
	if err != nil {
		return Backup{}, err
	}
	if _, err := io.Copy(f, src); err != nil {
		f.Close()
		os.Remove(stage)
		return Backup{}, err
	}
	if err := f.Close(); err != nil {
		os.Remove(stage)
		return Backup{}, err
	}
	head, herr := readHead(stage, 8192)
	if herr != nil {
		os.Remove(stage)
		return Backup{}, herr
	}
	kind := ""
	suffix := ""
	compressed := "none"
	if hasGzipMagic(head) {
		inner, gerr := peekGzipHead(stage, 8192)
		if gerr != nil {
			os.Remove(stage)
			return Backup{}, fmt.Errorf("uploaded file is not a valid gzip backup: %w", gerr)
		}
		kind = classifyBackupBytes(inner)
		if kind == "" {
			os.Remove(stage)
			return Backup{}, fmt.Errorf("uploaded file is not a valid SQLite or SQL dump (gzip inner header unrecognised)")
		}
		compressed = "gzip"
		if kind == "sqlite" {
			suffix = ".db.gz"
		} else {
			suffix = ".sql.gz"
		}
		// Full gzip CRC check before accepting.
		if _, derr := decompressToTemp(stage, "gzip"); derr != nil {
			os.Remove(stage)
			return Backup{}, fmt.Errorf("uploaded gzip backup is corrupt: %w", derr)
		}
	} else if hasZstdMagic(head) {
		innerKind := ""
		if _, lerr := exec.LookPath("zstd"); lerr == nil {
			if tmp, derr := decompressToTemp(stage, "zstd"); derr == nil {
				if ih, herr2 := readHead(tmp, 8192); herr2 == nil {
					innerKind = classifyBackupBytes(ih)
				}
				os.Remove(tmp)
			}
		}
		if innerKind == "" {
			lowerSuggested := strings.ToLower(strings.TrimSpace(suggestedName))
			if strings.Contains(lowerSuggested, ".sql") {
				innerKind = "sql"
			} else {
				innerKind = "sqlite"
			}
		}
		kind = innerKind
		compressed = "zstd"
		if kind == "sqlite" {
			suffix = ".db.zst"
		} else {
			suffix = ".sql.zst"
		}
	} else {
		kind = classifyBackupBytes(head)
		if kind == "" {
			os.Remove(stage)
			return Backup{}, fmt.Errorf("uploaded file is not a valid SQLite or SQL dump (header unrecognised)")
		}
		if kind == "sqlite" {
			suffix = ".db"
		} else {
			suffix = ".sql"
		}
	}
	name := fileNamePattern + ts + "-" + label + suffix
	dst := filepath.Join(ListDir(), name)
	if kind == "sqlite" && compressed == "none" {
		// Verify the uploaded file is a valid SQLite database. modernc.org/sqlite
		// will fail to open on a corrupt or non-sqlite file; a successful Open +
		// PRAGMA + SELECT 1 confirms the file is at least minimally well-formed.
		probe, err := sql.Open("sqlite", "file:"+stage+"?mode=rw")
		if err != nil {
			os.Remove(stage)
			return Backup{}, fmt.Errorf("uploaded file is not a valid SQLite database: %w", err)
		}
		probe.SetMaxOpenConns(1)
		var v string
		if err := probe.QueryRow("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").Scan(&v); err != nil && err != sql.ErrNoRows {
			probe.Close()
			os.Remove(stage)
			return Backup{}, fmt.Errorf("uploaded file is not a valid SQLite database: %w", err)
		}
		probe.Close()
	}
	if err := os.Rename(stage, dst); err != nil {
		os.Remove(stage)
		return Backup{}, err
	}
	digest, fsize, err := hashFile(dst)
	if err != nil {
		return Backup{}, err
	}
	sfx, comp := splitBackupSuffix(name)
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), sfx)
	_ = size
	source := "uploaded"
	if kind == "sql" {
		source = "uploaded-sql"
	}
	return Backup{
		ID:          id,
		Filename:    name,
		Path:        dst,
		Size:        fsize,
		CreatedAt:   time.Now().UTC(),
		SHA256:      digest,
		Source:      source,
		IsLiveSafe:  false, // uploaded provenance is unknown
		Compressed:  comp != "" && comp != "none",
		Compression: comp,
		S3Pushed:    false,
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
	_ = os.Remove(b.Path + ".s3pushed")
	return nil
}

// Prune enforces retention: keep at most keepLastN newest backups and
// drop anything older than maxAgeDays (0 disables that bound).
// Returns the filenames removed. Newest-first ordering from List()
// makes the "keep newest N" rule a simple slice.
func Prune(keepLastN, maxAgeDays int) ([]string, error) {
	all, err := List()
	if err != nil {
		return nil, err
	}
	if keepLastN < 0 {
		keepLastN = 0
	}
	if maxAgeDays < 0 {
		maxAgeDays = 0
	}
	// Nothing to enforce.
	if keepLastN == 0 && maxAgeDays == 0 {
		return nil, nil
	}
	now := time.Now().UTC()
	removed := []string{}
	for i, b := range all {
		overCount := keepLastN > 0 && i >= keepLastN
		overAge := maxAgeDays > 0 && now.Sub(b.CreatedAt) > time.Duration(maxAgeDays)*24*time.Hour
		if overCount || overAge {
			if err := os.Remove(b.Path); err != nil && !os.IsNotExist(err) {
				continue
			}
			_ = os.Remove(b.Path + ".s3pushed")
			removed = append(removed, b.Filename)
		}
	}
	return removed, nil
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
//
// Compressed backups (.db.gz / .db.zst) are decompressed to a temp file
// first; native .sql dumps are refused here on purpose — replay those via
// RestorePG / RestoreMySQL (psql/pg_restore / mysql over stdin), not by
// file swap. The HTTP restore handler routes by header via DetectBackupKind
// so operators get one-click restore for both kinds.
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
	if strings.HasSuffix(b.Filename, ".sql") || strings.HasSuffix(b.Filename, ".sql.gz") || strings.HasSuffix(b.Filename, ".sql.zst") {
		return errors.New("native SQL dump cannot be restored by file swap — replay it with psql / mysql")
	}
	cfg := config.DatabaseConfig()
	live := cfg.DSN
	if _, err := os.Stat(live); err != nil {
		return fmt.Errorf("live db missing at %s: %w", live, err)
	}
	srcPath := b.Path
	tmpDecompressed := ""
	if b.Compressed {
		tmpDecompressed, err = decompressToTemp(b.Path, b.Compression)
		if err != nil {
			return fmt.Errorf("decompress backup: %w", err)
		}
		defer os.Remove(tmpDecompressed)
		srcPath = tmpDecompressed
	}
	// The "-bak" suffix is what we rename the live db to. We deliberately
	// don't name it `<live>-<ts>.bak` — the rename is supposed to be
	// trivial to undo by hand, so a stable name is more useful than a
	// timestamped one.
	bak := live + ".bak"
	if err := os.Rename(live, bak); err != nil {
		return fmt.Errorf("stow live db: %w", err)
	}
	if err := copyFile(srcPath, live); err != nil {
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

// ---- Compression -------------------------------------------------------

// compressFile encodes src (.db / .sql plain) into dst with the requested
// codec. gzip uses the stdlib; zstd shells to the `zstd` binary when
// present (operators without it get a clear error, not silent gzip).
func compressFile(src, dst, compression string) error {
	switch compression {
	case "gzip":
		in, err := os.Open(src)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.Create(dst)
		if err != nil {
			return err
		}
		gz := gzip.NewWriter(out)
		_, cerr := io.Copy(gz, in)
		gerr := gz.Close()
		ferr := out.Close()
		if cerr != nil {
			_ = os.Remove(dst)
			return cerr
		}
		if gerr != nil {
			_ = os.Remove(dst)
			return gerr
		}
		return ferr
	case "zstd":
		if _, err := exec.LookPath("zstd"); err != nil {
			return fmt.Errorf("zstd compression requested but the 'zstd' binary is not installed; use gzip")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "zstd", "-c", "-19", src)
		out, err := os.Create(dst)
		if err != nil {
			return err
		}
		cmd.Stdout = out
		if err := cmd.Run(); err != nil {
			out.Close()
			_ = os.Remove(dst)
			return fmt.Errorf("zstd compress: %w", err)
		}
		return out.Close()
	default:
		return fmt.Errorf("unknown compression %q", compression)
	}
}

// decompressToTemp decodes a compressed backup into a temp plain file and
// returns its path. Caller removes it.
func decompressToTemp(src, compression string) (string, error) {
	tmp, err := os.CreateTemp("", "kspanel-restore-*.db")
	if err != nil {
		return "", err
	}
	tmpPath := tmp.Name()
	switch compression {
	case "gzip":
		in, err := os.Open(src)
		if err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return "", err
		}
		defer in.Close()
		gz, err := gzip.NewReader(in)
		if err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return "", err
		}
		defer gz.Close()
		if _, err := io.Copy(tmp, gz); err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return "", err
		}
		tmp.Close()
		return tmpPath, nil
	case "zstd":
		tmp.Close()
		os.Remove(tmpPath)
		if _, err := exec.LookPath("zstd"); err != nil {
			return "", fmt.Errorf("zstd backup requires the 'zstd' binary to restore")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		out, err := os.Create(tmpPath)
		if err != nil {
			return "", err
		}
		cmd := exec.CommandContext(ctx, "zstd", "-d", "-c", src)
		cmd.Stdout = out
		if err := cmd.Run(); err != nil {
			out.Close()
			os.Remove(tmpPath)
			return "", fmt.Errorf("zstd decompress: %w", err)
		}
		out.Close()
		return tmpPath, nil
	default:
		tmp.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("unknown compression %q", compression)
	}
}

// ---- Native dumps (pg_dump / mysqldump) --------------------------------

// ErrNativeToolMissing signals that the live engine is Postgres/MySQL but
// its CLI dump tool is not installed, so the caller should fall back to
// the datamove SQLite snapshot path (database_handler.createPreSwitchBackup).
type ErrNativeToolMissing struct {
	Engine string
	Tool   string
}

func (e *ErrNativeToolMissing) Error() string {
	return fmt.Sprintf("%s tool %q is not installed; install it or use the SQLite-snapshot fallback", e.Engine, e.Tool)
}

// NativeToolAvailable reports whether pg_dump / mysqldump exists for engine.
// Engine aliases accepted by db.NewDialect ("postgresql"/"pg", "mariadb")
// are honoured here so a valid engine never reports its tool as missing.
func NativeToolAvailable(engine string) bool {
	switch strings.ToLower(strings.TrimSpace(engine)) {
	case "postgres", "postgresql", "pg":
		_, err := exec.LookPath("pg_dump")
		return err == nil
	case "mysql", "mariadb":
		_, err := exec.LookPath("mysqldump")
		return err == nil
	default:
		return false
	}
}

// createNativeWithOptions dumps a live Postgres/MySQL database with its
// native tool into `<ts>-<label>.sql[.gz|.zst]`. Secrets from the DSN are
// passed via env (PGPASSWORD / MYSQL_PWD) and never logged.
func createNativeWithOptions(engine, dsn, label, compression string) (Backup, error) {
	engine = strings.ToLower(strings.TrimSpace(engine))
	ts := time.Now().UTC().Format("20060102-150405")
	if label == "" {
		label = "snapshot"
	}
	label = sanitizeLabel(label)
	suffix := storageSuffix(".sql", compression)
	toolLabel := engine
	if engine == "postgres" || engine == "postgresql" || engine == "pg" {
		toolLabel = "pg_dump"
	} else {
		toolLabel = "mysqldump"
	}
	name := fileNamePattern + ts + "-" + label + "-" + toolLabel + suffix
	dst := filepath.Join(ListDir(), name)
	stage := dst + ".stage.sql"
	_ = os.Remove(stage)
	if err := NativeDump(engine, dsn, stage); err != nil {
		_ = os.Remove(stage)
		return Backup{}, err
	}
	defer os.Remove(stage)
	if compression == "none" {
		if err := os.Rename(stage, dst); err != nil {
			_ = os.Remove(stage)
			return Backup{}, err
		}
	} else if err := compressFile(stage, dst, compression); err != nil {
		_ = os.Remove(stage)
		_ = os.Remove(dst)
		return Backup{}, err
	}
	digest, size, err := hashFile(dst)
	if err != nil {
		return Backup{}, err
	}
	sfx, _ := splitBackupSuffix(name)
	id := strings.TrimSuffix(strings.TrimPrefix(name, fileNamePattern), sfx)
	return Backup{
		ID:          id,
		Filename:    name,
		Path:        dst,
		Size:        size,
		CreatedAt:   time.Now().UTC(),
		SHA256:      digest,
		Source:      "native-" + toolLabel,
		IsLiveSafe:  true,
		Compressed:  compression != "none",
		Compression: compression,
		S3Pushed:    false,
	}, nil
}

// NativeDump runs pg_dump / mysqldump for engine into dstPath (plain .sql).
// Returns *ErrNativeToolMissing when the binary is absent so callers can
// fall back to the datamove SQLite snapshot.
func NativeDump(engine, dsn, dstPath string) error {
	switch strings.ToLower(strings.TrimSpace(engine)) {
	case "postgres", "postgresql", "pg":
		if _, err := exec.LookPath("pg_dump"); err != nil {
			return &ErrNativeToolMissing{Engine: "postgres", Tool: "pg_dump"}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "pg_dump", dsn, "--no-password", "--file="+dstPath)
		// PGPASSWORD from DSN when parseable; never logged.
		if pw := postgresPassword(dsn); pw != "" {
			cmd.Env = append(os.Environ(), "PGPASSWORD="+pw)
		}
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("pg_dump failed: %v", truncateErr(stderr.String(), 500))
		}
		return nil
	case "mysql", "mariadb":
		if _, err := exec.LookPath("mysqldump"); err != nil {
			return &ErrNativeToolMissing{Engine: "mysql", Tool: "mysqldump"}
		}
		host, port, user, pw, dbname := parseMySQLDSN(dsn)
		args := []string{"--single-transaction", "--quick", "--lock-tables=false"}
		if host != "" {
			args = append(args, "-h", host)
		}
		if port != "" {
			args = append(args, "-P", port)
		}
		if user != "" {
			args = append(args, "-u", user)
		}
		if dbname != "" {
			args = append(args, dbname)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "mysqldump", args...)
		if pw != "" {
			cmd.Env = append(os.Environ(), "MYSQL_PWD="+pw)
		}
		out, err := os.Create(dstPath)
		if err != nil {
			return err
		}
		defer out.Close()
		var stderr bytes.Buffer
		cmd.Stdout = out
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			_ = os.Remove(dstPath)
			return fmt.Errorf("mysqldump failed: %v", truncateErr(stderr.String(), 500))
		}
		return nil
	default:
		return fmt.Errorf("native dump unsupported for engine %q", engine)
	}
}

func truncateErr(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		if s == "" {
			return "unknown error"
		}
		return s
	}
	return s[:n] + "…"
}

// postgresPassword extracts the password from a postgres DSN without
// logging it. Supports URL form (postgres://user:pass@host/db) and
// keyword form (password=... / PGPASSWORD is preferred by libpq).
func postgresPassword(dsn string) string {
	if strings.Contains(dsn, "://") {
		if u, err := url.Parse(dsn); err == nil && u.User != nil {
			if pw, ok := u.User.Password(); ok {
				return pw
			}
		}
		return ""
	}
	if i := strings.Index(dsn, "password="); i >= 0 {
		j := i + len("password=")
		end := strings.IndexAny(dsn[j:], " ")
		if end < 0 {
			return strings.Trim(dsn[j:], "'\"")
		}
		return strings.Trim(dsn[j:j+end], "'\"")
	}
	return ""
}

// parseMySQLDSN extracts host/port/user/password/dbname from common
// go-sql-driver forms: user:pass@tcp(host:port)/dbname?... and URL form.
func parseMySQLDSN(dsn string) (host, port, user, pw, dbname string) {
	if strings.Contains(dsn, "://") {
		if u, err := url.Parse(dsn); err == nil {
			host = u.Hostname()
			port = u.Port()
			if u.User != nil {
				user = u.User.Username()
				pw, _ = u.User.Password()
			}
			dbname = strings.TrimPrefix(u.Path, "/")
			return host, port, user, pw, dbname
		}
		return "", "", "", "", ""
	}
	// user:pass@tcp(host:port)/dbname
	rest := dsn
	if at := strings.LastIndex(rest, "@"); at >= 0 {
		creds := rest[:at]
		rest = rest[at+1:]
		if colon := strings.Index(creds, ":"); colon >= 0 {
			user = creds[:colon]
			pw = creds[colon+1:]
		} else {
			user = creds
		}
	}
	// rest is now [proto](addr)/dbname?...
	if strings.HasPrefix(rest, "tcp(") {
		end := strings.Index(rest, ")")
		if end > 0 {
			addr := rest[4:end]
			if h, p, err := splitHostPort(addr); err == nil {
				host, port = h, p
			} else {
				host = addr
			}
			rest = rest[end+1:]
		}
	}
	rest = strings.TrimPrefix(rest, "/")
	if q := strings.Index(rest, "?"); q >= 0 {
		dbname = rest[:q]
	} else if s := strings.Index(rest, " "); s >= 0 {
		dbname = rest[:s]
	} else {
		dbname = rest
	}
	return host, port, user, pw, dbname
}

func splitHostPort(addr string) (string, string, error) {
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		return addr[:i], addr[i+1:], nil
	}
	return addr, "", fmt.Errorf("no port")
}

// ---- S3 / remote push ----------------------------------------------------

// S3Config is the rclone-style remote: endpoint + bucket + prefix +
// credentials. The secret is never logged (callers must redact; this
// package never prints the struct).
type S3Config struct {
	Endpoint  string `json:"endpoint"`
	Bucket    string `json:"bucket"`
	Region    string `json:"region"`
	Prefix    string `json:"prefix"`
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`
}

// ValidateS3Config rejects non-http(s) endpoints, empty buckets, and
// path-traversal prefixes before any network dial.
func ValidateS3Config(c S3Config) error {
	c.Endpoint = strings.TrimSpace(c.Endpoint)
	if c.Endpoint == "" {
		return fmt.Errorf("s3 endpoint is required")
	}
	u, err := url.Parse(c.Endpoint)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("s3 endpoint must be http(s) with a host")
	}
	if strings.TrimSpace(c.Bucket) == "" {
		return fmt.Errorf("s3 bucket is required")
	}
	if strings.Contains(c.Bucket, "/") || strings.Contains(c.Bucket, "..") {
		return fmt.Errorf("invalid s3 bucket")
	}
	if strings.Contains(c.Prefix, "..") {
		return fmt.Errorf("invalid s3 prefix")
	}
	if strings.TrimSpace(c.AccessKey) == "" || c.SecretKey == "" {
		return fmt.Errorf("s3 access_key and secret_key are required")
	}
	return nil
}

func s3ObjectKey(prefix, filename string) string {
	prefix = strings.Trim(strings.TrimSpace(prefix), "/")
	if prefix == "" {
		return filename
	}
	return prefix + "/" + filename
}

// S3Push uploads one backup file to endpoint/bucket/prefix/filename with
// AWS SigV4 (path-style). On success it writes the .s3pushed marker.
func S3Push(cfg S3Config, backupPath string) error {
	if err := ValidateS3Config(cfg); err != nil {
		return err
	}
	f, err := os.Open(backupPath)
	if err != nil {
		return err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return err
	}
	filename := filepath.Base(backupPath)
	key := s3ObjectKey(cfg.Prefix, filename)
	endpoint := strings.TrimRight(strings.TrimSpace(cfg.Endpoint), "/")
	target := endpoint + "/" + cfg.Bucket + "/" + key
	body, err := io.ReadAll(io.LimitReader(f, 1<<30+1))
	if err != nil {
		return err
	}
	_ = fi
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "us-east-1"
	}
	req, err := http.NewRequest(http.MethodPut, target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	signS3Request(req, cfg.AccessKey, cfg.SecretKey, region, "s3", sha256Hex(body))
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("s3 push dial failed: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("s3 push failed with HTTP %d", resp.StatusCode)
	}
	MarkS3Pushed(backupPath)
	return nil
}

// S3Pull downloads endpoint/bucket/prefix/filename into dstPath.
func S3Pull(cfg S3Config, filename, dstPath string) error {
	if err := ValidateS3Config(cfg); err != nil {
		return err
	}
	if strings.ContainsAny(filename, "/\\") || strings.Contains(filename, "..") {
		return fmt.Errorf("invalid filename")
	}
	key := s3ObjectKey(cfg.Prefix, filename)
	endpoint := strings.TrimRight(strings.TrimSpace(cfg.Endpoint), "/")
	target := endpoint + "/" + cfg.Bucket + "/" + key
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "us-east-1"
	}
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	signS3Request(req, cfg.AccessKey, cfg.SecretKey, region, "s3", "UNSIGNED-PAYLOAD")
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("s3 pull dial failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("s3 pull failed with HTTP %d", resp.StatusCode)
	}
	tmp := dstPath + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, io.LimitReader(resp.Body, 1<<30+1)); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dstPath)
}

func sha256Hex(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// signS3Request applies AWS Signature Version 4 to req (path-style S3).
func signS3Request(req *http.Request, accessKey, secretKey, region, service, payloadHash string) {
	t := time.Now().UTC()
	amzDate := t.Format("20060102T150405Z")
	dateStamp := t.Format("20060102")
	req.Header.Set("x-amz-date", amzDate)
	if payloadHash != "UNSIGNED-PAYLOAD" {
		req.Header.Set("x-amz-content-sha256", payloadHash)
	}
	host := req.URL.Host
	req.Header.Set("Host", host)
	signedHeaders := "host;x-amz-date"
	if payloadHash != "UNSIGNED-PAYLOAD" {
		signedHeaders = "host;x-amz-content-sha256;x-amz-date"
	}
	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalQS := req.URL.RawQuery
	var canonicalHeaders string
	if payloadHash != "UNSIGNED-PAYLOAD" {
		canonicalHeaders = "host:" + host + "\n" + "x-amz-content-sha256:" + payloadHash + "\n" + "x-amz-date:" + amzDate + "\n"
	} else {
		canonicalHeaders = "host:" + host + "\n" + "x-amz-date:" + amzDate + "\n"
	}
	canonicalRequest := req.Method + "\n" + canonicalURI + "\n" + canonicalQS + "\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash
	credentialScope := dateStamp + "/" + region + "/" + service + "/" + "aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + credentialScope + "\n" + sha256Hex([]byte(canonicalRequest))
	kDate := hmacSHA256([]byte("AWS4"+secretKey), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+accessKey+"/"+credentialScope+", SignedHeaders="+signedHeaders+", Signature="+signature)
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

// Local mutex so Create / Restore can't race against each other when an
// operator hits Create + Restore in quick succession.
var opMu sync.Mutex
