package repository

import (
	"database/sql"
	"time"
)

// UpdateWindow is one scheduled self-update row (migration 068).
// Target is 'panel' (panel binary via the shared stager) or 'fleet'
// (fleet rolling update over every registered node). WindowStart/End are
// daily "HH:MM" UTC bounds; empty means "always inside the window".
type UpdateWindow struct {
	ID          int64      `json:"id"`
	Target      string     `json:"target"`
	Name        string     `json:"name"`
	Cron        string     `json:"cron"`
	Enabled     bool       `json:"enabled"`
	WindowStart string     `json:"window_start"`
	WindowEnd   string     `json:"window_end"`
	NextRunAt   *time.Time `json:"next_run_at,omitempty"`
	LastRunAt   *time.Time `json:"last_run_at,omitempty"`
	LastStatus  string     `json:"last_status,omitempty"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

// UpdateWindowInput is the validated create/update payload (validation
// lives in the handler: cron.Parse + HH:MM window shape).
type UpdateWindowInput struct {
	Target      string
	Name        string
	Cron        string
	Enabled     bool
	WindowStart string
	WindowEnd   string
	NextRunAt   *time.Time
}

// UpdateWindowRepository persists update_windows rows. Time encoding
// mirrors BackupScheduleRepository ("2006-01-02 15:04:05" UTC) so all
// three engines compare next_run_at lexicographically.
type UpdateWindowRepository struct {
	db *sql.DB
}

func NewUpdateWindowRepository(db *sql.DB) *UpdateWindowRepository {
	return &UpdateWindowRepository{db: db}
}

type updateWindowScanner interface {
	Scan(dest ...any) error
}

// scanUpdateWindow decodes one row. The ok return is false for the
// driver's NULL placeholder row on empty results (the codebase scans PKs
// into NullInt64 + skips invalid everywhere — see AIThreadRepository.List)
// so callers treat it as "no row" instead of a scan error.
func scanUpdateWindow(s updateWindowScanner) (UpdateWindow, bool, error) {
	var w UpdateWindow
	var id sql.NullInt64
	var nextRun, lastRun, created, updated sql.NullString
	var enabled int
	if err := s.Scan(&id, &w.Target, &w.Name, &w.Cron, &enabled,
		&w.WindowStart, &w.WindowEnd, &nextRun, &lastRun, &w.LastStatus,
		&created, &updated); err != nil {
		return w, false, err
	}
	if !id.Valid {
		return w, false, nil
	}
	w.ID = id.Int64
	w.Enabled = enabled == 1
	w.NextRunAt = parseUpdateWindowTime(nextRun)
	w.LastRunAt = parseUpdateWindowTime(lastRun)
	w.CreatedAt = parseUpdateWindowTime(created)
	w.UpdatedAt = parseUpdateWindowTime(updated)
	return w, true, nil
}

func parseUpdateWindowTime(ns sql.NullString) *time.Time {
	if !ns.Valid || ns.String == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339, "2006-01-02T15:04:05Z07:00"} {
		if t, err := time.Parse(layout, ns.String); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

func formatUpdateWindowTime(t *time.Time) any {
	if t == nil || t.IsZero() {
		return nil
	}
	return t.UTC().Format("2006-01-02 15:04:05")
}

// ListByTarget returns windows for one target, newest first.
func (r *UpdateWindowRepository) ListByTarget(target string) ([]UpdateWindow, error) {
	rows, err := r.db.Query(`SELECT id, target, name, cron, enabled, window_start, window_end, next_run_at, last_run_at, last_status, created_at, updated_at FROM update_windows WHERE target = ? ORDER BY id DESC`, target)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UpdateWindow{}
	for rows.Next() {
		w, ok, err := scanUpdateWindow(rows)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// Get returns one window by id + target (target scoping keeps the panel
// and fleet surfaces from touching each other's rows).
func (r *UpdateWindowRepository) Get(id int64, target string) (*UpdateWindow, error) {
	row := r.db.QueryRow(`SELECT id, target, name, cron, enabled, window_start, window_end, next_run_at, last_run_at, last_status, created_at, updated_at FROM update_windows WHERE id = ? AND target = ?`, id, target)
	w, ok, err := scanUpdateWindow(row)
	if err != nil {
		// The driver surfaces empty results as a scan error instead of
		// sql.ErrNoRows — normalize so handlers answer 404.
		if !ok {
			return nil, sql.ErrNoRows
		}
		return nil, err
	}
	if !ok {
		return nil, sql.ErrNoRows
	}
	return &w, nil
}

// Due returns enabled rows whose next_run_at has passed, oldest first.
func (r *UpdateWindowRepository) Due(now time.Time) ([]UpdateWindow, error) {
	rows, err := r.db.Query(`SELECT id, target, name, cron, enabled, window_start, window_end, next_run_at, last_run_at, last_status, created_at, updated_at FROM update_windows WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC`, now.UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UpdateWindow{}
	for rows.Next() {
		w, ok, err := scanUpdateWindow(rows)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// Create inserts a window and returns its id.
func (r *UpdateWindowRepository) Create(in UpdateWindowInput) (int64, error) {
	res, err := r.db.Exec(`INSERT INTO update_windows (target, name, cron, enabled, window_start, window_end, next_run_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		in.Target, in.Name, in.Cron, boolToInt(in.Enabled), in.WindowStart, in.WindowEnd, formatUpdateWindowTime(in.NextRunAt))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update rewrites a window row (target-scoped).
func (r *UpdateWindowRepository) Update(id int64, in UpdateWindowInput) error {
	res, err := r.db.Exec(`UPDATE update_windows SET name = ?, cron = ?, enabled = ?, window_start = ?, window_end = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND target = ?`,
		in.Name, in.Cron, boolToInt(in.Enabled), in.WindowStart, in.WindowEnd, formatUpdateWindowTime(in.NextRunAt), id, in.Target)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// Delete removes a window row (target-scoped).
func (r *UpdateWindowRepository) Delete(id int64, target string) error {
	res, err := r.db.Exec(`DELETE FROM update_windows WHERE id = ? AND target = ?`, id, target)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// MarkRan records a fire/skip outcome and re-arms next_run_at.
func (r *UpdateWindowRepository) MarkRan(id int64, next *time.Time, status string) error {
	_, err := r.db.Exec(`UPDATE update_windows SET last_run_at = CURRENT_TIMESTAMP, last_status = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		status, formatUpdateWindowTime(next), id)
	return err
}
