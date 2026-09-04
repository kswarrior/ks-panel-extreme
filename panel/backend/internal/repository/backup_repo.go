package repository

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/secretbox"
)

// BackupSchedule is one cron row driving scheduled DB backups (kind='db')
// or per-instance snapshots (kind='snapshot').
type BackupSchedule struct {
	ID          int64      `json:"id"`
	Kind        string     `json:"kind"`
	InstanceID  *int64     `json:"instance_id,omitempty"`
	Name        string     `json:"name"`
	Cron        string     `json:"cron"`
	Enabled     bool       `json:"enabled"`
	KeepLastN   int        `json:"keep_last_n"`
	MaxAgeDays  int        `json:"max_age_days"`
	Compression string     `json:"compression"`
	S3Push      bool       `json:"s3_push"`
	NextRunAt   *time.Time `json:"next_run_at,omitempty"`
	LastRunAt   *time.Time `json:"last_run_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type BackupScheduleInput struct {
	Kind        string
	InstanceID  *int64
	Name        string
	Cron        string
	Enabled     bool
	KeepLastN   int
	MaxAgeDays  int
	Compression string
	S3Push      bool
	NextRunAt   *time.Time
}

type BackupScheduleRepository struct {
	db *sql.DB
}

func NewBackupScheduleRepository(db *sql.DB) *BackupScheduleRepository {
	return &BackupScheduleRepository{db: db}
}

func scanBackupSchedule(rows *sql.Rows) (BackupSchedule, error) {
	var s BackupSchedule
	var instID sql.NullInt64
	var nextRun, lastRun, created, updated sql.NullString
	var enabled, s3push int
	if err := rows.Scan(&s.ID, &s.Kind, &instID, &s.Name, &s.Cron, &enabled,
		&s.KeepLastN, &s.MaxAgeDays, &s.Compression, &s3push,
		&nextRun, &lastRun, &created, &updated); err != nil {
		return s, err
	}
	if instID.Valid {
		v := instID.Int64
		s.InstanceID = &v
	}
	s.Enabled = enabled != 0
	s.S3Push = s3push != 0
	s.NextRunAt = parseBackupTime(nextRun)
	s.LastRunAt = parseBackupTime(lastRun)
	s.CreatedAt = parseBackupTimeOrNow(created)
	s.UpdatedAt = parseBackupTimeOrNow(updated)
	return s, nil
}

func parseBackupTime(ns sql.NullString) *time.Time {
	if !ns.Valid || strings.TrimSpace(ns.String) == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339, "2006-01-02T15:04:05Z07:00"} {
		if t, err := time.Parse(layout, ns.String); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

func parseBackupTimeOrNow(ns sql.NullString) time.Time {
	if t := parseBackupTime(ns); t != nil {
		return *t
	}
	return time.Now().UTC()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ListByKind returns schedules for kind ('db' ignores instance filter;
// 'snapshot' may be filtered by instance).
func (r *BackupScheduleRepository) ListByKind(kind string, instanceID *int64) ([]BackupSchedule, error) {
	var rows *sql.Rows
	var err error
	if instanceID != nil {
		rows, err = r.db.Query(`SELECT id, kind, instance_id, name, cron, enabled, keep_last_n, max_age_days, compression, s3_push, next_run_at, last_run_at, created_at, updated_at FROM backup_schedules WHERE kind = ? AND (instance_id = ? OR instance_id IS NULL) ORDER BY id DESC`, kind, *instanceID)
	} else {
		rows, err = r.db.Query(`SELECT id, kind, instance_id, name, cron, enabled, keep_last_n, max_age_days, compression, s3_push, next_run_at, last_run_at, created_at, updated_at FROM backup_schedules WHERE kind = ? ORDER BY id DESC`, kind)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BackupSchedule{}
	for rows.Next() {
		s, err := scanBackupSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Due returns enabled schedules whose next_run_at has passed.
func (r *BackupScheduleRepository) Due(now time.Time) ([]BackupSchedule, error) {
	rows, err := r.db.Query(`SELECT id, kind, instance_id, name, cron, enabled, keep_last_n, max_age_days, compression, s3_push, next_run_at, last_run_at, created_at, updated_at FROM backup_schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?`, now.UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BackupSchedule{}
	for rows.Next() {
		s, err := scanBackupSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *BackupScheduleRepository) Create(in BackupScheduleInput) (int64, error) {
	var nextRun any
	if in.NextRunAt != nil {
		nextRun = in.NextRunAt.UTC().Format("2006-01-02 15:04:05")
	}
	res, err := r.db.Exec(`INSERT INTO backup_schedules (kind, instance_id, name, cron, enabled, keep_last_n, max_age_days, compression, s3_push, next_run_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.Kind, in.InstanceID, in.Name, in.Cron, boolToInt(in.Enabled), in.KeepLastN, in.MaxAgeDays, in.Compression, boolToInt(in.S3Push), nextRun)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *BackupScheduleRepository) Update(id int64, in BackupScheduleInput) error {
	var nextRun any
	if in.NextRunAt != nil {
		nextRun = in.NextRunAt.UTC().Format("2006-01-02 15:04:05")
	}
	res, err := r.db.Exec(`UPDATE backup_schedules SET instance_id = ?, name = ?, cron = ?, enabled = ?, keep_last_n = ?, max_age_days = ?, compression = ?, s3_push = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND kind = ?`,
		in.InstanceID, in.Name, in.Cron, boolToInt(in.Enabled), in.KeepLastN, in.MaxAgeDays, in.Compression, boolToInt(in.S3Push), nextRun, id, in.Kind)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("schedule not found")
	}
	return nil
}

func (r *BackupScheduleRepository) Delete(id int64) error {
	res, err := r.db.Exec(`DELETE FROM backup_schedules WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("schedule not found")
	}
	return nil
}

// MarkRan re-arms next_run_at after a fire.
func (r *BackupScheduleRepository) MarkRan(id int64, next time.Time) error {
	var v any
	if !next.IsZero() {
		v = next.UTC().Format("2006-01-02 15:04:05")
	}
	_, err := r.db.Exec(`UPDATE backup_schedules SET last_run_at = CURRENT_TIMESTAMP, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, v, id)
	return err
}

// ---- S3 config ------------------------------------------------------------

// S3ConfigView is the safe listing shape (secret never included).
type S3ConfigView struct {
	Endpoint  string `json:"endpoint"`
	Bucket    string `json:"bucket"`
	Region    string `json:"region"`
	Prefix    string `json:"prefix"`
	AccessKey string `json:"access_key"`
	Configured bool  `json:"configured"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type S3ConfigRepository struct {
	db *sql.DB
}

func NewS3ConfigRepository(db *sql.DB) *S3ConfigRepository { return &S3ConfigRepository{db: db} }

// GetView returns the redacted config (no secret).
func (r *S3ConfigRepository) GetView() (S3ConfigView, error) {
	var v S3ConfigView
	var updated sql.NullString
	var secretEnc sql.NullString
	err := r.db.QueryRow(`SELECT endpoint, bucket, region, prefix, access_key, secret_enc, updated_at FROM backup_s3_config WHERE id = 1`).Scan(
		&v.Endpoint, &v.Bucket, &v.Region, &v.Prefix, &v.AccessKey, &secretEnc, &updated)
	if err == sql.ErrNoRows {
		return S3ConfigView{}, nil
	}
	if err != nil {
		return S3ConfigView{}, err
	}
	v.Configured = secretEnc.Valid && secretEnc.String != "" && v.Endpoint != "" && v.Bucket != ""
	if updated.Valid {
		v.UpdatedAt = updated.String
	}
	return v, nil
}

// GetClear returns endpoint/bucket/region/prefix/access + unsealed secret.
// Callers must never log the secret.
func (r *S3ConfigRepository) GetClear() (endpoint, bucket, region, prefix, access, secret string, err error) {
	var secretEnc sql.NullString
	err = r.db.QueryRow(`SELECT endpoint, bucket, region, prefix, access_key, secret_enc FROM backup_s3_config WHERE id = 1`).Scan(
		&endpoint, &bucket, &region, &prefix, &access, &secretEnc)
	if err == sql.ErrNoRows {
		return "", "", "", "", "", "", fmt.Errorf("s3 remote is not configured")
	}
	if err != nil {
		return "", "", "", "", "", "", err
	}
	if strings.TrimSpace(endpoint) == "" || strings.TrimSpace(bucket) == "" {
		return "", "", "", "", "", "", fmt.Errorf("s3 remote is not configured")
	}
	if !secretEnc.Valid || secretEnc.String == "" {
		return "", "", "", "", "", "", fmt.Errorf("s3 secret is not configured")
	}
	raw, derr := base64.StdEncoding.DecodeString(secretEnc.String)
	if derr != nil {
		return "", "", "", "", "", "", fmt.Errorf("s3 secret decode failed")
	}
	clear, oerr := secretbox.Open(raw)
	if oerr != nil {
		return "", "", "", "", "", "", fmt.Errorf("s3 secret open failed")
	}
	return endpoint, bucket, region, prefix, access, string(clear), nil
}

// Put seals the secret with secretbox and upserts the singleton row.
func (r *S3ConfigRepository) Put(endpoint, bucket, region, prefix, access, secret string) error {
	sealed, err := secretbox.Seal([]byte(secret))
	if err != nil {
		return err
	}
	enc := base64.StdEncoding.EncodeToString(sealed)
	_, err = r.db.Exec(`INSERT INTO backup_s3_config (id, endpoint, bucket, region, prefix, access_key, secret_enc, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, bucket = excluded.bucket, region = excluded.region, prefix = excluded.prefix, access_key = excluded.access_key, secret_enc = excluded.secret_enc, updated_at = CURRENT_TIMESTAMP`,
		strings.TrimSpace(endpoint), strings.TrimSpace(bucket), strings.TrimSpace(region), strings.TrimSpace(prefix), strings.TrimSpace(access), enc)
	return err
}

// ---- Instance file backups ------------------------------------------------

type InstanceFileBackup struct {
	ID          int64     `json:"id"`
	InstanceID  int64     `json:"instance_id"`
	Filename    string    `json:"filename"`
	SizeBytes   int64     `json:"size_bytes"`
	SHA256      string    `json:"sha256"`
	Compressed  bool      `json:"compressed"`
	Compression string    `json:"compression"`
	S3Pushed    bool      `json:"s3_pushed"`
	CreatedAt   time.Time `json:"created_at"`
}

type InstanceFileBackupRepository struct {
	db *sql.DB
}

func NewInstanceFileBackupRepository(db *sql.DB) *InstanceFileBackupRepository {
	return &InstanceFileBackupRepository{db: db}
}

func (r *InstanceFileBackupRepository) List(instanceID int64) ([]InstanceFileBackup, error) {
	rows, err := r.db.Query(`SELECT id, instance_id, filename, size_bytes, sha256, compressed, compression, s3_pushed, created_at FROM instance_file_backups WHERE instance_id = ? ORDER BY created_at DESC`, instanceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InstanceFileBackup{}
	for rows.Next() {
		var b InstanceFileBackup
		var created string
		var compressed, s3pushed int
		if err := rows.Scan(&b.ID, &b.InstanceID, &b.Filename, &b.SizeBytes, &b.SHA256, &compressed, &b.Compression, &s3pushed, &created); err != nil {
			return nil, err
		}
		b.Compressed = compressed != 0
		b.S3Pushed = s3pushed != 0
		b.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *InstanceFileBackupRepository) Create(b InstanceFileBackup) (int64, error) {
	res, err := r.db.Exec(`INSERT INTO instance_file_backups (instance_id, filename, size_bytes, sha256, compressed, compression, s3_pushed) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		b.InstanceID, b.Filename, b.SizeBytes, b.SHA256, boolToInt(b.Compressed), b.Compression, boolToInt(b.S3Pushed))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *InstanceFileBackupRepository) Get(id, instanceID int64) (InstanceFileBackup, error) {
	var b InstanceFileBackup
	var created string
	var compressed, s3pushed int
	err := r.db.QueryRow(`SELECT id, instance_id, filename, size_bytes, sha256, compressed, compression, s3_pushed, created_at FROM instance_file_backups WHERE id = ? AND instance_id = ?`, id, instanceID).Scan(
		&b.ID, &b.InstanceID, &b.Filename, &b.SizeBytes, &b.SHA256, &compressed, &b.Compression, &s3pushed, &created)
	if err != nil {
		return b, err
	}
	b.Compressed = compressed != 0
	b.S3Pushed = s3pushed != 0
	b.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
	return b, nil
}

func (r *InstanceFileBackupRepository) UpdateStat(id int64, sizeBytes int64, sha string) error {
	_, err := r.db.Exec(`UPDATE instance_file_backups SET size_bytes = ?, sha256 = ? WHERE id = ?`, sizeBytes, sha, id)
	return err
}

func (r *InstanceFileBackupRepository) MarkS3Pushed(id int64) error {
	_, err := r.db.Exec(`UPDATE instance_file_backups SET s3_pushed = 1 WHERE id = ?`, id)
	return err
}

func (r *InstanceFileBackupRepository) Delete(id, instanceID int64) error {
	res, err := r.db.Exec(`DELETE FROM instance_file_backups WHERE id = ? AND instance_id = ?`, id, instanceID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("backup not found")
	}
	return nil
}
