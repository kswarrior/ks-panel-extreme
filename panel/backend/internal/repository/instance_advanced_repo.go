package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// ---------------- Instance snapshots ----------------------------------------

type SnapshotRepository struct {
	db *sql.DB
}

func NewSnapshotRepository(db *sql.DB) *SnapshotRepository {
	return &SnapshotRepository{db: db}
}

func (r *SnapshotRepository) List(instanceID int64) ([]models.InstanceSnapshot, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_snapshots WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.InstanceSnapshot, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, instance_id, name, external_ref, size_bytes, note, created_at
		FROM instance_snapshots WHERE instance_id = ? ORDER BY created_at DESC`, instanceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s models.InstanceSnapshot
		var created string
		if err := rows.Scan(&s.ID, &s.InstanceID, &s.Name, &s.ExternalRef, &s.SizeBytes, &s.Note, &created); err != nil {
			return nil, err
		}
		s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *SnapshotRepository) Create(s models.InstanceSnapshot) (int64, error) {
	return insertReturningID(r.db, `INSERT INTO instance_snapshots (instance_id, name, external_ref, size_bytes, note)
		VALUES (?, ?, ?, ?, ?)`,
		s.InstanceID, s.Name, s.ExternalRef, s.SizeBytes, s.Note)
}

func (r *SnapshotRepository) Delete(instanceID int64, name string) error {
	res, err := r.db.Exec(`DELETE FROM instance_snapshots WHERE instance_id = ? AND name = ?`, instanceID, name)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("snapshot not found")
	}
	return nil
}

// ---------------- Instance audit ---------------------------------------------

type InstanceAuditRepository struct {
	db *sql.DB
}

func NewInstanceAuditRepository(db *sql.DB) *InstanceAuditRepository {
	return &InstanceAuditRepository{db: db}
}

// AuditInput is the write payload. Actor may be "" (system).
type AuditInput struct {
	InstanceID int64
	Actor      string
	Action     string
	Detail     string
}

// Append inserts one audit row.
func (r *InstanceAuditRepository) Append(in AuditInput) (int64, error) {
	return insertReturningID(r.db, `INSERT INTO instance_audit (instance_id, actor, action, detail)
		VALUES (?, ?, ?, ?)`, in.InstanceID, in.Actor, in.Action, in.Detail)
}

// List returns rows newest-first, capped to limit.
func (r *InstanceAuditRepository) List(instanceID int64, limit int) ([]models.InstanceAuditRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_audit WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.InstanceAuditRow, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, instance_id, actor, action, detail, created_at
		FROM instance_audit WHERE instance_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`, instanceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a models.InstanceAuditRow
		var created string
		if err := rows.Scan(&a.ID, &a.InstanceID, &a.Actor, &a.Action, &a.Detail, &created); err != nil {
			return nil, err
		}
		a.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		out = append(out, a)
	}
	return out, rows.Err()
}

// ---------------- Live state cache ------------------------------------------

type LiveStateRepository struct {
	db *sql.DB
}

func NewLiveStateRepository(db *sql.DB) *LiveStateRepository {
	return &LiveStateRepository{db: db}
}

// Get returns the cached state for an instance, or a zero-value row when no
// row exists yet (paused first paint).
func (r *LiveStateRepository) Get(instanceID int64) (*models.InstanceLiveState, error) {
	var ls models.InstanceLiveState
	var updated string
	err := r.db.QueryRow(`SELECT instance_id, updated_at, metrics, processes, ports, info
		FROM instance_live_state WHERE instance_id = ?`, instanceID).
		Scan(&ls.InstanceID, &updated, &ls.Metrics, &ls.Processes, &ls.Ports, &ls.Info)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	ls.UpdatedAt, _ = time.Parse("2006-01-02 15:04:05", updated)
	return &ls, nil
}

// Save updates the cached state.
func (r *LiveStateRepository) Save(ls models.InstanceLiveState) error {
	ls.Metrics = defaultJSON(ls.Metrics, "{}")
	ls.Processes = defaultJSON(ls.Processes, "[]")
	ls.Ports = defaultJSON(ls.Ports, "[]")
	ls.Info = defaultJSON(ls.Info, "{}")
	_, err := r.db.Exec(`INSERT INTO instance_live_state (instance_id, updated_at, metrics, processes, ports, info)
		VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`+upsertSet("(instance_id)",
		[]string{"metrics", "processes", "ports", "info"}, "updated_at = CURRENT_TIMESTAMP"),
		ls.InstanceID, ls.Metrics, ls.Processes, ls.Ports, ls.Info)
	return err
}

func defaultJSON(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
