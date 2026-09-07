package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/stackstore"
	"github.com/go-chi/chi/v5"
)

// stack_files.go — workdir file manager for Stacks (the Studio's Files tab
// and the Detail page's Files section).
//
//   GET  /api/stacks/{id}/files?path=<rel>  — list directory (VIEW)
//   GET  /api/stacks/{id}/files/read?path=<file> — read file JSON (VIEW)
//   GET  /api/stacks/{id}/files/download?path=<file> — download bytes (VIEW)
//   POST /api/stacks/{id}/files — mutate {op,path,content,new_path} (EDIT)
//   POST /api/stacks/{id}/files/upload — multipart files into ?path= dir (EDIT)
//
// All paths are workdir-relative ("", "/", "frontend/pages" …) and
// traversal-guarded inside stackstore. Mutations repackage the .ksps
// best-effort so downloads keep edits. Own-scope callers (STACKS_OWN
// without ALL) may only touch stacks they uploaded — fail closed like the
// rest of the stack handlers.

func loadStackForFiles(w http.ResponseWriter, r *http.Request) (*repository.StackRepository, func(), *models.Stack, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return nil, func() {}, nil, false
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return nil, func() {}, nil, false
	}
	s, err := repo.GetStack(id)
	if err != nil {
		closeFn()
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
		} else {
			http.Error(w, "server error", http.StatusInternalServerError)
		}
		return nil, func() {}, nil, false
	}
	if stackOwnBlocked(r, s) {
		closeFn()
		http.Error(w, "forbidden", http.StatusForbidden)
		return nil, func() {}, nil, false
	}
	return repo, closeFn, s, true
}

// ListStackFilesHandler lists one workdir directory.
func ListStackFilesHandler(w http.ResponseWriter, r *http.Request) {
	_, closeFn, s, ok := loadStackForFiles(w, r)
	if !ok {
		return
	}
	defer closeFn()
	rel := r.URL.Query().Get("path")
	entries, err := stackstore.ListWorkDir(s.Slug, rel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if entries == nil {
		entries = []stackstore.WorkEntry{}
	}
	writeJSON(w, map[string]any{"path": rel, "entries": entries})
}

// ReadStackFileHandler returns one file as JSON {path, content, size,
// truncated}. Binary content (NUL byte in the first 8 KiB) is refused with
// 422 so the editor never mangles it — download it instead.
func ReadStackFileHandler(w http.ResponseWriter, r *http.Request) {
	_, closeFn, s, ok := loadStackForFiles(w, r)
	if !ok {
		return
	}
	defer closeFn()
	rel := r.URL.Query().Get("path")
	if strings.TrimSpace(rel) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	raw, err := stackstore.ReadWorkFile(s.Slug, rel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for _, b := range raw[:minLen(len(raw), 8192)] {
		if b == 0 {
			http.Error(w, "binary file — download to view", http.StatusUnprocessableEntity)
			return
		}
	}
	writeJSON(w, map[string]any{
		"path":    rel,
		"content": string(raw),
		"size":    len(raw),
	})
}

func minLen(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// DownloadStackFileHandler streams one workdir file as an attachment.
func DownloadStackFileHandler(w http.ResponseWriter, r *http.Request) {
	_, closeFn, s, ok := loadStackForFiles(w, r)
	if !ok {
		return
	}
	defer closeFn()
	rel := r.URL.Query().Get("path")
	if strings.TrimSpace(rel) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	raw, err := stackstore.ReadWorkFile(s.Slug, rel)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	base := path.Base(strings.ReplaceAll(rel, "\\", "/"))
	if base == "" || base == "." || base == "/" {
		base = "file"
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, base))
	w.Header().Set("Content-Length", strconv.Itoa(len(raw)))
	_, _ = w.Write(raw)
}

type stackFileMutateDTO struct {
	Op      string `json:"op"`
	Path    string `json:"path"`
	Content string `json:"content"`
	NewPath string `json:"new_path"`
}

// MutateStackFileHandler applies one workdir mutation: write | mkdir |
// rename | delete.
func MutateStackFileHandler(w http.ResponseWriter, r *http.Request) {
	_, closeFn, s, ok := loadStackForFiles(w, r)
	if !ok {
		return
	}
	defer closeFn()
	var dto stackFileMutateDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	op := strings.ToLower(strings.TrimSpace(dto.Op))
	if strings.TrimSpace(dto.Path) == "" && op != "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	var err error
	switch op {
	case "write":
		err = stackstore.WriteWorkFile(s.Slug, dto.Path, []byte(dto.Content))
	case "mkdir":
		err = stackstore.MkdirWork(s.Slug, dto.Path)
	case "rename":
		if strings.TrimSpace(dto.NewPath) == "" {
			http.Error(w, "new_path is required", http.StatusBadRequest)
			return
		}
		err = stackstore.RenameWork(s.Slug, dto.Path, dto.NewPath)
	case "delete":
		err = stackstore.RemoveWork(s.Slug, dto.Path)
	default:
		http.Error(w, "unknown op (want write|mkdir|rename|delete)", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "update", TargetID: &s.ID,
		Message: fmt.Sprintf("stack %q files: %s %q", s.Slug, op, dto.Path),
	})
	w.WriteHeader(http.StatusNoContent)
}

// UploadStackFilesHandler stores multipart files into a workdir directory
// (?path= dir, default root). Each part is size-capped; path traversal in
// filenames is rejected by the store.
func UploadStackFilesHandler(w http.ResponseWriter, r *http.Request) {
	_, closeFn, s, ok := loadStackForFiles(w, r)
	if !ok {
		return
	}
	defer closeFn()
	r.Body = http.MaxBytesReader(w, r.Body, 33<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	dir := r.URL.Query().Get("path")
	if r.MultipartForm == nil || len(r.MultipartForm.File) == 0 {
		http.Error(w, "no files uploaded", http.StatusBadRequest)
		return
	}
	joined := 0
	for _, parts := range r.MultipartForm.File {
		for _, fh := range parts {
			if fh == nil {
				continue
			}
			f, err := fh.Open()
			if err != nil {
				continue
			}
			data, err := io.ReadAll(io.LimitReader(f, stackstore.StackFileMaxBytes+1))
			_ = f.Close()
			if err != nil {
				http.Error(w, "read upload: "+err.Error(), http.StatusBadRequest)
				return
			}
			if len(data) > stackstore.StackFileMaxBytes {
				http.Error(w, fmt.Sprintf("file %q too large (max %d KiB)", fh.Filename, stackstore.StackFileMaxBytes>>10), http.StatusRequestEntityTooLarge)
				return
			}
			name := path.Base(strings.ReplaceAll(fh.Filename, "\\", "/"))
			if name == "" || name == "." || name == ".." {
				http.Error(w, fmt.Sprintf("invalid filename %q", fh.Filename), http.StatusBadRequest)
				return
			}
			rel := name
			if strings.TrimSpace(dir) != "" && dir != "/" {
				rel = strings.Trim(strings.ReplaceAll(dir, "\\", "/"), "/") + "/" + name
			}
			if err := stackstore.WriteWorkFile(s.Slug, rel, data); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			joined++
		}
	}
	if joined == 0 {
		http.Error(w, "no files uploaded", http.StatusBadRequest)
		return
	}
	log.Printf("stack %q files: uploaded %d file(s) into %q", s.Slug, joined, dir)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "update", TargetID: &s.ID,
		Message: fmt.Sprintf("stack %q files: uploaded %d file(s)", s.Slug, joined),
	})
	writeJSON(w, map[string]any{"uploaded": joined})
}
