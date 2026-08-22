package repository

import (
	"database/sql"

	"github.com/example/kspanel/internal/models"
)

type PermissionRepository struct {
	db *sql.DB
}

func NewPermissionRepository(db *sql.DB) *PermissionRepository {
	return &PermissionRepository{db: db}
}

// ListPermissions returns every known permission ordered by key.
func (r *PermissionRepository) ListPermissions() ([]models.Permission, error) {
	rows, err := r.db.Query(`SELECT id, key, description FROM permissions ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	perms := []models.Permission{}
	for rows.Next() {
		var p models.Permission
		if err := rows.Scan(&p.ID, &p.Key, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, rows.Err()
}
