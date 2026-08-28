// Package modengine implements the KS Panel Mod Engine v2: an event-driven,
// sandboxed plugin runtime that executes mod backend scripts inside embedded
// Goja JavaScript VMs, exposes a restricted Host API (logging, namespaced
// key-value storage, event subscriptions), and forwards host lifecycle events
// to mod hook handlers.
//
// The package is organised as:
//
//	storage.go  — namespaced mod_storage key-value repo + Goja binding.
//	eventbus.go — cancellable pre-hook / async post-hook event bus.
//	sandbox.go   — per-mod Goja VM manager + host API bindings.
//	engine.go    — ModEngine: boots/tears-down VMs, serves slot registry.
package modengine

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/example/kspanel/internal/repository"
)

// StorageEntry is one namespaced (mod_slug, key) -> value row. Value is the
// raw JSON the mod stored; callers own the (un)marshalling.
type StorageEntry struct {
	ModSlug   string
	Key       string
	Value     json.RawMessage
	UpdatedAt time.Time
}

// StorageRepository persists per-mod key/value data in the mod_storage table.
// Each mod operates strictly inside its own namespace (its slug); there is no
// API path here to read or write another mod's storage, and the Goja binding
// hard-codes the calling mod's slug so a script cannot forge a different one.
//
// The shared single-connection SQLite pool (SetMaxOpenConns(1)) means we must
// not hold a long-lived *sql.DB across the engine; each call opens its own
// connection and closes it. This mirrors the handlers' openModRepo pattern.
type StorageRepository struct{}

// NewStorageRepository returns the stateless repo. Methods open their own DB
// connection per call to avoid contention with the single-connection pool.
func NewStorageRepository() *StorageRepository { return &StorageRepository{} }

// Get retrieves one stored value. Returns the sentinel ErrStorageNotFound
// when no row matches so callers (and the Goja binding) can branch on a
// missing key without logging a spurious "db error".
func (StorageRepository) Get(slug, key string) (json.RawMessage, error) {
	if slug == "" || key == "" {
		return nil, errors.New("storage.get: mod slug and key are required")
	}
	con, err := repository.OpenDB()
	if err != nil {
		return nil, fmt.Errorf("storage.get: open db: %w", err)
	}
	defer con.Close()
	var raw string
	var updated string
	err = con.QueryRow(
		`SELECT value, updated_at FROM mod_storage WHERE mod_slug = ? AND key = ?`,
		slug, key,
	).Scan(&raw, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrStorageNotFound
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(raw), nil
}

// Set upserts a value. JSON-encodable any value is accepted; nil collapses to
// the literal string "null" so the mod can store a JSON null explicitly.
func (StorageRepository) Set(slug, key string, value any) error {
	if slug == "" || key == "" {
		return errors.New("storage.set: mod slug and key are required")
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("storage.set: marshal value: %w", err)
	}
	con, err := repository.OpenDB()
	if err != nil {
		return fmt.Errorf("storage.set: open db: %w", err)
	}
	defer con.Close()
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	_, err = con.Exec(
		`INSERT INTO mod_storage (mod_slug, key, value, updated_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(mod_slug, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		slug, key, string(raw), now,
	)
	return err
}

// Delete removes a single key. Missing keys are a no-op (not an error) so the
// Goja binding can mirror `delete` semantics without surfacing row-count noise.
func (StorageRepository) Delete(slug, key string) error {
	if slug == "" || key == "" {
		return errors.New("storage.delete: mod slug and key are required")
	}
	con, err := repository.OpenDB()
	if err != nil {
		return fmt.Errorf("storage.delete: open db: %w", err)
	}
	defer con.Close()
	_, err = con.Exec(`DELETE FROM mod_storage WHERE mod_slug = ? AND key = ?`, slug, key)
	return err
}

// ListAll returns every key/value for a mod, in key order. The engine uses it
// for diagnostic dumps (e.g. a future admin "inspect mod storage" view).
func (StorageRepository) ListAll(slug string) ([]StorageEntry, error) {
	if slug == "" {
		return nil, errors.New("storage.list: mod slug is required")
	}
	con, err := repository.OpenDB()
	if err != nil {
		return nil, fmt.Errorf("storage.list: open db: %w", err)
	}
	defer con.Close()
	rows, err := con.Query(
		`SELECT key, value, updated_at FROM mod_storage WHERE mod_slug = ? ORDER BY key ASC`,
		slug,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StorageEntry
	for rows.Next() {
		var e StorageEntry
		var updated string
		if err := rows.Scan(&e.Key, &e.Value, &updated); err != nil {
			return nil, err
		}
		e.ModSlug = slug
		if t, perr := parseSQLiteTime(updated); perr != nil {
			// Surface parse failures — otherwise an unrecognized format
			// (e.g. an explicit RFC3339 from the postgres dialect) would
			// silently turn UpdatedAt into the zero time.
			log.Printf("[modengine] storage.list: unrecognised updated_at %q for (%s, %s): %v", updated, slug, e.Key, perr)
		} else {
			e.UpdatedAt = t
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ErrStorageNotFound is returned by Get for a (slug, key) with no stored row.
// The Goja `ks.storage.get` binding maps it to JS `null` so a mod can do
// `const v = ks.storage.get(k); if (v == null) …`.
var ErrStorageNotFound = errors.New("storage: key not found")

// parseSQLiteTime re-implements repository.parseSQLiteTime locally to dodge
// the import cycle (repository imports models, the storage binding is fine,
// but keeping time parsing self-contained makes the package self-sufficient
// for tests that don't need the full repo). Best-effort, like the repo copy.
var parseSQLiteTime = func(s string) (time.Time, error) {
	for _, layout := range []string{
		"2006-01-02 15:04:05",
		time.RFC3339,
		"2006-01-02T15:04:05",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, errors.New("unrecognised time format")
}

// storageBinding is the namespaced storage handle a Goja VM receives under
// `ks.storage`. It captures the owning mod's slug at VM build time so a
// script can't reach into another mod's namespace.
type storageBinding struct {
	slug string
	repo *StorageRepository
	mu   sync.Mutex
}

func newStorageBinding(slug string, repo *StorageRepository) *storageBinding {
	return &storageBinding{slug: slug, repo: repo}
}

// get retrieves one key from THIS mod's namespace. The mutex guards the
// StorageRepository (which opens its own connection per call) against a
// script firing concurrent ks.storage.get calls — the repo itself is
// stateless, but serialising VM-issued reads keeps the lock story simple.
func (b *storageBinding) get(key string) (json.RawMessage, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.repo.Get(b.slug, key)
}

// set upserts a value marshalled through encoding/json; the goja binding
// passes us a value already Export()'d to a Go any, which json.Marshal
// handles (numbers/strings/bools/nested maps/slices).
func (b *storageBinding) set(key string, value any) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.repo.Set(b.slug, key, value)
}

// delete removes a key; missing keys are a no-op per the repo contract.
func (b *storageBinding) delete(key string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.repo.Delete(b.slug, key)
}

// DefaultStorage returns the storage repo held by the default engine, lazily
// constructing the engine if needed. Used by the goja binding so a script's
// ks.storage.* writes land in the same repo the admin endpoint reads.
func DefaultStorage() *StorageRepository {
	return Default().Storage()
}
