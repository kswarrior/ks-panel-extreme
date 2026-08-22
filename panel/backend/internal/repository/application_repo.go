package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
	config_schema, permissions, active, uploaded_by, source, source_url, created_at, updated_at`

func scanApplication(scanner interface{ Scan(...any) error }) (*models.Application, error) {
	var a models.Application
	var cfgSchema, perms, source, sourceURL string
	var uploadedBy sql.NullInt64
	var active int
	var created, updated string
	if err := scanner.Scan(&a.ID, &a.Name, &a.Slug, &a.Category, &a.Version, &a.Description,
		&a.Icon, &a.Runtime, &a.Entrypoint, &cfgSchema, &perms, &active,
		&uploadedBy, &source, &sourceURL, &created, &updated); err != nil {
		return nil, err
	}
	a.ConfigSchema = json.RawMessage(cfgSchema)
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
	Name             string
	Slug             string
	Category         string
	Version          string
	Description      string
	Icon             string
	Runtime          string
	Entrypoint       string
	ConfigSchema     json.RawMessage
	PermissionsReq   []ApplicationPermissionReq
	UploadedBy       int64
	Source           string
	SourceURL        string
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
		cfgSchema = "{}"
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

	res, err := tx.Exec(
		`INSERT INTO applications (name, slug, category, version, description, icon, runtime, entrypoint,
			config_schema, permissions, active, uploaded_by, source, source_url, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
		in.Name, in.Slug, in.Category, in.Version, in.Description, in.Icon,
		in.Runtime, in.Entrypoint, cfgSchema, string(perms),
		in.UploadedBy, source, in.SourceURL, now, now,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
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
	Name        string
	Category    string
	Version     string
	Description string
	Icon        string
	Runtime     string
	Entrypoint  string
	ConfigSchema json.RawMessage
}

func (r *ApplicationRepository) UpdateApplication(id int64, in UpdateApplicationInput) (*models.Application, error) {
	if id == 0 {
		return nil, fmt.Errorf("application id is required")
	}
	cfgSchema := string(in.ConfigSchema)
	if cfgSchema == "" {
		cfgSchema = "{}"
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(
		`UPDATE applications SET name = ?, category = ?, version = ?, description = ?,
		 icon = ?, runtime = ?, entrypoint = ?, config_schema = ?, updated_at = ? WHERE id = ?`,
		in.Name, in.Category, in.Version, in.Description,
		in.Icon, in.Runtime, in.Entrypoint, cfgSchema, now, id,
	)
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
		       a.runtime, a.entrypoint, a.config_schema, a.permissions, a.active,
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
		var cfgSchema, perms, source, sourceURL string
		var uploadedBy sql.NullInt64
		var active int
		var created, updated string
		var owner sql.NullString
		if err := rows.Scan(&a.ID, &a.Name, &a.Slug, &a.Category, &a.Version, &a.Description,
			&a.Icon, &a.Runtime, &a.Entrypoint, &cfgSchema, &perms, &active,
			&uploadedBy, &source, &sourceURL, &created, &updated, &owner); err != nil {
			return nil, err
		}
		a.ConfigSchema = json.RawMessage(cfgSchema)
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
