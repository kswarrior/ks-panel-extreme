package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// InstanceRepository manages the `instances` table. The row is the panel's
// bookkeeping view of a workload; the real lifecycle (docker/lxd/kvm/
// multipass) is owned by ksedge and reconciled back here via the external_id
// and status columns.
type InstanceRepository struct {
	db *sql.DB
}

func NewInstanceRepository(db *sql.DB) *InstanceRepository {
	return &InstanceRepository{db: db}
}

// List returns every instance joined with its node + template names so the
// admin table can render a single self-contained row. The COUNT(*) guard
// mirrors ApiKeyRepository.ListApiKeys for the modernc.org/sqlite empty-set
// quirk.
func (r *InstanceRepository) List() ([]models.Instance, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instances`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.Instance, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT i.id, i.node_id, n.name, i.template_id, t.name,
		i.owner_id, COALESCE(u.username, ''),
		i.name, i.display_name, i.icon, i.color, i.kind, i.status, i.external_id, i.config, i.error,
		i.install_state, i.install_id, i.install_step, i.install_error, i.install_steps_json,
		i.install_kind, i.install_auto_stop, i.install_action_id,
		i.suspended, i.suspended_until, i.suspension_count, i.suspension_history,
		i.started_at, i.created_at, i.updated_at
		FROM instances i
		LEFT JOIN nodes n     ON n.id = i.node_id
		LEFT JOIN templates t ON t.id = i.template_id
		LEFT JOIN users u     ON u.id = i.owner_id
		ORDER BY i.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var inst models.Instance
		var startedAt, created, updated sql.NullString
		var ownerID sql.NullInt64
		var suspended sql.NullInt64
		var suspendedUntil sql.NullString
		var suspensionCount sql.NullInt64
		var suspensionHistory sql.NullString
		if err := rows.Scan(&inst.ID, &inst.NodeID, &inst.NodeName, &inst.TemplateID, &inst.TemplateName,
			&ownerID, &inst.OwnerName,
			&inst.Name, &inst.DisplayName, &inst.Icon, &inst.Color, &inst.Kind, &inst.Status, &inst.ExternalID, &inst.Config, &inst.Error,
			&inst.InstallState, &inst.InstallID, &inst.InstallStep, &inst.InstallError, &inst.InstallStepsJSON,
			&inst.InstallKind, &inst.InstallAutoStop, &inst.InstallActionID,
			&suspended, &suspendedUntil, &suspensionCount, &suspensionHistory,
			&startedAt, &created, &updated); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			inst.OwnerID = ownerID.Int64
		}
		if suspended.Valid {
			inst.Suspended = int(suspended.Int64)
		}
		if suspendedUntil.Valid && suspendedUntil.String != "" {
			t, _ := time.Parse("2006-01-02 15:04:05", suspendedUntil.String)
			inst.SuspendedUntil = &t
		}
		if suspensionCount.Valid {
			inst.SuspensionCount = int(suspensionCount.Int64)
		}
		if suspensionHistory.Valid {
			inst.SuspensionHistory = suspensionHistory.String
		}
		if startedAt.Valid && startedAt.String != "" {
			t, _ := time.Parse("2006-01-02 15:04:05", startedAt.String)
			if !t.IsZero() {
				inst.StartedAt = &t
			}
		}
		inst.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
		inst.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated.String)
		out = append(out, inst)
	}
	return out, rows.Err()
}

// ListByOwner returns only the instances owned by the given user. Mirrors
// List() but adds a WHERE clause; called from /api/me/instances so a
// regular user sees just their own workloads, never anyone else's.
func (r *InstanceRepository) ListByOwner(ownerID int64) ([]models.Instance, error) {
	// modernc.org/sqlite emits a single all-NULL phantom row for a LEFT JOIN
	// query over an empty driving table, so we guard with a count first —
	// mirroring List(). Without this the scan of the NULL id would blow up.
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instances WHERE owner_id = ?`, ownerID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return []models.Instance{}, nil
	}
	rows, err := r.db.Query(`SELECT i.id, i.node_id, n.name, i.template_id, t.name,
		i.owner_id, COALESCE(u.username, ''),
		i.name, i.display_name, i.icon, i.color, i.kind, i.status, i.external_id, i.config, i.error,
		i.install_state, i.install_id, i.install_step, i.install_error, i.install_steps_json,
		i.install_kind, i.install_auto_stop, i.install_action_id,
		i.suspended, i.suspended_until, i.suspension_count, i.suspension_history,
		i.started_at, i.created_at, i.updated_at
		FROM instances i
		LEFT JOIN nodes n     ON n.id = i.node_id
		LEFT JOIN templates t ON t.id = i.template_id
		LEFT JOIN users u     ON u.id = i.owner_id
		WHERE i.owner_id = ?
		ORDER BY i.created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Instance, 0, 8)
	for rows.Next() {
		var inst models.Instance
		var startedAt, created, updated sql.NullString
		var ownerID sql.NullInt64
		var suspended sql.NullInt64
		var suspendedUntil sql.NullString
		var suspensionCount sql.NullInt64
		var suspensionHistory sql.NullString
		if err := rows.Scan(&inst.ID, &inst.NodeID, &inst.NodeName, &inst.TemplateID, &inst.TemplateName,
			&ownerID, &inst.OwnerName,
			&inst.Name, &inst.DisplayName, &inst.Icon, &inst.Color, &inst.Kind, &inst.Status, &inst.ExternalID, &inst.Config, &inst.Error,
			&inst.InstallState, &inst.InstallID, &inst.InstallStep, &inst.InstallError, &inst.InstallStepsJSON,
			&inst.InstallKind, &inst.InstallAutoStop, &inst.InstallActionID,
			&suspended, &suspendedUntil, &suspensionCount, &suspensionHistory,
			&startedAt, &created, &updated); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			inst.OwnerID = ownerID.Int64
		}
		if suspended.Valid {
			inst.Suspended = int(suspended.Int64)
		}
		if suspendedUntil.Valid && suspendedUntil.String != "" {
			t, _ := time.Parse("2006-01-02 15:04:05", suspendedUntil.String)
			inst.SuspendedUntil = &t
		}
		if suspensionCount.Valid {
			inst.SuspensionCount = int(suspensionCount.Int64)
		}
		if suspensionHistory.Valid {
			inst.SuspensionHistory = suspensionHistory.String
		}
		if startedAt.Valid && startedAt.String != "" {
			t, _ := time.Parse("2006-01-02 15:04:05", startedAt.String)
			if !t.IsZero() {
				inst.StartedAt = &t
			}
		}
		inst.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
		inst.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated.String)
		out = append(out, inst)
	}
	return out, rows.Err()
}

// Get returns a single instance by id.
func (r *InstanceRepository) Get(id int64) (*models.Instance, error) {
	var inst models.Instance
	var instID, nodeID, tplID, ownerID sql.NullInt64
	var nodeName, tplName, ownerName, name, displayName, icon, color, kind, status, externalID, config, errStr, installState, installID, installError, installStepsJSON, installKind, installActionID sql.NullString
	var installStep, installAutoStop sql.NullInt64
	var startedAt, created, updated sql.NullString
	var suspended sql.NullInt64
	var suspendedUntil sql.NullString
	var suspensionCount sql.NullInt64
	var suspensionHistory sql.NullString
	err := r.db.QueryRow(`SELECT i.id, i.node_id, n.name, i.template_id, t.name,
		i.owner_id, COALESCE(u.username, ''),
		i.name, i.display_name, i.icon, i.color, i.kind, i.status, i.external_id, i.config, i.error,
		i.install_state, i.install_id, i.install_step, i.install_error, i.install_steps_json,
		i.install_kind, i.install_auto_stop, i.install_action_id,
		i.suspended, i.suspended_until, i.suspension_count, i.suspension_history,
		i.started_at, i.created_at, i.updated_at
		FROM instances i
		LEFT JOIN nodes n     ON n.id = i.node_id
		LEFT JOIN templates t ON t.id = i.template_id
		LEFT JOIN users u     ON u.id = i.owner_id
		WHERE i.id = ?`, id).Scan(
		&instID, &nodeID, &nodeName, &tplID, &tplName,
		&ownerID, &ownerName,
		&name, &displayName, &icon, &color, &kind, &status, &externalID, &config, &errStr,
		&installState, &installID, &installStep, &installError, &installStepsJSON,
		&installKind, &installAutoStop, &installActionID,
		&suspended, &suspendedUntil, &suspensionCount, &suspensionHistory,
		&startedAt, &created, &updated)
	if err != nil || !instID.Valid {
		return nil, fmt.Errorf("instance not found")
	}
	inst.ID = instID.Int64
	inst.NodeID = nodeID.Int64
	inst.NodeName = nodeName.String
	inst.TemplateID = tplID.Int64
	inst.TemplateName = tplName.String
	if ownerID.Valid {
		inst.OwnerID = ownerID.Int64
	}
	inst.OwnerName = ownerName.String
	inst.Name = name.String
	inst.DisplayName = displayName.String
	inst.Icon = icon.String
	inst.Color = color.String
	inst.Kind = kind.String
	inst.Status = status.String
	inst.ExternalID = externalID.String
	inst.Config = config.String
	inst.Error = errStr.String
	if suspended.Valid {
		inst.Suspended = int(suspended.Int64)
	}
	if suspendedUntil.Valid && suspendedUntil.String != "" {
		t, _ := time.Parse("2006-01-02 15:04:05", suspendedUntil.String)
		inst.SuspendedUntil = &t
	}
	if suspensionCount.Valid {
		inst.SuspensionCount = int(suspensionCount.Int64)
	}
	if suspensionHistory.Valid {
		inst.SuspensionHistory = suspensionHistory.String
	}
	if installState.Valid {
		inst.InstallState = installState.String
	}
	if installID.Valid {
		inst.InstallID = installID.String
	}
	if installStep.Valid {
		inst.InstallStep = int(installStep.Int64)
	}
	if installError.Valid {
		inst.InstallError = installError.String
	}
	if installStepsJSON.Valid {
		inst.InstallStepsJSON = installStepsJSON.String
	}
	if installKind.Valid {
		inst.InstallKind = installKind.String
	}
	if installAutoStop.Valid {
		inst.InstallAutoStop = int(installAutoStop.Int64)
	}
	if installActionID.Valid {
		inst.InstallActionID = installActionID.String
	}
	if startedAt.Valid && startedAt.String != "" {
		t, _ := time.Parse("2006-01-02 15:04:05", startedAt.String)
		if !t.IsZero() {
			inst.StartedAt = &t
		}
	}
	inst.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
	inst.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated.String)
	return &inst, nil
}

// CreateInput is the shape the deploy handler passes when a deploy RPC
// returns successfully.
type InstanceCreateInput struct {
	NodeID           int64
	TemplateID       int64
	OwnerID          int64
	Name             string
	DisplayName      string
	Icon             string
	Color            string
	Kind             string
	Status           string
	ExternalID       string
	Config           string
	InstallState     string // "running" when deploy has install workflow, else ""
	InstallID        string // "<kind>:<name>" key
	InstallStep      int    // -1 = not started
	InstallError     string
	InstallStepsJSON string
}

// Create persists a freshly-deployed instance. Called after the edge RPC
// returns OK so the row only lands if the workload really exists.
func (r *InstanceRepository) Create(in InstanceCreateInput) (int64, error) {
	res, err := r.db.Exec(`INSERT INTO instances (node_id, template_id, owner_id, name, display_name, icon, color, kind, status, external_id, config,
		install_state, install_id, install_step, install_error, install_steps_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.NodeID, in.TemplateID, nullableInt64(in.OwnerID), in.Name, in.DisplayName, in.Icon, in.Color, in.Kind, in.Status, in.ExternalID, in.Config,
		in.InstallState, in.InstallID, in.InstallStep, in.InstallError, in.InstallStepsJSON)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// nullableInt64 returns NULL when the id is 0 — legacy behaviour for
// deploys that don't have an owner (e.g. seeds) so the FK stays valid.
// Otherwise the modernc driver rejects naked `nil` arguments.
func nullableInt64(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}

// SetStatus mirrors an edge-reported lifecycle status into the row. Used by
// start/stop/destroy handlers and by a future inspect reconciliation loop.
// It also maintains started_at for uptime: set to now when entering running,
// cleared when entering stopped/destroyed, otherwise left as-is.
func (r *InstanceRepository) SetStatus(id int64, status, extID, errMsg string) error {
	res, err := r.db.Exec(`UPDATE instances SET status = ?, external_id = COALESCE(NULLIF(?,''), external_id), error = ?, started_at = CASE WHEN ? = 'running' THEN CURRENT_TIMESTAMP WHEN ? IN ('stopped','destroyed') THEN NULL ELSE started_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		status, extID, errMsg, status, status, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// UpdateInstallStatus updates the install workflow tracking columns. Called by
// the install poller after each poll of the edge's /api/edge/install endpoint.
func (r *InstanceRepository) UpdateInstallStatus(id int64, state, installID string, step int, errMsg, stepsJSON string) error {
	res, err := r.db.Exec(`UPDATE instances SET install_state = ?, install_id = ?, install_step = ?, install_error = ?, install_steps_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		state, installID, step, errMsg, stepsJSON, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// UpdateConfig persists an edited instance config JSON (the spec blob the
// edge drivers consume). Called by UpdateInstanceHandler after the admin
// editor saves; identity/lifecycle columns are untouched here.
func (r *InstanceRepository) UpdateConfig(id int64, configJSON string) error {
	res, err := r.db.Exec(`UPDATE instances SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		configJSON, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// UpdateIdentity renames the human-facing display fields (display_name,
// icon, color) without touching the workload: the container/VM name on the
// edge is immutable, so only the labels cards and titles render change.
func (r *InstanceRepository) UpdateIdentity(id int64, displayName, icon, color string) error {
	res, err := r.db.Exec(`UPDATE instances SET display_name = ?, icon = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		displayName, icon, color, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// SetInstallKind updates the install_kind + install_auto_stop columns. Used by
// InvokeActionHandler when an action is invoked so the install sweep loop can
// distinguish an action-driven workflow from a template install workflow,
// and decide on completion whether to stop the container based on the
// action's auto_stop_on_exit flag. Pass kind=” to reset to "install" mode
// (default deploy workflow) and autoStop=0.
func (r *InstanceRepository) SetInstallKind(id int64, kind string, autoStop int) error {
	res, err := r.db.Exec(`UPDATE instances SET install_kind = ?, install_auto_stop = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		kind, autoStop, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// SetInstallActionID records which template action is currently in flight, so
// the home-page Actions card can morph only the matching button to a "Stop"
// button. InvokeActionHandler sets it to the spec.actions[].id it accepted;
// the install sweep loop and StopActionHandler clear it back to "" once the
// workflow resolves or is cancelled. Empty string resets it (no action in
// flight).
func (r *InstanceRepository) SetInstallActionID(id int64, actionID string) error {
	res, err := r.db.Exec(`UPDATE instances SET install_action_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		actionID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// Delete removes the row entirely. Called after a successful "destroy" RPC.
func (r *InstanceRepository) Delete(id int64) error {
	res, err := r.db.Exec(`DELETE FROM instances WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

// SuspensionRecord represents a single suspension entry in the history.
type InstanceSuspensionRecord struct {
	Timestamp string `json:"timestamp"`
	Reason    string `json:"reason"`
	Duration  string `json:"duration"` // "until_admin" or "auto:YYYY-MM-DD HH:MM:SS"
	AdminID   int64  `json:"admin_id"`
	AdminName string `json:"admin_name"`
}

// SuspendInstance suspends an instance with optional auto-unsuspend time.
// If suspendedUntil is nil, the suspension is indefinite (until admin unsuspends).
// Returns the new suspension count.
func (r *InstanceRepository) SuspendInstance(id int64, suspendedUntil *time.Time, reason string, adminID int64, adminName string) (int, error) {
	// Get current instance to read existing history
	inst, err := r.Get(id)
	if err != nil {
		return 0, err
	}

	// Parse existing history
	var history []InstanceSuspensionRecord
	if inst.SuspensionHistory != "" {
		_ = json.Unmarshal([]byte(inst.SuspensionHistory), &history)
	}

	// Create new suspension record
	var durationStr string
	if suspendedUntil != nil {
		durationStr = "auto:" + suspendedUntil.Format("2006-01-02 15:04:05")
	} else {
		durationStr = "until_admin"
	}

	record := InstanceSuspensionRecord{
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		Reason:    reason,
		Duration:  durationStr,
		AdminID:   adminID,
		AdminName: adminName,
	}
	history = append(history, record)

	// Marshal updated history
	historyJSON, err := json.Marshal(history)
	if err != nil {
		return 0, err
	}

	newCount := inst.SuspensionCount + 1

	// Build the update query
	var query string
	var args []any
	if suspendedUntil != nil {
		query = `UPDATE instances SET suspended = 1, suspended_until = ?, suspension_count = ?, suspension_history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
		args = []any{suspendedUntil.Format("2006-01-02 15:04:05"), newCount, string(historyJSON), id}
	} else {
		query = `UPDATE instances SET suspended = 1, suspended_until = NULL, suspension_count = ?, suspension_history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
		args = []any{newCount, string(historyJSON), id}
	}

	_, err = r.db.Exec(query, args...)
	if err != nil {
		return 0, err
	}

	return newCount, nil
}

// UnsuspendInstance unsuspends an instance.
// Returns the current suspension count (unchanged).
func (r *InstanceRepository) UnsuspendInstance(id int64) (int, error) {
	inst, err := r.Get(id)
	if err != nil {
		return 0, err
	}

	_, err = r.db.Exec(`UPDATE instances SET suspended = 0, suspended_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
	if err != nil {
		return 0, err
	}

	return inst.SuspensionCount, nil
}

// IsInstanceSuspended checks if an instance is currently suspended.
// Returns (isSuspended, suspensionEndTime, error)
func (r *InstanceRepository) IsInstanceSuspended(id int64) (bool, *time.Time, error) {
	var suspended int
	var suspendedUntil sql.NullString
	err := r.db.QueryRow(`SELECT suspended, suspended_until FROM instances WHERE id = ?`, id).Scan(&suspended, &suspendedUntil)
	if err != nil {
		return false, nil, err
	}

	if suspended == 0 {
		return false, nil, nil
	}

	if suspendedUntil.Valid && suspendedUntil.String != "" {
		t, err := time.Parse("2006-01-02 15:04:05", suspendedUntil.String)
		if err != nil {
			return true, nil, nil
		}
		// Check if suspension has expired
		if time.Now().After(t) {
			// Auto-unsuspend
			_, _ = r.db.Exec(`UPDATE instances SET suspended = 0, suspended_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
			return false, nil, nil
		}
		return true, &t, nil
	}

	// Suspended until admin unsuspends
	return true, nil, nil
}
