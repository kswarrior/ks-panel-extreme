package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/example/kspanel/internal/models"
)

var ErrApplicationPermissionsNotGranted = errors.New("application permissions not granted")

type ApplicationRepository struct {
	db *sql.DB
}

func NewApplicationRepository(db *sql.DB) *ApplicationRepository {
	return &ApplicationRepository{db: db}
}

const applicationColumns = `id, name, slug, category, version, description, icon, runtime, entrypoint,
	config_schema, files, env, permissions, active, uploaded_by, source, source_url, created_at, updated_at`

func scanApplication(scanner interface{ Scan(...any) error }) (*models.Application, error) {
	var a models.Application
	var cfgSchema, files, env, perms, source, sourceURL string
	var uploadedBy sql.NullInt64
	var active int
	var created, updated string
	if err := scanner.Scan(&a.ID, &a.Name, &a.Slug, &a.Category, &a.Version, &a.Description,
		&a.Icon, &a.Runtime, &a.Entrypoint, &cfgSchema, &files, &env, &perms, &active,
		&uploadedBy, &source, &sourceURL, &created, &updated); err != nil {
		return nil, err
	}
	a.ConfigSchema = json.RawMessage(cfgSchema)
	a.Files = json.RawMessage(files)
	a.Env = json.RawMessage(env)
	a.Permissions = json.RawMessage(perms)
	a.Active = active != 0
	if source == "" {
		source = models.ApplicationSourceFile
	}
	a.Source = source
	a.SourceURL = sourceURL
	if uploadedBy.Valid {
		v := uploadedBy.Int64
		a.UploadedBy = &v
	}
	a.CreatedAt, _ = parseSQLiteTime(created)
	a.UpdatedAt, _ = parseSQLiteTime(updated)
	return &a, nil
}

type ApplicationPermissionReq struct {
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
}

type CreateApplicationInput struct {
	Name           string
	Slug           string
	Category       string
	Version        string
	Description    string
	Icon           string
	Runtime        string
	Entrypoint     string
	ConfigSchema   json.RawMessage
	Files          json.RawMessage
	PermissionsReq []ApplicationPermissionReq
	UploadedBy     int64
	Source         string
	SourceURL      string
}

func (r *ApplicationRepository) CreateApplication(in CreateApplicationInput) (*models.Application, error) {
	if in.Name == "" || in.Slug == "" {
		return nil, fmt.Errorf("name and slug are required")
	}
	if in.Category == "" {
		in.Category = "custom"
	}
	if in.Version == "" {
		in.Version = "1.0.0"
	}
	if in.Runtime == "" {
		in.Runtime = "nodejs"
	}
	cfgSchema := string(in.ConfigSchema)
	if cfgSchema == "" {
		// The run engine (buildAppRunPayload) reads this as a JSON array of
		// field definitions — store "[]", not "{}", so an app created
		// without config_schema stays runnable.
		cfgSchema = "[]"
	}
	files := string(in.Files)
	if files == "" {
		files = "[]"
	}
	perms, _ := json.Marshal(in.PermissionsReq)
	if string(perms) == "" {
		perms = []byte("[]")
	}
	source := in.Source
	if source == "" {
		source = models.ApplicationSourceFile
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id, err := insertReturningID(tx,
		`INSERT INTO applications (name, slug, category, version, description, icon, runtime, entrypoint,
			config_schema, files, permissions, active, uploaded_by, source, source_url, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
		in.Name, in.Slug, in.Category, in.Version, in.Description, in.Icon,
		in.Runtime, in.Entrypoint, cfgSchema, files, string(perms),
		in.UploadedBy, source, in.SourceURL, now, now,
	)
	if err != nil {
		return nil, err
	}

	for _, p := range in.PermissionsReq {
		if _, err := tx.Exec(
			`INSERT INTO application_permissions (application_id, capability, access_level, granted) VALUES (?, ?, ?, 0)`,
			id, p.Capability, p.AccessLevel,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetApplication(id)
}

type UpdateApplicationInput struct {
	Name         string
	Category     string
	Version      string
	Description  string
	Icon         string
	Runtime      string
	Entrypoint   string
	ConfigSchema json.RawMessage
	// Files is optional; nil leaves the stored script files untouched so
	// partial editors (general-info form) don't wipe Studio files.
	Files json.RawMessage
}

func (r *ApplicationRepository) UpdateApplication(id int64, in UpdateApplicationInput) (*models.Application, error) {
	if id == 0 {
		return nil, fmt.Errorf("application id is required")
	}
	cfgSchema := string(in.ConfigSchema)
	if cfgSchema == "" {
		// Keep the array shape the run engine expects (see CreateApplication).
		cfgSchema = "[]"
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	var res sql.Result
	var err error
	if in.Files != nil {
		files := string(in.Files)
		if files == "" {
			files = "[]"
		}
		res, err = r.db.Exec(
			`UPDATE applications SET name = ?, category = ?, version = ?, description = ?,
			 icon = ?, runtime = ?, entrypoint = ?, config_schema = ?, files = ?, updated_at = ? WHERE id = ?`,
			in.Name, in.Category, in.Version, in.Description,
			in.Icon, in.Runtime, in.Entrypoint, cfgSchema, files, now, id,
		)
	} else {
		res, err = r.db.Exec(
			`UPDATE applications SET name = ?, category = ?, version = ?, description = ?,
			 icon = ?, runtime = ?, entrypoint = ?, config_schema = ?, updated_at = ? WHERE id = ?`,
			in.Name, in.Category, in.Version, in.Description,
			in.Icon, in.Runtime, in.Entrypoint, cfgSchema, now, id,
		)
	}
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, fmt.Errorf("application not found")
	}
	return r.GetApplication(id)
}

func (r *ApplicationRepository) ListApplications() ([]models.Application, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM applications`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.Application, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`
		SELECT a.id, a.name, a.slug, a.category, a.version, a.description, a.icon,
		       a.runtime, a.entrypoint, a.config_schema, a.files, a.env, a.permissions, a.active,
		       a.uploaded_by, a.source, a.source_url, a.created_at, a.updated_at, u.username
		FROM applications a
		LEFT JOIN users u ON u.id = a.uploaded_by
		ORDER BY a.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a models.Application
		var cfgSchema, files, env, perms, source, sourceURL string
		var uploadedBy sql.NullInt64
		var active int
		var created, updated string
		var owner sql.NullString
		if err := rows.Scan(&a.ID, &a.Name, &a.Slug, &a.Category, &a.Version, &a.Description,
			&a.Icon, &a.Runtime, &a.Entrypoint, &cfgSchema, &files, &env, &perms, &active,
			&uploadedBy, &source, &sourceURL, &created, &updated, &owner); err != nil {
			return nil, err
		}
		a.ConfigSchema = json.RawMessage(cfgSchema)
		a.Files = json.RawMessage(files)
		a.Env = json.RawMessage(env)
		a.Permissions = json.RawMessage(perms)
		a.Active = active != 0
		if source == "" {
			source = models.ApplicationSourceFile
		}
		a.Source = source
		a.SourceURL = sourceURL
		if uploadedBy.Valid {
			v := uploadedBy.Int64
			a.UploadedBy = &v
		}
		a.CreatedAt, _ = parseSQLiteTime(created)
		a.UpdatedAt, _ = parseSQLiteTime(updated)
		a.OwnerName = owner.String
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *ApplicationRepository) GetApplication(id int64) (*models.Application, error) {
	row := r.db.QueryRow(`SELECT `+applicationColumns+` FROM applications WHERE id = ?`, id)
	a, err := scanApplication(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("application not found")
		}
		return nil, err
	}
	if a.UploadedBy != nil {
		var nm sql.NullString
		_ = r.db.QueryRow(`SELECT username FROM users WHERE id = ?`, *a.UploadedBy).Scan(&nm)
		a.OwnerName = nm.String
	}
	return a, nil
}

func (r *ApplicationRepository) ListApplicationPermissions(appID int64) ([]models.ApplicationPermission, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM application_permissions WHERE application_id = ?`, appID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.ApplicationPermission, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, application_id, capability, access_level, granted FROM application_permissions WHERE application_id = ? ORDER BY id ASC`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p models.ApplicationPermission
		var granted int
		if err := rows.Scan(&p.ID, &p.ApplicationID, &p.Capability, &p.AccessLevel, &granted); err != nil {
			return nil, err
		}
		p.Granted = granted != 0
		out = append(out, p)
	}
	return out, rows.Err()
}

type AppGrantDecision struct {
	Capability string
	Granted    bool
}

func (r *ApplicationRepository) SetApplicationGrants(appID int64, decisions []AppGrantDecision) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, d := range decisions {
		flag := 0
		if d.Granted {
			flag = 1
		}
		res, err := tx.Exec(
			`UPDATE application_permissions SET granted = ? WHERE application_id = ? AND capability = ?`,
			flag, appID, d.Capability,
		)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			continue
		}
	}
	return tx.Commit()
}

func (r *ApplicationRepository) AllApplicationGrantsGranted(appID int64) (bool, error) {
	var pending int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM application_permissions WHERE application_id = ? AND granted = 0`,
		appID,
	).Scan(&pending); err != nil {
		return false, err
	}
	return pending == 0, nil
}

func (r *ApplicationRepository) ActivateApplication(appID int64) error {
	ok, err := r.AllApplicationGrantsGranted(appID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrApplicationPermissionsNotGranted
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`UPDATE applications SET active = 1, updated_at = ? WHERE id = ?`, now, appID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("application not found")
	}
	return nil
}

func (r *ApplicationRepository) DeactivateApplication(appID int64) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`UPDATE applications SET active = 0, updated_at = ? WHERE id = ?`, now, appID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("application not found")
	}
	return nil
}

func (r *ApplicationRepository) DeleteApplication(id int64) error {
	res, err := r.db.Exec(`DELETE FROM applications WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("application not found")
	}
	return nil
}

func (r *ApplicationRepository) UpdateApplicationEnv(id int64, envJSON string) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	_, err := r.db.Exec(`UPDATE applications SET env = ?, updated_at = ? WHERE id = ?`, envJSON, now, id)
	return err
}

// CreateApplicationRun records the start of one execution and returns its id.
// The triggered_by column is omitted entirely when unset — the bundled
// modernc sqlite driver rejects nil bindings, so NULL comes from the column
// default instead of an argument.
func (r *ApplicationRepository) CreateApplicationRun(run *models.ApplicationRun) (int64, error) {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	var (
		res sql.Result
		err error
	)
	if run.TriggeredBy != nil {
		res, err = r.db.Exec(
			`INSERT INTO application_runs
			 (application_id, triggered_by, target, node_id, node_name, exec_mode, workload,
			  status, timeout_sec, created_at, ended_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
			run.ApplicationID, *run.TriggeredBy, run.Target, run.NodeID, run.NodeName,
			run.ExecMode, run.Workload, models.AppRunStatusRunning, run.TimeoutSec, now,
		)
	} else {
		res, err = r.db.Exec(
			`INSERT INTO application_runs
			 (application_id, target, node_id, node_name, exec_mode, workload,
			  status, timeout_sec, created_at, ended_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
			run.ApplicationID, run.Target, run.NodeID, run.NodeName,
			run.ExecMode, run.Workload, models.AppRunStatusRunning, run.TimeoutSec, now,
		)
	}
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// CompleteApplicationRun stores the final outcome of a run row. nodeID /
// nodeName carry the executor resolved AFTER insert (panel-target runs may
// route through a local node discovered mid-flight) so history rows record
// what actually executed, not just what was requested.
func (r *ApplicationRepository) CompleteApplicationRun(id int64, status string, exitCode int, output, errorOutput, runErr string, nodeID int64, nodeName string) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	_, err := r.db.Exec(
		`UPDATE application_runs SET status = ?, exit_code = ?, output = ?, error_output = ?, error = ?,
		 node_id = ?, node_name = ?, ended_at = ? WHERE id = ?`,
		status, exitCode, output, errorOutput, runErr, nodeID, nodeName, now, id,
	)
	return err
}

// ListApplicationRuns returns the most recent runs for an application,
// newest first.
func (r *ApplicationRepository) ListApplicationRuns(appID int64, limit int) ([]models.ApplicationRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	rows, err := r.db.Query(
		`SELECT `+applicationRunColumns+` FROM application_runs WHERE application_id = ? ORDER BY id DESC LIMIT `+strconv.Itoa(limit),
		appID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ApplicationRun, 0, limit)
	for rows.Next() {
		run, scanErr := scanApplicationRun(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, *run)
	}
	return out, rows.Err()
}

const applicationRunColumns = `id, application_id, triggered_by, target, node_id, node_name,
	exec_mode, workload, status, exit_code, output, error_output, error, timeout_sec, created_at, ended_at`

func scanApplicationRun(scanner interface{ Scan(...any) error }) (*models.ApplicationRun, error) {
	var run models.ApplicationRun
	var triggeredBy sql.NullInt64
	var nodeName, execMode, workload, status, output, errorOutput, runErr string
	var created, ended string
	if err := scanner.Scan(&run.ID, &run.ApplicationID, &triggeredBy, &run.Target, &run.NodeID,
		&nodeName, &execMode, &workload, &status, &run.ExitCode, &output, &errorOutput,
		&runErr, &run.TimeoutSec, &created, &ended); err != nil {
		return nil, err
	}
	if triggeredBy.Valid {
		v := triggeredBy.Int64
		run.TriggeredBy = &v
	}
	run.NodeName = nodeName
	run.ExecMode = execMode
	run.Workload = workload
	run.Status = status
	run.Output = output
	run.ErrorOutput = errorOutput
	run.Error = runErr
	run.CreatedAt, _ = parseSQLiteTime(created)
	run.EndedAt, _ = parseSQLiteTime(ended)
	return &run, nil
}
