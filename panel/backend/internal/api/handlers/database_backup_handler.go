package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/kspanel/internal/backup"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ListDatabaseBackupsHandler returns the list of database backups (newest first).
// The response shape is exactly []backup.Backup; the SPA renders it as the
// table rows in the Database → Backup tab.
func ListDatabaseBackupsHandler(w http.ResponseWriter, r *http.Request) {
	list, err := backup.List()
	if err != nil {
		log.Println("ListDatabaseBackups error:", err)
		http.Error(w, "could not list backups", http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []backup.Backup{}
	}
	writeJSON(w, list)
}

// createBackupDTO is the body for POST /api/database/backups.
type createBackupDTO struct {
	Name string `json:"name"`
}

// CreateDatabaseBackupHandler creates a new named backup via VACUUM INTO.
// On non-SQLite engines it returns 400 with an explanatory message.
func CreateDatabaseBackupHandler(w http.ResponseWriter, r *http.Request) {
	var dto createBackupDTO
	body, _ := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if len(body) > 0 {
		if err := json.Unmarshal(body, &dto); err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
	}
	name := strings.TrimSpace(dto.Name)
	if name == "" {
		name = "snapshot"
	}
	// Length guard: sanitized label forms part of the on-disk filename; a
	// gigantic label would make an unwieldy path and hit OS limits.
	if len(name) > 64 {
		http.Error(w, "backup name too long (max 64 chars)", http.StatusBadRequest)
		return
	}
	b, err := backup.Create(name)
	if err != nil {
		// VACUUM INTO fails loudly on a non-SQLite live DB or on disk
		// pressure — surface the driver error verbatim (it never contains
		// secrets; the DSN is not part of this path).
		log.Println("CreateDatabaseBackup error:", err)
		http.Error(w, "create backup failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "backup_create",
		TargetLabel: b.Filename,
		Message:     fmt.Sprintf("created database backup %q (%d bytes) by user %d", b.Filename, b.Size, uid),
	})
	writeJSONStatus(w, http.StatusCreated, b)
}

// DownloadDatabaseBackupHandler streams the raw SQLite file for the given id.
// Content-Disposition is set so the browser's download lands with the real
// filename rather than the opaque id.
func DownloadDatabaseBackupHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		http.Error(w, "backup id is required", http.StatusBadRequest)
		return
	}
	f, meta, err := backup.Open(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", meta.Filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", meta.Size))
	http.ServeContent(w, r, meta.Filename, meta.CreatedAt, f)
}

// UploadDatabaseBackupHandler accepts a multipart file upload (field "file")
// and stores it as a new backup entry after verifying it is a valid SQLite
// database. Max size is bounded by DynamicMaxBodySize (1 GiB for this prefix).
func UploadDatabaseBackupHandler(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(1 << 30); err != nil {
		http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		// Accept alternative field name "backup" for ergonomics.
		file, hdr, err = r.FormFile("backup")
		if err != nil {
			http.Error(w, "missing 'file' part", http.StatusBadRequest)
			return
		}
	}
	defer file.Close()
	// hdr.Size may be 0 for chunked uploads; we don't trust it for
	// validation — UploadFromReader streams and verifies via SQLite open.
	b, uerr := backup.UploadFromReader(file, hdr.Size, hdr.Filename)
	if uerr != nil {
		log.Println("UploadDatabaseBackup error:", uerr)
		http.Error(w, "upload failed: "+uerr.Error(), http.StatusBadRequest)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "backup_upload",
		TargetLabel: b.Filename,
		Message:     fmt.Sprintf("uploaded database backup %q (%d bytes) by user %d", b.Filename, b.Size, uid),
	})
	writeJSONStatus(w, http.StatusCreated, b)
}

// uploadBackupURLDTO is the body for POST /api/database/backups/upload/url.
type uploadBackupURLDTO struct {
	URL string `json:"url"`
}

// UploadDatabaseBackupURLHandler fetches a remote SQLite file via an
// SSRF-hardened GET and stores it as a backup. The URL must be http(s) and
// resolve to public IPs only.
func UploadDatabaseBackupURLHandler(w http.ResponseWriter, r *http.Request) {
	var dto uploadBackupURLDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(dto.URL) == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}
	u, body, _, ferr := fetchBackupFromURL(r.Context(), dto.URL)
	if ferr != nil {
		var ue *backupAllowedURLError
		if errors.As(ferr, &ue) {
			http.Error(w, ue.reason, ue.status)
			return
		}
		log.Println("UploadDatabaseBackupURL fetch error:", ferr)
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}
	// Derive a suggested filename from the URL path so the backup's
	// label is traceable (e.g. https://example.com/my.db → my.db).
	suggested := ""
	if u != nil && u.Path != "" {
		suggested = u.Path
		if idx := strings.LastIndex(suggested, "/"); idx >= 0 {
			suggested = suggested[idx+1:]
		}
	}
	b, uerr := backup.UploadFromReader(bytes.NewReader(body), int64(len(body)), suggested)
	if uerr != nil {
		log.Println("UploadDatabaseBackupURL store error:", uerr)
		http.Error(w, "upload from URL failed: "+uerr.Error(), http.StatusBadRequest)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "backup_upload_url",
		TargetLabel: b.Filename,
		Message:     fmt.Sprintf("uploaded database backup %q from URL %s (%d bytes) by user %d", b.Filename, dto.URL, b.Size, uid),
	})
	writeJSONStatus(w, http.StatusCreated, b)
}

// RestoreDatabaseBackupHandler swaps the live database file with the chosen
// backup. The current live file is stowed as <path>.bak first so a failed
// restore never destroys data. On success the panel should be restarted
// (the SQLite file changed underneath the pool).
func RestoreDatabaseBackupHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		http.Error(w, "backup id is required", http.StatusBadRequest)
		return
	}
	if err := backup.Restore(id); err != nil {
		log.Println("RestoreDatabaseBackup error:", err)
		// Get returns 404 for unknown ids; Restore wraps other io errors.
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "invalid backup id") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, "restore failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "backup_restore",
		TargetLabel: id,
		Message:     fmt.Sprintf("restored database from backup %q by user %d — restart required", id, uid),
	})
	writeJSON(w, map[string]any{
		"ok":      true,
		"message": "database restored from backup " + id + " — restart kspanel to apply",
	})
}

// DeleteDatabaseBackupHandler removes the backup file from disk.
func DeleteDatabaseBackupHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		http.Error(w, "backup id is required", http.StatusBadRequest)
		return
	}
	if err := backup.Delete(id); err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "invalid backup id") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, "delete failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "backup_delete",
		TargetLabel: id,
		Message:     fmt.Sprintf("deleted database backup %q by user %d", id, uid),
	})
	w.WriteHeader(http.StatusNoContent)
}

// ---- SSRF-hardened URL fetch for backup uploads -----------------------

const (
	backupURLFetchMaxBytes    = 512 << 20 // 512 MiB
	backupURLFetchTimeout     = 60 * time.Second
	backupURLFetchDNSTimeout  = 10 * time.Second
	backupURLFetchDialTimeout = 30 * time.Second
)

type backupAllowedURLError struct {
	status int
	reason string
}

func (e *backupAllowedURLError) Error() string { return e.reason }

func fetchBackupFromURL(ctx context.Context, raw string) (*url.URL, []byte, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadRequest, "URL must use http or https"}
	}
	if u.Host == "" {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	host := u.Hostname()
	if host == "" {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(ctx, backupURLFetchDNSTimeout)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadGateway, "could not resolve host: " + host}
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !backupIsPublicIP(ip) {
			which := ""
			if ip != nil {
				which = " (" + ip.String() + ")"
			}
			return nil, nil, "", &backupAllowedURLError{
				http.StatusBadRequest,
				fmt.Sprintf("refusing to fetch %s: host resolves to a non-public address%s; only public hosts are allowed", host, which),
			}
		}
	}
	dialCtx, cancelDial := context.WithTimeout(ctx, backupURLFetchTimeout)
	defer cancelDial()
	port := backupPortFromHost(u)
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: backupURLFetchDialTimeout,
		TLSHandshakeTimeout:   backupURLFetchDialTimeout,
		IdleConnTimeout:       backupURLFetchDialTimeout,
		DialContext: func(_ context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ipa := range ips {
				addr := net.JoinHostPort(ipa.IP.String(), port)
				conn, derr := (&net.Dialer{Timeout: backupURLFetchDialTimeout}).DialContext(dialCtx, network, addr)
				if derr == nil {
					return conn, nil
				}
				lastErr = derr
			}
			return nil, lastErr
		},
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: backupURLFetchTimeout}
	req, err := http.NewRequestWithContext(dialCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	req.Header.Set("User-Agent", "kspanel-backup-uploader/1.0")
	req.Header.Set("Accept", "application/octet-stream, */*;q=0.1")
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadGateway, "fetch failed: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, "", &backupAllowedURLError{
			http.StatusBadGateway,
			fmt.Sprintf("origin returned HTTP %d for %s", resp.StatusCode, u.String()),
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, backupURLFetchMaxBytes+1))
	if err != nil {
		return nil, nil, "", &backupAllowedURLError{http.StatusBadGateway, "read body: " + err.Error()}
	}
	if int64(len(body)) > backupURLFetchMaxBytes {
		return nil, nil, "", &backupAllowedURLError{
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("remote body exceeded %d bytes", backupURLFetchMaxBytes),
		}
	}
	ct := resp.Header.Get("Content-Type")
	return u, body, ct, nil
}

func backupIsPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if ip.IsPrivate() {
		return false
	}
	return true
}

func backupPortFromHost(u *url.URL) string {
	if _, port, err := net.SplitHostPort(u.Host); err == nil && port != "" {
		return port
	}
	if strings.EqualFold(u.Scheme, "https") {
		return "443"
	}
	return "80"
}

// Ensure imports are used.
var (
	_ = bytes.NewReader
	_ = context.Background
)
