package modengine

// status.go — per-mod runtime diagnostics + the panel-wide engine kill switch.
//
// Two concerns live here:
//
//   - Diagnostics: every activation attempt records a ModRuntimeStatus
//     (running / error / stopped + last error) and scripts (and the engine
//     itself) append structured lines to a bounded per-slug log ring. The
//     admin UI reads both through GET /api/mods/engine and
//     GET /api/mods/{id}/logs.
//
//   - Kill switch: SetEnabled(false) tears every running runtime down and
//     makes subsequent Activate calls refuse until re-enabled. The flag is
//     persisted in the settings KV (repository.ModsEngineSettingKey) by the
//     HTTP handler; the engine keeps an in-memory mirror so the hot path
//     (Activate / Boot) never needs a DB round-trip.
//
// Locking: diagnostics use their own statusMu. Callers may hold statusMu and
// acquire NOTHING else, and code that already holds e.mu or a runtime mutex
// may take statusMu — the ordering e.mu -> statusMu and r.mu -> statusMu is
// one-way, so no cycle exists. (A previous design reused e.mu here, which
// inverted against ks.log callbacks invoked under the Goja runtime mutex.)

import (
	"errors"
	"sync"
	"time"
)

// Mod lifecycle states surfaced by the diagnostics endpoint.
const (
	ModStateRunning = "running" // VM booted, entry live in the registry
	ModStateError   = "error"   // last activation failed (see LastError)
	ModStateStopped = "stopped" // deactivated or killed by the switch
)

// ErrEngineDisabled is returned by Activate while the kill switch is off. The
// handler maps it to 409 with a clear message so the UI can point the admin at
// the engine toggle instead of a generic failure.
var ErrEngineDisabled = errors.New("the mod engine is disabled")

// logRingCap bounds the per-slug log ring so a chatty script can't grow the
// engine's memory without limit. Oldest lines fall off the front.
const logRingCap = 200

// maxTrackedSlugs bounds how many slugs keep diagnostics after they are gone
// from the registry (deleted / long-deactivated mods' history falls off).
// Active entries are never evicted.
const maxTrackedSlugs = 256

// ModLogEntry is one line a mod (or the engine on its behalf) logged.
type ModLogEntry struct {
	TS      time.Time `json:"ts"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
}

// ModRuntimeStatus is the diagnostic record for one mod slug.
type ModRuntimeStatus struct {
	Slug      string     `json:"slug"`
	State     string     `json:"state"` // running | error | stopped
	StartedAt *time.Time `json:"started_at,omitempty"`
	LastError string     `json:"last_error,omitempty"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// EngineDiagnostics is the snapshot served by GET /api/mods/engine.
type EngineDiagnostics struct {
	Mode    string             `json:"mode"` // "noop" | "goja"
	Enabled bool               `json:"enabled"`
	Mods    []ModRuntimeStatus `json:"mods"`
}

// diagnostics is the internal diagnostics registry shared by the engine.
type diagnostics struct {
	mu          sync.RWMutex
	statuses    map[string]*ModRuntimeStatus
	logs        map[string][]ModLogEntry
	insertOrder []string // slug insertion order for eviction
}

func newDiagnostics() *diagnostics {
	return &diagnostics{
		statuses: make(map[string]*ModRuntimeStatus),
		logs:     make(map[string][]ModLogEntry),
	}
}

// setStatus records the lifecycle state for slug. Caller may hold any lock
// order; statusMu is always innermost.
func (d *diagnostics) setStatus(slug, state, lastErr string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	now := time.Now().UTC()
	st, ok := d.statuses[slug]
	if !ok {
		st = &ModRuntimeStatus{Slug: slug}
		d.statuses[slug] = st
		d.insertOrder = append(d.insertOrder, slug)
	}
	st.State = state
	if state == ModStateRunning {
		ts := now
		st.StartedAt = &ts
		st.LastError = ""
	} else if lastErr != "" {
		st.LastError = lastErr
	}
	st.UpdatedAt = now
	d.evictLocked(slug)
}

// evictLocked drops diagnostics for the oldest slugs over the cap. The slug
// just touched (protect) and any slug still present in the engine registry
// are never evicted.
func (d *diagnostics) evictLocked(protect string) {
	for len(d.insertOrder) > maxTrackedSlugs {
		idx := -1
		for i, s := range d.insertOrder {
			if s != protect {
				idx = i
				break
			}
		}
		if idx < 0 {
			return // everything tracked is the protected slug
		}
		victim := d.insertOrder[idx]
		d.insertOrder = append(d.insertOrder[:idx], d.insertOrder[idx+1:]...)
		delete(d.statuses, victim)
		delete(d.logs, victim)
	}
}

// appendLog adds one line to slug's bounded ring.
func (d *diagnostics) appendLog(slug, level, msg string) {
	if msg == "" {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	ring := d.logs[slug]
	if ring == nil {
		d.insertOrderFor(slug)
	}
	ring = append(ring, ModLogEntry{TS: time.Now().UTC(), Level: level, Message: msg})
	if len(ring) > logRingCap {
		ring = ring[len(ring)-logRingCap:]
	}
	d.logs[slug] = ring
}

// insertOrderFor registers a slug in the eviction order if absent. Caller
// holds d.mu.
func (d *diagnostics) insertOrderFor(slug string) {
	for _, s := range d.insertOrder {
		if s == slug {
			return
		}
	}
	d.insertOrder = append(d.insertOrder, slug)
}

// logsFor copies slug's ring out (oldest first).
func (d *diagnostics) logsFor(slug string) []ModLogEntry {
	d.mu.RLock()
	defer d.mu.RUnlock()
	ring := d.logs[slug]
	out := make([]ModLogEntry, len(ring))
	copy(out, ring)
	return out
}

// drop removes every trace of slug (used on permanent mod deletion so a
// deleted mod's logs don't linger in memory).
func (d *diagnostics) drop(slug string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.statuses, slug)
	delete(d.logs, slug)
	for i, s := range d.insertOrder {
		if s == slug {
			d.insertOrder = append(d.insertOrder[:i], d.insertOrder[i+1:]...)
			break
		}
	}
}

// snapshot returns every tracked status ordered by slug for stable output.
func (d *diagnostics) snapshot() []ModRuntimeStatus {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]ModRuntimeStatus, 0, len(d.statuses))
	for _, st := range d.statuses {
		out = append(out, *st)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].Slug < out[j-1].Slug; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Engine-facing API (methods on ModEngine, defined here to keep the
// diagnostics + kill-switch story in one file).
// ---------------------------------------------------------------------------

// Enabled reports whether the engine accepts activations. Mirrors the
// in-memory copy of the persisted settings-KV flag.
func (e *ModEngine) Enabled() bool { return e.enabled.Load() }

// SetEnabled flips the kill switch. Disabling stops every running runtime,
// uninstalls its hooks/slots and marks each entry stopped; enabling only
// clears the gate (mods are re-activated explicitly by the admin or at the
// next boot).
func (e *ModEngine) SetEnabled(enabled bool) {
	e.enabled.Store(enabled)
	e.AppendLog("", "info", "mod engine "+map[bool]string{true: "enabled", false: "disabled"}[enabled])
	if enabled {
		return
	}
	e.mu.Lock()
	for slug, entry := range e.entries {
		_ = e.stopLocked(entry)
		delete(e.entries, slug)
		e.diag.setStatus(slug, ModStateStopped, "")
	}
	e.rebuildSlotsLocked()
	e.mu.Unlock()
}

// Diagnostics snapshots the runtime mode, kill-switch state and per-mod
// statuses for the admin endpoint.
func (e *ModEngine) Diagnostics() EngineDiagnostics {
	return EngineDiagnostics{
		Mode:    e.RunningMode(),
		Enabled: e.Enabled(),
		Mods:    e.diag.snapshot(),
	}
}

// ModLogs returns a copy of the log ring for one slug (empty when unknown).
func (e *ModEngine) ModLogs(slug string) []ModLogEntry { return e.diag.logsFor(slug) }

// ModStatus returns the tracked lifecycle status for one slug. The second
// return is false when nothing was recorded yet (never activated).
func (e *ModEngine) ModStatus(slug string) (ModRuntimeStatus, bool) {
	for _, st := range e.diag.snapshot() {
		if st.Slug == slug {
			return st, true
		}
	}
	return ModRuntimeStatus{}, false
}

// ForgetMod drops all diagnostics for a deleted mod.
func (e *ModEngine) ForgetMod(slug string) { e.diag.drop(slug) }

// AppendLog records one diagnostic line for slug. An empty slug routes to the
// pseudo-namespace "(engine)" so engine-level events (kill switch flips,
// boot failures) remain visible in the same viewer.
func (e *ModEngine) AppendLog(slug, level, msg string) {
	if slug == "" {
		slug = "(engine)"
	}
	if level == "" {
		level = "info"
	}
	e.diag.appendLog(slug, level, msg)
}

// markRunning / markFailed / markStopped are thin wrappers the engine's
// lifecycle paths call so call sites stay readable.
func (e *ModEngine) markRunning(slug string) { e.diag.setStatus(slug, ModStateRunning, "") }
func (e *ModEngine) markFailed(slug, err string) {
	e.diag.setStatus(slug, ModStateError, err)
	e.AppendLog(slug, "error", "activation failed: "+err)
}
func (e *ModEngine) markStopped(slug string) { e.diag.setStatus(slug, ModStateStopped, "") }
