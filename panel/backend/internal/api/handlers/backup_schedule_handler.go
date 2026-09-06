package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/backup"
	"github.com/example/kspanel/internal/cron"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ---- Backup schedules (cron for DB VACUUM INTO + instance snapshots) ----

type backupScheduleDTO struct {
	Name        string `json:"name"`
	Cron        string `json:"cron"`
	Enabled     bool   `json:"enabled"`
	KeepLastN   int    `json:"keep_last_n"`
	MaxAgeDays  int    `json:"max_age_days"`
	Compression string `json:"compression"`
	S3Push      bool   `json:"s3_push"`
}

func validateBackupScheduleDTO(dto *backupScheduleDTO) error {
	dto.Name = strings.TrimSpace(dto.Name)
	dto.Cron = strings.TrimSpace(dto.Cron)
	if dto.Cron == "" {
		return fmt.Errorf("cron is required (5-field, e.g. \"0 2 * * *\")")
	}
	if _, err := cron.Parse(dto.Cron); err != nil {
		return fmt.Errorf("invalid cron: %w", err)
	}
	comp, err := backup.ValidateCompression(dto.Compression)
	if err != nil {
		return err
	}
	dto.Compression = comp
	if dto.KeepLastN < 0 || dto.KeepLastN > 1000 {
		return fmt.Errorf("keep_last_n must be 0..1000")
	}
	if dto.MaxAgeDays < 0 || dto.MaxAgeDays > 3650 {
		return fmt.Errorf("max_age_days must be 0..3650")
	}
	if dto.KeepLastN == 0 {
		dto.KeepLastN = 7
	}
	if dto.MaxAgeDays == 0 {
		dto.MaxAgeDays = 30
	}
	if len(dto.Name) > 64 {
		return fmt.Errorf("name too long (max 64 chars)")
	}
	return nil
}

func cronNextOrNil(schedule string) *time.Time {
	s, err := cron.Parse(schedule)
	if err != nil {
		return nil
	}
	n := s.Next(time.Now())
	return &n
}

// ListDBBackupSchedulesHandler returns kind='db' schedules.
func ListDBBackupSchedulesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("ListDBBackupSchedules open db:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	list, err := repository.NewBackupScheduleRepository(con).ListByKind("db", nil)
	if err != nil {
		log.Println("ListDBBackupSchedules list:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []repository.BackupSchedule{}
	}
	writeJSON(w, list)
}

// CreateDBBackupScheduleHandler creates a DB cron schedule.
func CreateDBBackupScheduleHandler(w http.ResponseWriter, r *http.Request) {
	var dto backupScheduleDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	// Enabled defaults true when the field is absent and cron is valid;
	// encoding/json leaves false for absent, so treat absent as true only
	// when the raw body lacks the key. Simpler: keep as-sent; UI sends it.
	if err := validateBackupScheduleDTO(&dto); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// Disabled schedules carry NULL next_run_at (Due filters enabled=1);
	// arming a disabled row would fire it immediately on re-enable with a
	// stale stamp. Same contract as the update paths below.
	var createNext *time.Time
	if dto.Enabled {
		createNext = cronNextOrNil(dto.Cron)
	}
	id, err := repository.NewBackupScheduleRepository(con).Create(repository.BackupScheduleInput{
		Kind: "db", Name: dto.Name, Cron: dto.Cron, Enabled: dto.Enabled,
		KeepLastN: dto.KeepLastN, MaxAgeDays: dto.MaxAgeDays,
		Compression: dto.Compression, S3Push: dto.S3Push, NextRunAt: createNext,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_schedule_create",
		TargetLabel: dto.Name, Message: fmt.Sprintf("created DB backup schedule %q (%s) by user %d", dto.Name, dto.Cron, uid),
	})
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": id})
}

// UpdateDBBackupScheduleHandler updates a DB schedule.
func UpdateDBBackupScheduleHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "schedule_id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid schedule id", http.StatusBadRequest)
		return
	}
	var dto backupScheduleDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if err := validateBackupScheduleDTO(&dto); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	var next *time.Time
	if dto.Enabled {
		next = cronNextOrNil(dto.Cron)
	}
	if err := repository.NewBackupScheduleRepository(con).Update(id, repository.BackupScheduleInput{
		Kind: "db", Name: dto.Name, Cron: dto.Cron, Enabled: dto.Enabled,
		KeepLastN: dto.KeepLastN, MaxAgeDays: dto.MaxAgeDays,
		Compression: dto.Compression, S3Push: dto.S3Push, NextRunAt: next,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_schedule_update",
		TargetLabel: dto.Name, Message: fmt.Sprintf("updated DB backup schedule #%d by user %d", id, uid),
	})
	w.WriteHeader(http.StatusNoContent)
}

// DeleteDBBackupScheduleHandler deletes a DB schedule.
func DeleteDBBackupScheduleHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "schedule_id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid schedule id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if err := repository.NewBackupScheduleRepository(con).Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_schedule_delete",
		TargetLabel: fmt.Sprintf("#%d", id), Message: fmt.Sprintf("deleted DB backup schedule #%d by user %d", id, uid),
	})
	w.WriteHeader(http.StatusNoContent)
}

// PruneDBBackupsHandler enforces keep_last_n + max_age_days on demand.
func PruneDBBackupsHandler(w http.ResponseWriter, r *http.Request) {
	var dto struct {
		KeepLastN  int `json:"keep_last_n"`
		MaxAgeDays int `json:"max_age_days"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto)
	if dto.KeepLastN < 0 || dto.KeepLastN > 1000 || dto.MaxAgeDays < 0 || dto.MaxAgeDays > 3650 {
		http.Error(w, "keep_last_n 0..1000, max_age_days 0..3650", http.StatusBadRequest)
		return
	}
	if dto.KeepLastN == 0 {
		dto.KeepLastN = 7
	}
	if dto.MaxAgeDays == 0 {
		dto.MaxAgeDays = 30
	}
	removed, err := backup.Prune(dto.KeepLastN, dto.MaxAgeDays)
	if err != nil {
		http.Error(w, "prune failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if removed == nil {
		removed = []string{}
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_prune",
		TargetLabel: fmt.Sprintf("keep=%d age=%d", dto.KeepLastN, dto.MaxAgeDays),
		Message:     fmt.Sprintf("pruned %d database backups by user %d", len(removed), uid),
	})
	writeJSON(w, map[string]any{"removed": removed, "count": len(removed)})
}

// ---- Snapshot schedules (per-instance) ----

// ListSnapshotSchedulesHandler returns kind='snapshot' schedules for instance.
func ListSnapshotSchedulesHandler(w http.ResponseWriter, r *http.Request) {
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
	list, err := repository.NewBackupScheduleRepository(con).ListByKind("snapshot", &id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []repository.BackupSchedule{}
	}
	writeJSON(w, list)
}

// CreateSnapshotScheduleHandler creates a per-instance snapshot cron.
func CreateSnapshotScheduleHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var dto backupScheduleDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if err := validateBackupScheduleDTO(&dto); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	var snapNext *time.Time
	if dto.Enabled {
		snapNext = cronNextOrNil(dto.Cron)
	}
	sid, err := repository.NewBackupScheduleRepository(con).Create(repository.BackupScheduleInput{
		Kind: "snapshot", InstanceID: &id, Name: dto.Name, Cron: dto.Cron, Enabled: dto.Enabled,
		KeepLastN: dto.KeepLastN, MaxAgeDays: dto.MaxAgeDays,
		Compression: dto.Compression, S3Push: dto.S3Push, NextRunAt: snapNext,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	auditInst(r, id, "snapshot.schedule.create", fmt.Sprintf("created snapshot schedule %q (%s)", dto.Name, dto.Cron))
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": sid})
}

// UpdateSnapshotScheduleHandler updates a snapshot schedule.
func UpdateSnapshotScheduleHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	sid, err := strconv.ParseInt(chi.URLParam(r, "schedule_id"), 10, 64)
	if err != nil || sid <= 0 {
		http.Error(w, "invalid schedule id", http.StatusBadRequest)
		return
	}
	var dto backupScheduleDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if err := validateBackupScheduleDTO(&dto); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	var next *time.Time
	if dto.Enabled {
		next = cronNextOrNil(dto.Cron)
	}
	if err := repository.NewBackupScheduleRepository(con).Update(sid, repository.BackupScheduleInput{
		Kind: "snapshot", InstanceID: &id, Name: dto.Name, Cron: dto.Cron, Enabled: dto.Enabled,
		KeepLastN: dto.KeepLastN, MaxAgeDays: dto.MaxAgeDays,
		Compression: dto.Compression, S3Push: dto.S3Push, NextRunAt: next,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	auditInst(r, id, "snapshot.schedule.update", fmt.Sprintf("updated snapshot schedule #%d", sid))
	w.WriteHeader(http.StatusNoContent)
}

// DeleteSnapshotScheduleHandler deletes a snapshot schedule.
func DeleteSnapshotScheduleHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "backups") {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	sid, err := strconv.ParseInt(chi.URLParam(r, "schedule_id"), 10, 64)
	if err != nil || sid <= 0 {
		http.Error(w, "invalid schedule id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if err := repository.NewBackupScheduleRepository(con).Delete(sid); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	auditInst(r, id, "snapshot.schedule.delete", fmt.Sprintf("deleted snapshot schedule #%d", sid))
	w.WriteHeader(http.StatusNoContent)
}

// ---- S3 remote ------------------------------------------------------------

type s3ConfigDTO struct {
	Endpoint  string `json:"endpoint"`
	Bucket    string `json:"bucket"`
	Region    string `json:"region"`
	Prefix    string `json:"prefix"`
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`
}

// GetS3ConfigHandler returns the redacted remote (never the secret).
func GetS3ConfigHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	view, err := repository.NewS3ConfigRepository(con).GetView()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, view)
}

// PutS3ConfigHandler stores the remote; the secret is sealed with secretbox
// and never logged. Validation rejects non-http(s) endpoints + traversal.
func PutS3ConfigHandler(w http.ResponseWriter, r *http.Request) {
	var dto s3ConfigDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	dto.Endpoint = strings.TrimSpace(dto.Endpoint)
	dto.Bucket = strings.TrimSpace(dto.Bucket)
	dto.AccessKey = strings.TrimSpace(dto.AccessKey)
	if dto.Endpoint == "" || dto.Bucket == "" || dto.AccessKey == "" || dto.SecretKey == "" {
		http.Error(w, "endpoint, bucket, access_key and secret_key are required", http.StatusBadRequest)
		return
	}
	if err := backup.ValidateS3Config(backup.S3Config{
		Endpoint: dto.Endpoint, Bucket: dto.Bucket, Region: dto.Region,
		Prefix: dto.Prefix, AccessKey: dto.AccessKey, SecretKey: dto.SecretKey,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if err := repository.NewS3ConfigRepository(con).Put(dto.Endpoint, dto.Bucket, dto.Region, dto.Prefix, dto.AccessKey, dto.SecretKey); err != nil {
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	uid, _ := UserIDFromContext(r)
	// Never include the secret or full DSN in the activity message.
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_s3_config",
		TargetLabel: dto.Bucket, Message: fmt.Sprintf("updated S3 remote bucket %q by user %d", dto.Bucket, uid),
	})
	writeJSON(w, map[string]any{"ok": true})
}

func loadS3Clear() (backup.S3Config, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return backup.S3Config{}, err
	}
	defer con.Close()
	ep, bucket, region, prefix, access, secret, err := repository.NewS3ConfigRepository(con).GetClear()
	if err != nil {
		return backup.S3Config{}, err
	}
	return backup.S3Config{Endpoint: ep, Bucket: bucket, Region: region, Prefix: prefix, AccessKey: access, SecretKey: secret}, nil
}

// PushDBBackupToS3Handler uploads one backup file to the configured remote.
func PushDBBackupToS3Handler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		http.Error(w, "backup id is required", http.StatusBadRequest)
		return
	}
	b, err := backup.Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	cfg, err := loadS3Clear()
	if err != nil {
		http.Error(w, "s3 remote is not configured", http.StatusBadRequest)
		return
	}
	if err := backup.S3Push(cfg, b.Path); err != nil {
		http.Error(w, "s3 push failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_s3_push",
		TargetLabel: b.Filename, Message: fmt.Sprintf("pushed database backup %q to S3 by user %d", b.Filename, uid),
	})
	writeJSON(w, map[string]any{"ok": true})
}

// PullDBBackupFromS3Handler downloads a remote object into the backup dir.
func PullDBBackupFromS3Handler(w http.ResponseWriter, r *http.Request) {
	var dto struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil || strings.TrimSpace(dto.Filename) == "" {
		http.Error(w, "filename is required", http.StatusBadRequest)
		return
	}
	// Reuse the traversal guard from the S3 layer by validating the name
	// before it touches the filesystem.
	name := strings.TrimSpace(dto.Filename)
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(name, "kspanel-") {
		http.Error(w, "only kspanel backup files can be pulled", http.StatusBadRequest)
		return
	}
	cfg, err := loadS3Clear()
	if err != nil {
		http.Error(w, "s3 remote is not configured", http.StatusBadRequest)
		return
	}
	dst := strings.TrimSuffix(name, ".tmp") // never write a .tmp name
	// Ensure the pulled file lands inside the backup dir under a valid name.
	if _, comp := splitBackupSuffixForName(name); comp == "" {
		// splitBackupSuffixForName mirrors backup.splitBackupSuffix (unexported);
		// validate by suffix list here so we don't import internals.
		http.Error(w, "unsupported backup suffix (want .db/.sql with optional .gz/.zst)", http.StatusBadRequest)
		return
	}
	_ = dst
	if err := backup.S3Pull(cfg, name, backup.ListDir()+"/"+name); err != nil {
		http.Error(w, "s3 pull failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	uid, _ := UserIDFromContext(r)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "backup_s3_pull",
		TargetLabel: name, Message: fmt.Sprintf("pulled database backup %q from S3 by user %d", name, uid),
	})
	writeJSONStatus(w, http.StatusCreated, map[string]any{"ok": true, "filename": name})
}

func splitBackupSuffixForName(name string) (string, string) {
	for _, s := range []string{".db.gz", ".db.zst", ".db", ".sql.gz", ".sql.zst", ".sql"} {
		if strings.HasSuffix(name, s) {
			c := "none"
			if strings.HasSuffix(s, ".gz") {
				c = "gzip"
			} else if strings.HasSuffix(s, ".zst") {
				c = "zstd"
			}
			return s, c
		}
	}
	return "", ""
}
