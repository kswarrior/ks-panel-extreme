package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// AutomationRepository manages the per-instance scheduled task store. The
// panel is the source of truth for job specs; ksedge runs the command on
// each fire. The scheduler lives in internal/scheduler and reads Due()
// every minute.
type AutomationRepository struct {
	db *sql.DB
}

func NewAutomationRepository(db *sql.DB) *AutomationRepository {
	return &AutomationRepository{db: db}
}

func scanAutomation(rows *sql.Rows, s *models.Automation) error {
	var id, instanceID sql.NullInt64
	var refsJSON string
	var enabled int
	var created, updated string
	var lastRun, nextRun sql.NullString
	if err := rows.Scan(&id, &instanceID, &s.Name, &s.Command, &s.Schedule,
		&enabled, &refsJSON, &s.TimeoutSec, &lastRun, &nextRun, &created, &updated); err != nil {
		return err
	}
	if !id.Valid || !instanceID.Valid {
		return fmt.Errorf("automation row has NULL id or instance_id")
	}
	s.ID = id.Int64
	s.InstanceID = instanceID.Int64
	s.Enabled = enabled == 1
	_ = json.Unmarshal([]byte(refsJSON), &s.SecretRefs)
	if s.SecretRefs == nil {
		s.SecretRefs = []string{}
	}
	if lastRun.Valid {
		if t, err := time.Parse("2006-01-02 15:04:05", lastRun.String); err == nil {
			s.LastRunAt = &t
		}
	}
	if nextRun.Valid {
		if t, err := time.Parse("2006-01-02 15:04:05", nextRun.String); err == nil {
			s.NextRunAt = &t
		}
	}
	s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
	s.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated)
	return nil
}

// ListByInstance returns all automation jobs for an instance.
func (r *AutomationRepository) ListByInstance(instanceID int64) ([]models.Automation, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_automation WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.Automation, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, instance_id, name, command, schedule, enabled, secret_refs,
		timeout_sec, last_run_at, next_run_at, created_at, updated_at
		FROM instance_automation WHERE instance_id = ? ORDER BY id ASC`, instanceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s models.Automation
		if err := scanAutomation(rows, &s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Get returns one job by id.
func (r *AutomationRepository) Get(id int64) (*models.Automation, error) {
	rows, err := r.db.Query(`SELECT id, instance_id, name, command, schedule, enabled, secret_refs,
		timeout_sec, last_run_at, next_run_at, created_at, updated_at FROM instance_automation WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("automation not found")
	}
	var s models.Automation
	if err := scanAutomation(rows, &s); err != nil {
		return nil, err
	}
	return &s, rows.Err()
}

// UpsertInput is the write payload for Create/Update.
type AutomationUpsertInput struct {
	InstanceID int64
	Name       string
	Command    string
	Schedule   string
	Enabled    bool
	SecretRefs []string
	TimeoutSec int
}

func (in AutomationUpsertInput) refsJSON() string {
	if in.SecretRefs == nil {
		in.SecretRefs = []string{}
	}
	b, _ := json.Marshal(in.SecretRefs)
	return string(b)
}

// Create inserts a new job and returns its id.
func (r *AutomationRepository) Create(in AutomationUpsertInput) (int64, error) {
	if in.Name == "" || in.Command == "" {
		return 0, fmt.Errorf("name and command are required")
	}
	enabled := 0
	if in.Enabled {
		enabled = 1
	}
	to := in.TimeoutSec
	if to <= 0 {
		to = 300
	}
	res, err := r.db.Exec(`INSERT INTO instance_automation (instance_id, name, command, schedule, enabled, secret_refs, timeout_sec)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		in.InstanceID, in.Name, in.Command, in.Schedule, enabled, in.refsJSON(), to)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update replaces an existing job's mutable fields.
func (r *AutomationRepository) Update(id int64, in AutomationUpsertInput) error {
	if in.Name == "" || in.Command == "" {
		return fmt.Errorf("name and command are required")
	}
	enabled := 0
	if in.Enabled {
		enabled = 1
	}
	to := in.TimeoutSec
	if to <= 0 {
		to = 300
	}
	_, err := r.db.Exec(`UPDATE instance_automation SET name = ?, command = ?, schedule = ?, enabled = ?,
		secret_refs = ?, timeout_sec = ?, next_run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		in.Name, in.Command, in.Schedule, enabled, in.refsJSON(), to, id)
	return err
}

// Delete removes a job.
func (r *AutomationRepository) Delete(id int64) error {
	res, err := r.db.Exec(`DELETE FROM instance_automation WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("automation not found")
	}
	return nil
}

// MarkRan records the time a job last fired and clears the next-due slot.
func (r *AutomationRepository) MarkRan(id int64, next time.Time) error {
	_, err := r.db.Exec(`UPDATE instance_automation SET last_run_at = CURRENT_TIMESTAMP,
		next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, next.UTC().Format("2006-01-02 15:04:05"), id)
	return err
}

// Due returns jobs whose next_run_at has passed AND that are enabled AND have
// a schedule. On-demand jobs (empty schedule) are never auto-fired.
func (r *AutomationRepository) Due(now time.Time) ([]models.Automation, error) {
	rows, err := r.db.Query(`SELECT id, instance_id, name, command, schedule, enabled, secret_refs,
		timeout_sec, last_run_at, next_run_at, created_at, updated_at FROM instance_automation
		WHERE enabled = 1 AND schedule != '' AND next_run_at IS NOT NULL AND next_run_at <= ?`,
		now.UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Automation
	for rows.Next() {
		var s models.Automation
		if err := scanAutomation(rows, &s); err != nil {
			continue
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// ScheduleNext sets the next due stamp for a freshly-created or rescheduled
// job based on a precomputed cron time.
func (r *AutomationRepository) ScheduleNext(id int64, next time.Time) error {
	_, err := r.db.Exec(`UPDATE instance_automation SET next_run_at = ? WHERE id = ?`,
		next.UTC().Format("2006-01-02 15:04:05"), id)
	return err
}

// --- runs -------------------------------------------------------------------

// AutomationRunInput is the write payload for RecordRun.
type AutomationRunInput struct {
	JobID      int64
	InstanceID int64
	Trigger    string
	Command    string
	Stdout     string
	Stderr     string
	ExitCode   int
	DurationMS int64
	Error      string
	StartedAt  time.Time
	FinishedAt time.Time
}

// RecordRun appends a run row and returns its id.
func (r *AutomationRepository) RecordRun(in AutomationRunInput) (int64, error) {
	started := in.StartedAt.UTC().Format("2006-01-02 15:04:05")
	finished := in.FinishedAt.UTC().Format("2006-01-02 15:04:05")
	if in.FinishedAt.IsZero() {
		finished = ""
	}
	var q string
	var args []interface{}
	if finished == "" {
		q = `INSERT INTO automation_runs (job_id, instance_id, trigger, command, stdout, stderr, exit_code, duration_ms, error, started_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		args = []interface{}{in.JobID, in.InstanceID, in.Trigger, in.Command, in.Stdout, in.Stderr, in.ExitCode, in.DurationMS, in.Error, started}
	} else {
		q = `INSERT INTO automation_runs (job_id, instance_id, trigger, command, stdout, stderr, exit_code, duration_ms, error, started_at, finished_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		args = []interface{}{in.JobID, in.InstanceID, in.Trigger, in.Command, in.Stdout, in.Stderr, in.ExitCode, in.DurationMS, in.Error, started, finished}
	}
	res, err := r.db.Exec(q, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ListRunsByJob returns the most recent runs for a job.
//
// modernc.org/sqlite emits a phantom all-NULL iteration via rows.Next() on
// empty result sets; scanning straight into the typed fields then crashes
// with "converting NULL to int64". We COUNT(*) first and short-circuit on
// zero (same defence as ListRunsByInstance below); scanRuns already drops
// any phantom row whose primary key is NULL.
func (r *AutomationRepository) ListRunsByJob(jobID int64, limit int) ([]models.AutomationRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM automation_runs WHERE job_id = ?`, jobID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return []models.AutomationRun{}, nil
	}
	rows, err := r.db.Query(`SELECT id, job_id, instance_id, trigger, command, stdout, stderr, exit_code,
		duration_ms, error, started_at, finished_at FROM automation_runs
		WHERE job_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`, jobID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRuns(rows)
}

// ListRunsByInstance returns the most recent runs across all jobs of an
// instance, used by the per-instance Automation "Recent runs" strip.
//
// modernc.org/sqlite emits a phantom all-NULL iteration via rows.Next() on
// empty result sets; scanning straight into the typed fields then crashes
// with "converting NULL to int64". We COUNT(*) first and short-circuit on
// zero, AND scan into sql.Null* + skip rows whose primary key is NULL, so
// the phantom iteration (when present) is silently dropped instead of
// failing the whole list call.
func (r *AutomationRepository) ListRunsByInstance(instanceID int64, limit int) ([]models.AutomationRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM automation_runs WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.AutomationRun, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, job_id, instance_id, trigger, command, stdout, stderr, exit_code,
		duration_ms, error, started_at, finished_at FROM automation_runs
		WHERE instance_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`, instanceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRuns(rows)
}

func scanRuns(rows *sql.Rows) ([]models.AutomationRun, error) {
	out := []models.AutomationRun{}
	for rows.Next() {
		var run models.AutomationRun
		var id, jobID, instID, exitCode, durationMS sql.NullInt64
		var trigger, command, stdout, stderr, errStr, started, finished sql.NullString
		if err := rows.Scan(&id, &jobID, &instID, &trigger, &command,
			&stdout, &stderr, &exitCode, &durationMS, &errStr, &started, &finished); err != nil {
			return nil, err
		}
		// Drop the modernc phantom-NULL iteration (its `id` is NULL).
		if !id.Valid {
			continue
		}
		run.ID = id.Int64
		run.JobID = jobID.Int64
		run.InstanceID = instID.Int64
		run.Trigger = trigger.String
		run.Command = command.String
		run.Stdout = stdout.String
		run.Stderr = stderr.String
		run.ExitCode = int(exitCode.Int64)
		run.DurationMS = durationMS.Int64
		run.Error = errStr.String
		if t, perr := time.Parse("2006-01-02 15:04:05", started.String); perr == nil {
			run.StartedAt = t
		}
		if finished.Valid && finished.String != "" {
			if t, perr := time.Parse("2006-01-02 15:04:05", finished.String); perr == nil {
				run.FinishedAt = &t
			}
		}
		out = append(out, run)
	}
	return out, rows.Err()
}
