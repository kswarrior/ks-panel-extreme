package repository

import (
	"database/sql"

	"github.com/example/kspanel/internal/db"
)

// PageKVEntry is one row of the page_kv table (migration 078): a single
// server-persisted key for one instance + page family.
type PageKVEntry struct {
	K         string `json:"k"`
	V         string `json:"v"`
	UpdatedAt string `json:"updated_at"`
}

// PageKVRepository owns the page_kv table. Statements are written with "?"
// binds and rebound per engine (db.Rebind) so one code path runs on
// SQLite / Postgres / MySQL — mirrors the ticket repositories
// (pg_compat.go). Quotas and key/value shapes are enforced by the handler
// (instance_page_kv.go), never here: this layer only scopes every
// statement to its (instance_id, page_slug) pair.
type PageKVRepository struct {
	db *sql.DB
}

// NewPageKVRepository builds a PageKVRepository over an open handle
// (repository.OpenDB in handlers, a fixture handle in tests).
func NewPageKVRepository(conn *sql.DB) *PageKVRepository {
	return &PageKVRepository{db: conn}
}

func (r *PageKVRepository) rebind(query string) string {
	return db.Rebind(detectEngine(r.db), query)
}

// List returns every key for one instance + page family, ordered by key.
// Full values: the per-page quota (100 keys x 64KiB) keeps rows small.
func (r *PageKVRepository) List(instanceID int64, pageSlug string) ([]PageKVEntry, error) {
	rows, err := r.db.Query(
		r.rebind(`SELECT k, v, updated_at FROM page_kv WHERE instance_id = ? AND page_slug = ? ORDER BY k`),
		instanceID, pageSlug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PageKVEntry{}
	for rows.Next() {
		var e PageKVEntry
		if err := rows.Scan(&e.K, &e.V, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Get returns one key, or (nil, nil) when the key is absent.
func (r *PageKVRepository) Get(instanceID int64, pageSlug, k string) (*PageKVEntry, error) {
	var e PageKVEntry
	err := r.db.QueryRow(
		r.rebind(`SELECT k, v, updated_at FROM page_kv WHERE instance_id = ? AND page_slug = ? AND k = ?`),
		instanceID, pageSlug, k).Scan(&e.K, &e.V, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// CountKeys reports how many keys one instance + page family holds.
func (r *PageKVRepository) CountKeys(instanceID int64, pageSlug string) (int, error) {
	var n int
	err := r.db.QueryRow(
		r.rebind(`SELECT COUNT(*) FROM page_kv WHERE instance_id = ? AND page_slug = ?`),
		instanceID, pageSlug).Scan(&n)
	if err != nil {
		return 0, err
	}
	return n, nil
}

// Put inserts or replaces one key. Callers own the quota check (an
// UPDATE never grows the count, so only inserts need it).
func (r *PageKVRepository) Put(instanceID int64, pageSlug, k, v, updatedAt string) error {
	// Portable upsert without engine-specific conflict syntax: UPDATE,
	// then INSERT when nothing matched. The loser of a concurrent double
	// insert gets a PK error and fails closed (the handler surfaces 500,
	// the retry then lands on the UPDATE path).
	res, err := r.db.Exec(
		r.rebind(`UPDATE page_kv SET v = ?, updated_at = ? WHERE instance_id = ? AND page_slug = ? AND k = ?`),
		v, updatedAt, instanceID, pageSlug, k)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, err = r.db.Exec(
		r.rebind(`INSERT INTO page_kv (instance_id, page_slug, k, v, updated_at) VALUES (?, ?, ?, ?, ?)`),
		instanceID, pageSlug, k, v, updatedAt)
	return err
}

// Delete removes one key. Missing keys are a no-op (idempotent, mirrors
// sdk.storage.delete resolving void).
func (r *PageKVRepository) Delete(instanceID int64, pageSlug, k string) error {
	_, err := r.db.Exec(
		r.rebind(`DELETE FROM page_kv WHERE instance_id = ? AND page_slug = ? AND k = ?`),
		instanceID, pageSlug, k)
	return err
}
