package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// TemplateRepository manages the `templates` table. Templates are pure data
// (no execution lives here) — the panel only stores them so operators can
// reuse a known-good JSON spec across many deploys.
type TemplateRepository struct {
	db *sql.DB
}

func NewTemplateRepository(db *sql.DB) *TemplateRepository {
	return &TemplateRepository{db: db}
}

// List returns all templates ordered by name for deterministic UI rendering.
// See the note on ApiKeyRepository.ListApiKeys for why we COUNT(*) before
// scanning — the same modernc.org/sqlite empty-set quirk applies here.
func (r *TemplateRepository) List() ([]models.Template, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM templates`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.Template, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT t.id, t.name, t.description, t.kind, t.image, t.spec, t.created_at, t.updated_at,
		COALESCE(t.owner_id, 0),
		COALESCE((SELECT username FROM users WHERE id = t.owner_id), '')
		FROM templates t ORDER BY t.name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t models.Template
		var created, updated string
		var ownerID sql.NullInt64
		var ownerName sql.NullString
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Kind, &t.Image, &t.Spec, &created, &updated, &ownerID, &ownerName); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			t.OwnerID = ownerID.Int64
			t.OwnerName = ownerName.String
		}
		t.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		t.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated)
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListByOwner returns the subset of templates owned by ownerID. Migration
// 054 wired the TEMPLATES_OWN scope key — the admin Templates handler
// calls this when a caller holds TEMPLATES_OWN without TEMPLATES_ALL.
func (r *TemplateRepository) ListByOwner(ownerID int64) ([]models.Template, error) {
	all, err := r.List()
	if err != nil {
		return nil, err
	}
	if ownerID == 0 {
		return all, nil
	}
	out := make([]models.Template, 0)
	for _, t := range all {
		if t.OwnerID == ownerID {
			out = append(out, t)
		}
	}
	return out, nil
}

// Get fetches a single template by id. Used at deploy time to populate the
// edge RPC config.
func (r *TemplateRepository) Get(id int64) (*models.Template, error) {
	var t models.Template
	var tid, ownerID sql.NullInt64
	var name, desc, kind, image, spec, created, updated sql.NullString
	var ownerName sql.NullString
	err := r.db.QueryRow(`SELECT t.id, t.name, t.description, t.kind, t.image, t.spec, t.created_at, t.updated_at,
		COALESCE(t.owner_id, 0),
		COALESCE((SELECT username FROM users WHERE id = t.owner_id), '')
		FROM templates t WHERE t.id = ?`, id).Scan(
		&tid, &name, &desc, &kind, &image, &spec, &created, &updated, &ownerID, &ownerName)
	if err != nil || !tid.Valid {
		return nil, fmt.Errorf("template not found")
	}
	t.ID = tid.Int64
	t.Name = name.String
	t.Description = desc.String
	t.Kind = kind.String
	t.Image = image.String
	t.Spec = spec.String
	if ownerID.Valid {
		t.OwnerID = ownerID.Int64
		t.OwnerName = ownerName.String
	}
	t.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
	t.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated.String)
	return &t, nil
}

// GetByName fetches a single template by name. Used by the `import:template`
// CLI so it can decide between insert (new) and update (re-import / fix) when
// seeding a built-in blueprint into the DB.
func (r *TemplateRepository) GetByName(name string) (*models.Template, error) {
	var t models.Template
	var tid, ownerID sql.NullInt64
	var nm, desc, kind, image, spec, created, updated sql.NullString
	var ownerName sql.NullString
	err := r.db.QueryRow(`SELECT t.id, t.name, t.description, t.kind, t.image, t.spec, t.created_at, t.updated_at,
		COALESCE(t.owner_id, 0),
		COALESCE((SELECT username FROM users WHERE id = t.owner_id), '')
		FROM templates t WHERE t.name = ?`, name).Scan(
		&tid, &nm, &desc, &kind, &image, &spec, &created, &updated, &ownerID, &ownerName)
	if err != nil || !tid.Valid {
		return nil, fmt.Errorf("template not found")
	}
	t.ID = tid.Int64
	t.Name = nm.String
	t.Description = desc.String
	t.Kind = kind.String
	t.Image = image.String
	t.Spec = spec.String
	if ownerID.Valid {
		t.OwnerID = ownerID.Int64
		t.OwnerName = ownerName.String
	}
	t.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created.String)
	t.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated.String)
	return &t, nil
}

// CreateInput is the editable surface the admin handler passes.
// OwnerID is the user that authored the template; see
// models.Template.OwnerID for the scope contract (migration 054).
type TemplateInput struct {
	Name        string
	Description string
	Kind        string
	Image       string
	Spec        string
	OwnerID     int64
}

// Create inserts a new template. The handler validates Spec is well-formed
// JSON before calling here so the column never holds garbage. OwnerID 0
// maps to NULL (orphan, pre-054 row; FK allows it) — see nullableInt64 in
// instance_repo.go and db.go for the full contract.
func (r *TemplateRepository) Create(in TemplateInput) (int64, error) {
	var ownerID any = in.OwnerID
	if in.OwnerID == 0 {
		ownerID = nil
	}
	res, err := r.db.Exec(`INSERT INTO templates (name, description, kind, image, spec, owner_id) VALUES (?, ?, ?, ?, ?, ?)`,
		in.Name, in.Description, in.Kind, in.Image, in.Spec, ownerID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update patches an editable template. We update updated_at explicitly so a
// stale SQLite driver (older modernc builds) doesn't skip the ON UPDATE
// column.
func (r *TemplateRepository) Update(id int64, in TemplateInput) error {
	res, err := r.db.Exec(`UPDATE templates SET name = ?, description = ?, kind = ?, image = ?, spec = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		in.Name, in.Description, in.Kind, in.Image, in.Spec, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("template not found")
	}
	return nil
}

// Delete removes a template. Existing instances keep their cached config so
// they keep running; the FK on instances.template_id is ON DELETE SET NULL
// so the instance row just loses its back-link rather than vanishing.
func (r *TemplateRepository) Delete(id int64) error {
	res, err := r.db.Exec(`DELETE FROM templates WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("template not found")
	}
	return nil
}

// patch: avoid a stray token in the comment above.
var _ = fmt.Sprintf
