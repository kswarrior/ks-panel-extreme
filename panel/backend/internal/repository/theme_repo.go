package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// ThemeRepository persists GLOBAL themes (the server-side themes every user
// sees) and their per-scope assignments. Per-user personal/local themes are
// NOT stored here — those live in the user's browser localStorage; the only
// job of this repository is the shared, admin-managed theme library.
type ThemeRepository struct {
	db *sql.DB
}

func NewThemeRepository(db *sql.DB) *ThemeRepository {
	return &ThemeRepository{db: db}
}

// listTheme is the shared SELECT used by ListThemes (public) and ListThemesWithOwner
// (admin). It carries the spec verbatim as a raw string; the caller decides
// whether to attach the creator's username.
const themeColumns = "id, name, description, spec, builtin, created_by, created_at, updated_at"

// scanTheme scans one row into a *models.Theme, parsing the SQLite datetime
// strings the driver emits. `spec` is preserved as a json.RawMessage so the
// full fidelity of the client-supplied theme object survives the round-trip
// (unknown fields aren't dropped, empty specs aren't collapsed to "{}").
func scanTheme(scanner interface{ Scan(...any) error }) (*models.Theme, error) {
	var t models.Theme
	var spec string
	var createdBy sql.NullInt64
	var created, updated string
	if err := scanner.Scan(&t.ID, &t.Name, &t.Description, &spec, &t.Builtin, &createdBy, &created, &updated); err != nil {
		return nil, err
	}
	t.Spec = json.RawMessage(spec)
	if createdBy.Valid {
		c := createdBy.Int64
		t.CreatedBy = &c
	}
	t.CreatedAt, _ = parseSQLiteTime(created)
	t.UpdatedAt, _ = parseSQLiteTime(updated)
	return &t, nil
}

// ListThemes returns every global theme, newest-first. This is the public
// read path that populates the Theme list for every user. `spec` is included
// so the resolver can apply the theme without a follow-up round-trip.
func (r *ThemeRepository) ListThemes() ([]models.Theme, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM themes`).Scan(&n); err != nil {
		return nil, err
	}
	themes := make([]models.Theme, 0, n)
	if n == 0 {
		return themes, nil
	}
	rows, err := r.db.Query(`SELECT ` + themeColumns + ` FROM themes ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		t, err := scanTheme(rows)
		if err != nil {
			return nil, err
		}
		themes = append(themes, *t)
	}
	return themes, rows.Err()
}

// ListThemesWithOwner is the admin view: each theme carries the username of
// the admin who created it (empty when that user was since deleted, since
// themes.created_by is ON DELETE SET NULL).
func (r *ThemeRepository) ListThemesWithOwner() ([]models.ThemeWithOwner, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM themes`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.ThemeWithOwner, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`
		SELECT t.id, t.name, t.description, t.spec, t.builtin, t.created_by, t.created_at, t.updated_at, u.username
		FROM themes t
		LEFT JOIN users u ON u.id = t.created_by
		ORDER BY t.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t models.Theme
		var spec string
		var createdBy sql.NullInt64
		var created, updated string
		var owner sql.NullString
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &spec, &t.Builtin, &createdBy, &created, &updated, &owner); err != nil {
			return nil, err
		}
		t.Spec = json.RawMessage(spec)
		if createdBy.Valid {
			c := createdBy.Int64
			t.CreatedBy = &c
		}
		t.CreatedAt, _ = parseSQLiteTime(created)
		t.UpdatedAt, _ = parseSQLiteTime(updated)
		out = append(out, models.ThemeWithOwner{Theme: t, OwnerName: owner.String})
	}
	return out, rows.Err()
}

// GetTheme returns a single theme by id (spec included), or
// fmt.Errorf("theme not found") when absent.
func (r *ThemeRepository) GetTheme(id string) (*models.Theme, error) {
	row := r.db.QueryRow(`SELECT `+themeColumns+` FROM themes WHERE id = ?`, id)
	t, err := scanTheme(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("theme not found")
		}
		return nil, err
	}
	return t, nil
}

// UpsertThemeInput is the payload CreateTheme / UpdateTheme accept. The caller
// owns `id` (the studio generates a stable client id), keeping the same id
// across an edit-in-place so a save-as-new vs. update stays caller-driven.
type UpsertThemeInput struct {
	ID          string
	Name        string
	Description string
	Spec        json.RawMessage // the full Theme object
	Builtin     bool
	CreatedBy   int64 // only honored on Create; updates keep the original creator
}

// CreateTheme inserts a new global theme. Callers must have already chosen a
// unique, stable `id` — there is a PRIMARY KEY constraint, so a duplicate
// surfaces as a driver error the handler turns into HTTP 409.
func (r *ThemeRepository) CreateTheme(in UpsertThemeInput) (*models.Theme, error) {
	if in.ID == "" {
		return nil, fmt.Errorf("theme id is required")
	}
	spec := string(in.Spec)
	if spec == "" {
		spec = "{}"
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	if _, err := r.db.Exec(
		`INSERT INTO themes (id, name, description, spec, builtin, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		in.ID, in.Name, in.Description, spec, in.Builtin, in.CreatedBy, now, now,
	); err != nil {
		return nil, err
	}
	return r.GetTheme(in.ID)
}

// UpdateTheme overwrites name/description/spec and bumps updated_at. The
// creator (created_by) and created_at are preserved.
func (r *ThemeRepository) UpdateTheme(id string, name, description string, spec json.RawMessage) (*models.Theme, error) {
	if id == "" {
		return nil, fmt.Errorf("theme id is required")
	}
	s := string(spec)
	if s == "" {
		s = "{}"
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(
		`UPDATE themes SET name = ?, description = ?, spec = ?, updated_at = ? WHERE id = ?`,
		name, description, s, now, id,
	)
	if err != nil {
		return nil, err
	}
	// RowsAffected==0 is ambiguous across engines: MySQL reports 0 when the
	// row exists but no column changed, so confirm existence by reading the
	// row back instead of treating 0 as "not found".
	if n, _ := res.RowsAffected(); n == 0 {
		if t, gerr := r.GetTheme(id); gerr != nil || t == nil {
			return nil, fmt.Errorf("theme not found")
		}
	}
	return r.GetTheme(id)
}

// DeleteTheme removes a global theme. theme_assignments rows cascade-delete
// (ON DELETE CASCADE), so any pages still pointing at it fall back to the
// built-in default via the resolver.
func (r *ThemeRepository) DeleteTheme(id string) error {
	if id == "" {
		return fmt.Errorf("theme id is required")
	}
	res, err := r.db.Exec(`DELETE FROM themes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("theme not found")
	}
	return nil
}

// ---- Assignments ----

// ListAssignments returns every global scope -> theme binding. The frontend
// merges this with the user's personal localStorage assignments (local wins)
// and the built-in 'default' fallback.
func (r *ThemeRepository) ListAssignments() ([]models.ThemeAssignment, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM theme_assignments`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.ThemeAssignment, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT scope, theme_id FROM theme_assignments`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a models.ThemeAssignment
		if err := rows.Scan(&a.Scope, &a.ThemeID); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AssignTheme upserts a scope -> theme binding. Exactly one row per scope, so
// assigning a different theme to the same scope is an in-place replacement.
func (r *ThemeRepository) AssignTheme(scope, themeID string) error {
	if scope == "" || themeID == "" {
		return fmt.Errorf("scope and theme_id are required")
	}
	_, err := r.db.Exec(
		`INSERT INTO theme_assignments (scope, theme_id) VALUES (?, ?)`+
			upsertSet("(scope)", []string{"theme_id"}),
		scope, themeID,
	)
	return err
}

// UnassignTheme removes a binding (scope reverts to its area default, then to
// the built-in default theme). No-op + nil if there was no binding.
func (r *ThemeRepository) UnassignTheme(scope string) error {
	if scope == "" {
		return fmt.Errorf("scope is required")
	}
	_, err := r.db.Exec(`DELETE FROM theme_assignments WHERE scope = ?`, scope)
	return err
}

// parseSQLiteTime accepts both the layout SQLite writes and RFC3339 so it works
// regardless of whether the row was written by modernc's CURRENT_TIMESTAMP
// default or an explicit UTC timestamp.
func parseSQLiteTime(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339Nano, s)
}
