package models

import "time"

// Instance advanced feature models: per-instance automation jobs and their
// run history, snapshots, the instance audit log, and the cached live-state
// blob. These back internal/repository/instance_advanced_repo.go,
// automation_repo.go, and the handlers/scheduler/cron that consume them.
//
// They are intentionally plain data-carrier structs; JSON tags mirror the
// field the (un)marshalling code in the repos relies on, and time fields use
// the same SQLite TEXT "2006-01-02 15:04:05" convention the rest of the
// panel uses (parsed in the repos).

// Secrets are stored encrypted at the panel layer with AES-256-GCM; the
// master key is read from KSPANEL_MASTER_KEY (or minted in-memory for a
// throwaway install). The ValueBlob is the sealed nonce||ciphertext||tag —
// it never serialises over JSON; the list endpoint returns MaskedValue or
// the cleartext (for non-secret env) instead.
type Secret struct {
	ID          int64     `json:"id"`
	InstanceID  int64     `json:"instance_id"`
	Key         string    `json:"key"`
	ValueBlob   []byte    `json:"-"`               // sealed; never serialised
	Value       string    `json:"value,omitempty"` // populated for non-secret env / reveal
	MaskedValue string    `json:"masked_value,omitempty"`
	IsSecret    bool      `json:"is_secret"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Automation is one scheduled (or on-demand) command attached to an
// instance. The scheduler (internal/scheduler) selects enabled jobs whose
// next_run_at has passed, resolves their secret refs, and fires them on the
// owning edge; runs are recorded as AutomationRun rows for the audit strip.
type Automation struct {
	ID         int64      `json:"id"`
	InstanceID int64      `json:"instance_id"`
	Name       string     `json:"name"`
	Command    string     `json:"command"`
	Schedule   string     `json:"schedule"`
	Enabled    bool       `json:"enabled"`
	SecretRefs []string   `json:"secret_refs"`
	TimeoutSec int        `json:"timeout_sec"`
	LastRunAt  *time.Time `json:"last_run_at,omitempty"`
	NextRunAt  *time.Time `json:"next_run_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// AutomationTrigger is the categorical reason a run was launched. The
// scheduler sets "schedule"; the manual TriggerRunHandler sets "manual". Kept
// as a typed string (not an int) so the audit log / run rows read cleanly in
// SQLite without a lookup table.
type AutomationTrigger string

const (
	// AutomationTriggerManual marks an on-demand run fired by TriggerRunHandler.
	AutomationTriggerManual AutomationTrigger = "manual"
	// AutomationTriggerSchedule marks a run fired by the cron scheduler.
	AutomationTriggerSchedule AutomationTrigger = "schedule"
)

// AutomationRun is the captured outcome of one automation job execution. The
// stdout/stderr/exit_code are captured by the edge and echoed back; the panel
// stores them verbatim so the per-instance "Recent runs" strip can replay.
type AutomationRun struct {
	ID         int64      `json:"id"`
	JobID      int64      `json:"job_id"`
	InstanceID int64      `json:"instance_id"`
	Trigger    string     `json:"trigger"`
	Command    string     `json:"command"`
	Stdout     string     `json:"stdout,omitempty"`
	Stderr     string     `json:"stderr,omitempty"`
	ExitCode   int        `json:"exit_code"`
	DurationMS int64      `json:"duration_ms,omitempty"`
	Error      string     `json:"error,omitempty"`
	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
}

// InstanceSnapshot is a restore point the edge captured for an instance.
// ExternalRef is the opaque ksedge-side handle; the panel only records the
// metadata so the UI can offer a rollback. Deletion removes the row; the
// edge garbage-collects the actual snapshot by external ref on its own.
type InstanceSnapshot struct {
	ID          int64     `json:"id"`
	InstanceID  int64     `json:"instance_id"`
	Name        string    `json:"name"`
	ExternalRef string    `json:"external_ref,omitempty"`
	SizeBytes   int64     `json:"size_bytes,omitempty"`
	Note        string    `json:"note,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// InstanceAuditRow is one entry in the per-instance audit feed. The panel
// appends rows on lifecycle transitions (start/stop/destroy/snapshot/...)
// so an operator can trace who did what when without spelunking the global
// activity log.
type InstanceAuditRow struct {
	ID         int64     `json:"id"`
	InstanceID int64     `json:"instance_id"`
	Actor      string    `json:"actor"`
	Action     string    `json:"action"`
	Detail     string    `json:"detail,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// InstanceLiveState is the cached, most-recently-reported runtime state of an
// instance. The edge streams this on a heartbeat; the panel caches the last
// blob so the detail page paints instantly instead of waiting on an edge RPC.
// Metrics/Processes/Ports/Info are opaque JSON kept verbatim from the edge.
type InstanceLiveState struct {
	InstanceID int64     `json:"instance_id"`
	UpdatedAt  time.Time `json:"updated_at"`
	Metrics    string    `json:"metrics"`
	Processes  string    `json:"processes"`
	Ports      string    `json:"ports"`
	Info       string    `json:"info"`
}
