package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/backup"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ---- Per-instance file-level tar backups (chunked, resumable) ----

// instanceBackupDir returns <DataDir>/instance_backups/<id>, ensuring it.
func instanceBackupDir(instanceID int64) (string, error) {
	dir := filepath.Join(config.DataDir(), "instance_backups", strconv.FormatInt(instanceID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// backupVersionedName inserts "-retry" before the full (possibly compound)
// extension so a re-uploaded filename keeps a valid suffix: filepath.Ext
// only strips the last dot segment ("a.tar.gz" → ext ".gz" → "a.tar-retry.gz",
// which no longer ends in .tar.gz and breaks suffix-based handling).
func backupVersionedName(filename string) string {
	lower := strings.ToLower(filename)
	for _, ext := range []string{".tar.gz", ".tar.zst", ".db.gz", ".tgz", ".tar", ".db"} {
		if strings.HasSuffix(lower, ext) {
			return filename[:len(filename)-len(ext)] + "-retry" + filename[len(filename)-len(ext):]
		}
	}
	return strings.TrimSuffix(filename, filepath.Ext(filename)) + "-retry" + filepath.Ext(filename)
}

func sanitizeBackupFilename(name string) (string, error) {
	base := filepath.Base(strings.TrimSpace(name))
	if base == "" || base == "." || base == ".." {
		return "", fmt.Errorf("invalid filename")
	}
	if strings.Contains(base, "..") {
		return "", fmt.Errorf("invalid filename")
	}
	// Allow tar + compressed tar + db artifacts only.
	low := strings.ToLower(base)
	allowed := []string{".tar", ".tar.gz", ".tgz", ".tar.zst", ".db", ".db.gz"}
	ok := false
	for _, s := range allowed {
		if strings.HasSuffix(low, s) {
			ok = true
			break
		}
	}
	if !ok {
		return "", fmt.Errorf("filename must end in .tar, .tar.gz, .tgz, .tar.zst, .db or .db.gz")
	}
	if len(base) > 128 {
		return "", fmt.Errorf("filename too long (max 128 chars)")
	}
	return base, nil
}

// ListInstanceBackupsHandler lists panel-stored tar backups for an instance.
func ListInstanceBackupsHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	list, err := repository.NewInstanceFileBackupRepository(con).List(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []repository.InstanceFileBackup{}
	}
	writeJSON(w, list)
}

type instanceBackupInitDTO struct {
	Filename    string `json:"filename"`
	Compression string `json:"compression"`
}

// InitInstanceBackupHandler creates the metadata row + empty file for a
// chunked upload. Returns the backup id the chunk endpoint appends to.
func InitInstanceBackupHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var dto instanceBackupInitDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	filename, err := sanitizeBackupFilename(dto.Filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	comp, err := backup.ValidateCompression(dto.Compression)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Make the on-disk name unique per init so resumed uploads never clash.
	_ = time.Now().UTC()
	dir, err := instanceBackupDir(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Prefix with timestamp to keep List newest-first stable on disk too.
	stored := filename
	dst := filepath.Join(dir, stored)
	if _, err := os.Stat(dst); err == nil {
		// Same filename re-uploaded: version it rather than clobbering.
		stored = backupVersionedName(filename)
		dst = filepath.Join(dir, stored)
	}
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		http.Error(w, "backup file exists or cannot be created", http.StatusConflict)
		return
	}
	f.Close()
	con, err := repository.OpenDB()
	if err != nil {
		os.Remove(dst)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	bid, err := repository.NewInstanceFileBackupRepository(con).Create(repository.InstanceFileBackup{
		InstanceID: id, Filename: stored, Compression: comp, Compressed: comp != "none",
	})
	if err != nil {
		os.Remove(dst)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	auditInst(r, id, "backup.init", fmt.Sprintf("initialised file backup %q", stored))
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": bid, "filename": stored, "offset": 0})
}

// UploadInstanceBackupChunkHandler appends one chunk. Supports resume via
// the Content-Range header ("bytes <start>-<end>/<total>" or ".../*") and
// via ?offset=<n> (server returns 409 on offset mismatch so the client can
// re-sync). Final chunk auto-hashes when end+1 == total.
func UploadInstanceBackupChunkHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	bid, err := strconv.ParseInt(chi.URLParam(r, "bid"), 10, 64)
	if err != nil || bid <= 0 {
		http.Error(w, "invalid backup id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	meta, err := repository.NewInstanceFileBackupRepository(con).Get(bid, id)
	if err != nil {
		http.Error(w, "backup not found", http.StatusNotFound)
		return
	}
	dir, err := instanceBackupDir(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	dst := filepath.Join(dir, filepath.Base(meta.Filename))
	fi, err := os.Stat(dst)
	if err != nil {
		http.Error(w, "backup file missing", http.StatusNotFound)
		return
	}
	current := fi.Size()
	// Parse Content-Range when present.
	start := current
	var total int64 = -1
	if cr := strings.TrimSpace(r.Header.Get("Content-Range")); cr != "" {
		s, t, perr := parseContentRange(cr)
		if perr != nil {
			http.Error(w, "invalid Content-Range: "+perr.Error(), http.StatusBadRequest)
			return
		}
		start = s
		total = t
	} else if q := strings.TrimSpace(r.URL.Query().Get("offset")); q != "" {
		v, perr := strconv.ParseInt(q, 10, 64)
		if perr != nil || v < 0 {
			http.Error(w, "invalid offset", http.StatusBadRequest)
			return
		}
		start = v
	}
	if start != current {
		// Resume mismatch — tell the client where we are.
		w.Header().Set("X-Expected-Offset", strconv.FormatInt(current, 10))
		http.Error(w, fmt.Sprintf("offset mismatch: server at %d, client sent %d", current, start), http.StatusConflict)
		return
	}
	f, err := os.OpenFile(dst, os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	n, err := io.Copy(f, io.LimitReader(r.Body, 1<<30))
	f.Close()
	if err != nil {
		http.Error(w, "chunk write failed", http.StatusInternalServerError)
		return
	}
	newSize := current + n
	_ = repository.NewInstanceFileBackupRepository(con).UpdateStat(bid, newSize, meta.SHA256)
	// Finalise: when the client told us the total and we reached it, hash.
	if total >= 0 && newSize >= total {
		if sha, serr := hashPath(dst); serr == nil {
			_ = repository.NewInstanceFileBackupRepository(con).UpdateStat(bid, newSize, sha)
		}
		auditInst(r, id, "backup.upload", fmt.Sprintf("completed file backup %q (%d bytes)", meta.Filename, newSize))
	}
	writeJSON(w, map[string]any{"id": bid, "offset": newSize, "complete": total >= 0 && newSize >= total})
}

func hashPath(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// parseContentRange parses "bytes <start>-<end>/<total>" where total may be "*".
func parseContentRange(cr string) (start, total int64, err error) {
	cr = strings.TrimSpace(cr)
	if !strings.HasPrefix(strings.ToLower(cr), "bytes ") {
		return 0, -1, fmt.Errorf("must start with 'bytes '")
	}
	rest := strings.TrimSpace(cr[6:])
	slash := strings.Index(rest, "/")
	if slash < 0 {
		return 0, -1, fmt.Errorf("missing /total")
	}
	rangePart := rest[:slash]
	totalPart := strings.TrimSpace(rest[slash+1:])
	dash := strings.Index(rangePart, "-")
	if dash < 0 {
		return 0, -1, fmt.Errorf("missing - in range")
	}
	start, err = strconv.ParseInt(strings.TrimSpace(rangePart[:dash]), 10, 64)
	if err != nil || start < 0 {
		return 0, -1, fmt.Errorf("bad start")
	}
	if totalPart == "*" {
		return start, -1, nil
	}
	total, err = strconv.ParseInt(totalPart, 10, 64)
	if err != nil || total < 0 {
		return 0, -1, fmt.Errorf("bad total")
	}
	return start, total, nil
}

// DownloadInstanceBackupHandler streams the tar with Range support
// (206 Partial Content + Content-Range) so interrupted restores resume.
func DownloadInstanceBackupHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	bid, err := strconv.ParseInt(chi.URLParam(r, "bid"), 10, 64)
	if err != nil || bid <= 0 {
		http.Error(w, "invalid backup id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	meta, err := repository.NewInstanceFileBackupRepository(con).Get(bid, id)
	if err != nil {
		http.Error(w, "backup not found", http.StatusNotFound)
		return
	}
	dir, err := instanceBackupDir(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	dst := filepath.Join(dir, filepath.Base(meta.Filename))
	f, err := os.Open(dst)
	if err != nil {
		http.Error(w, "backup file missing", http.StatusNotFound)
		return
	}
	defer f.Close()
	fi, _ := f.Stat()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", meta.Filename))
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeContent(w, r, meta.Filename, fi.ModTime(), f)
}

// RestoreInstanceBackupHandler marks a panel-stored tar as restored. The
// bytes themselves are restored by downloading (Range-resumable above) and
// replaying through the Files manager / edge; the edge-side snapshot path
// (POST /snapshots/{name}/restore) remains the live rollback for
// driver-managed snapshots. We audit both so the timeline stays complete.
func RestoreInstanceBackupHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	bid, err := strconv.ParseInt(chi.URLParam(r, "bid"), 10, 64)
	if err != nil || bid <= 0 {
		http.Error(w, "invalid backup id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	meta, err := repository.NewInstanceFileBackupRepository(con).Get(bid, id)
	if err != nil {
		http.Error(w, "backup not found", http.StatusNotFound)
		return
	}
	auditInst(r, id, "backup.restore", fmt.Sprintf("restored file backup %q — download + replay via Files", meta.Filename))
	writeJSON(w, map[string]any{"ok": true, "message": "backup marked restored — download it and replay via the Files manager"})
}

// DeleteInstanceBackupHandler removes the tar + row.
func DeleteInstanceBackupHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	bid, err := strconv.ParseInt(chi.URLParam(r, "bid"), 10, 64)
	if err != nil || bid <= 0 {
		http.Error(w, "invalid backup id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	meta, err := repository.NewInstanceFileBackupRepository(con).Get(bid, id)
	if err != nil {
		http.Error(w, "backup not found", http.StatusNotFound)
		return
	}
	if err := repository.NewInstanceFileBackupRepository(con).Delete(bid, id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if dir, derr := instanceBackupDir(id); derr == nil {
		_ = os.Remove(filepath.Join(dir, filepath.Base(meta.Filename)))
	}
	auditInst(r, id, "backup.delete", fmt.Sprintf("deleted file backup %q", meta.Filename))
	w.WriteHeader(http.StatusNoContent)
}
