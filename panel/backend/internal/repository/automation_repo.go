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
	var kind, payload sql.NullString
	var stepsJSON sql.NullString
	var enabled int
	var created, updated string
	var lastRun, nextRun sql.NullString
	if err := rows.Scan(&id, &instanceID, &s.Name, &s.Command, &kind, &payload, &s.Schedule,
		&enabled, &refsJSON, &s.TimeoutSec, &stepsJSON, &lastRun, &nextRun, &created, &updated); err != nil {
		return err
	}
	if !id.Valid || !instanceID.Valid {
		return fmt.Errorf("automation row has NULL id or instance_id")
	}
	s.ID = id.Int64
	s.InstanceID = instanceID.Int64
	s.Enabled = enabled == 1
	// kind/payload are NOT NULL with defaults since migration 073, but
	// NullString keeps the scan honest on any legacy read path.
	s.Kind = models.NormalizeAutomationKind(kind.String)
	s.Payload = payload.String
	_ = json.Unmarshal([]byte(refsJSON), &s.SecretRefs)
	if s.SecretRefs == nil {
		s.SecretRefs = []string{}
	}
	if stepsJSON.Valid && stepsJSON.String != "" {
		var steps []models.AutomationStep
		if err := json.Unmarshal([]byte(stepsJSON.String), &steps); err == nil && steps != nil {
			// Normalise on read so old/hand-written rows behave like
			// freshly-validated ones (kind + if folding only; payloads
			// stay byte-identical).
			for i := range steps {
				steps[i].Kind = models.NormalizeAutomationKind(steps[i].Kind)
				steps[i].If = models.NormalizeAutomationIf(steps[i].If)
			}
			s.Steps = steps
		}
	}
	if lastRun.Valid {
		if t, err := parseDBTime(lastRun.String); err == nil && !t.IsZero() {
			s.LastRunAt = &t
		}
	}
	if nextRun.Valid {
		if t, err := parseDBTime(nextRun.String); err == nil && !t.IsZero() {
			s.NextRunAt = &t
		}
	}
	s.CreatedAt, _ = parseDBTime(created)
	s.UpdatedAt, _ = parseDBTime(updated)
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
	rows, err := r.db.Query(`SELECT id, instance_id, name, command, kind, payload, schedule, enabled, secret_refs,
		timeout_sec, steps, last_run_at, next_run_at, created_at, updated_at
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
	rows, err := r.db.Query(`SELECT id, instance_id, name, command, kind, payload, schedule, enabled, secret_refs,
		timeout_sec, steps, last_run_at, next_run_at, created_at, updated_at FROM instance_automation WHERE id = ?`, id)
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

// UpsertInput is the write payload for Create/Update. Kind selects the
// execution path (shell|power|action); Payload carries the power op or the
// template action ID (empty for shell jobs, whose script stays in Command).
// Steps carries the optional multi-step plan (empty = legacy single-shot:
// the top-level kind/payload/command fire once). Each step reuses the same
// kind/payload/command shapes; If is success|failure|always.
type AutomationUpsertInput struct {
	InstanceID int64
	Name       string
	Command    string
	Kind       string
	Payload    string
	Schedule   string
	Enabled    bool
	SecretRefs []string
	TimeoutSec int
	Steps      []models.AutomationStep
}

func (in AutomationUpsertInput) refsJSON() string {
	if in.SecretRefs == nil {
		in.SecretRefs = []string{}
	}
	b, _ := json.Marshal(in.SecretRefs)
	return string(b)
}

// MaxAutomationSteps caps the steps array so a hostile/bloated payload
// can't force the executor to run hundreds of edge RPCs per fire.
const MaxAutomationSteps = 32

func (in AutomationUpsertInput) stepsJSON() string {
	if len(in.Steps) == 0 {
		return ""
	}
	steps := make([]models.AutomationStep, 0, len(in.Steps))
	for _, st := range in.Steps {
		steps = append(steps, models.AutomationStep{
			Name:       st.Name,
			Kind:       models.NormalizeAutomationKind(st.Kind),
			Command:    st.Command,
			Payload:    st.Payload,
			If:         models.NormalizeAutomationIf(st.If),
			TimeoutSec: st.TimeoutSec,
		})
	}
	b, _ := json.Marshal(steps)
	return string(b)
}

// ValidateSteps enforces the per-step shape: name required, kind-folded,
// power op allow-list, action-ID presence, shell command presence, timeout
// sanity, count cap. Mirrors the top-level per-kind rules in Create/Update
// so a multi-step job can never smuggle what a single-shot job forbids.
func ValidateSteps(steps []models.AutomationStep) error {
	if len(steps) > MaxAutomationSteps {
		return fmt.Errorf("too many steps (max %d)", MaxAutomationSteps)
	}
	for i := range steps {
		st := steps[i]
		if st.Name == "" {
			return fmt.Errorf("step %d: name is required", i+1)
		}
		if len(st.Name) > 100 {
			return fmt.Errorf("step %d: name too long (max 100)", i+1)
		}
		kind := models.NormalizeAutomationKind(st.Kind)
		switch kind {
		case models.AutomationKindPower:
			if !models.IsAutomationPowerOp(st.Payload) {
				return fmt.Errorf("step %d: invalid power op %q (want start|stop|restart|kill)", i+1, st.Payload)
			}
		case models.AutomationKindAction:
			if st.Payload == "" {
				return fmt.Errorf("step %d: action id is required for action steps", i+1)
			}
			if len(st.Payload) > 128 {
				return fmt.Errorf("step %d: action id too long", i+1)
			}
		default:
			if st.Command == "" {
				return fmt.Errorf("step %d: command is required for shell steps", i+1)
			}
			if len(st.Command) > 8000 {
				return fmt.Errorf("step %d: command too long (max 8000)", i+1)
			}
		}
		if st.TimeoutSec < 0 || st.TimeoutSec > 1800 {
			return fmt.Errorf("step %d: timeout must be 0-1800s (0 = inherit job timeout)", i+1)
		}
	}
	return nil
}

// Create inserts a new job and returns its id. Command is required for
// shell jobs; power jobs need a valid op payload and action jobs a
// non-empty action-ID payload instead. Non-empty Steps switch the job to
// multi-step mode (each step validated the same way); the top-level
// kind/payload/command stay as the fallback display + legacy single-shot
// when Steps is empty.
func (r *AutomationRepository) Create(in AutomationUpsertInput) (int64, error) {
	kind := models.NormalizeAutomationKind(in.Kind)
	if in.Name == "" {
		return 0, fmt.Errorf("name is required")
	}
	hasSteps := len(in.Steps) > 0
	switch kind {
	case models.AutomationKindPower:
		if in.Payload == "" && !hasSteps {
			return 0, fmt.Errorf("invalid power op %q (want start|stop|restart|kill)", in.Payload)
		}
		if in.Payload != "" && !models.IsAutomationPowerOp(in.Payload) {
			return 0, fmt.Errorf("invalid power op %q (want start|stop|restart|kill)", in.Payload)
		}
	case models.AutomationKindAction:
		if in.Payload == "" && !hasSteps {
			return 0, fmt.Errorf("action id is required for action jobs")
		}
	default:
		if in.Command == "" && len(in.Steps) == 0 {
			return 0, fmt.Errorf("command is required for shell jobs")
		}
	}
	if err := ValidateSteps(in.Steps); err != nil {
		return 0, err
	}
	enabled := 0
	if in.Enabled {
		enabled = 1
	}
	to := in.TimeoutSec
	if to <= 0 {
		to = 300
	}
	stepsArg := in.stepsJSON()
	var stepsVal interface{}
	if stepsArg == "" {
		stepsVal = nil
	} else {
		stepsVal = stepsArg
	}
	res, err := r.db.Exec(`INSERT INTO instance_automation (instance_id, name, command, kind, payload, schedule, enabled, secret_refs, timeout_sec, steps)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.InstanceID, in.Name, in.Command, kind, in.Payload, in.Schedule, enabled, in.refsJSON(), to, stepsVal)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update replaces an existing job's mutable fields (same per-kind rules as
// Create).
func (r *AutomationRepository) Update(id int64, in AutomationUpsertInput) error {
	kind := models.NormalizeAutomationKind(in.Kind)
	if in.Name == "" {
		return fmt.Errorf("name is required")
	}
	switch kind {
	case models.AutomationKindPower:
		if !models.IsAutomationPowerOp(in.Payload) {
			return fmt.Errorf("invalid power op %q (want start|stop|restart|kill)", in.Payload)
		}
	case models.AutomationKindAction:
		if in.Payload == "" {
			return fmt.Errorf("action id is required for action jobs")
		}
	default:
		if in.Command == "" && len(in.Steps) == 0 {
			return fmt.Errorf("command is required for shell jobs")
		}
	}
	if err := ValidateSteps(in.Steps); err != nil {
		return err
	}
	enabled := 0
	if in.Enabled {
		enabled = 1
	}
	to := in.TimeoutSec
	if to <= 0 {
		to = 300
	}
	stepsArg := in.stepsJSON()
	var stepsVal interface{}
	if stepsArg == "" {
		stepsVal = nil
	} else {
		stepsVal = stepsArg
	}
	_, err := r.db.Exec(`UPDATE instance_automation SET name = ?, command = ?, kind = ?, payload = ?, schedule = ?, enabled = ?,
		secret_refs = ?, timeout_sec = ?, steps = ?, next_run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		in.Name, in.Command, kind, in.Payload, in.Schedule, enabled, in.refsJSON(), to, stepsVal, id)
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
	rows, err := r.db.Query(`SELECT id, instance_id, name, command, kind, payload, schedule, enabled, secret_refs,
		timeout_sec, steps, last_run_at, next_run_at, created_at, updated_at FROM instance_automation
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
		if t, perr := parseDBTime(started.String); perr == nil && !t.IsZero() {
			run.StartedAt = t
		}
		if finished.Valid && finished.String != "" {
			if t, perr := parseDBTime(finished.String); perr == nil && !t.IsZero() {
				run.FinishedAt = &t
			}
		}
		out = append(out, run)
	}
	return out, rows.Err()
}
