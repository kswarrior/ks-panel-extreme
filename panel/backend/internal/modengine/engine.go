package modengine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// ModEngine is the v2 runtime manager. It owns one JSRuntime per active mod,
// the in-memory slot registry served to the React frontend at /api/mods/v1/slots,
// and the shared host event bus + namespaced storage repo.
//
// Lifecycle:
//
//	Boot()               — once at panel startup; loads every active mod's VM
//	Activate(mod, raw)   — on POST /api/mods/{id}/activate; starts the VM,
//	                       enrols hooks + slots, records them in the registry
//	Deactivate(slug)     — on POST /api/mods/{id}/deactivate; stops the
//	                       VM and removes hooks + slots
//	ActiveSlots()        — serves the slot registry snapshot
//	EmitPre / EmitPost   — forwarded to the bus so host handlers can fire mod
//	                       hooks without importing the bus type directly
//
// All public methods are safe to call from multiple goroutines (HTTP request
// handlers + the event emitter). Per-mod access is serialised by an entry-level
// mutex; the slots table + the mod-by-slug index are guarded by an engine-wide
// RWMutex.
//
// The engine never propagates a JS panic to the caller: every runtime call is
// wrapped so a crashed VM is logged, deactivated, and skipped. This is the
// "Error Isolation" contract — one misbehaving mod must not take the panel down.
type ModEngine struct {
	mu       sync.RWMutex
	entries  map[string]*modEntry // keyed by mod slug
	bus      *EventBus
	storage  *StorageRepository
	slots    []RegisteredSlot // slot registry snapshot (ordered by activation)
	startCtx context.Context  // base context for VM + hook dispatch
}

// modEntry is one active mod's runtime + its enrolled hooks/slots so a clean
// Deactivate can unwind every registration atomically.
type modEntry struct {
	slug     string
	manifest models.ModManifestV2
	rt       JSRuntime
	preToks  []hookRef
	postToks []hookRef
	slots    []RegisteredSlot
}

// hookRef ties a bus handle token back to its event name so teardown can
// uninstall it.
type hookRef struct {
	event string
	tok   HandleToken
}

// RegisteredSlot is one frontend injection point currently served by the
// engine. `Mod` is the owning mod slug; the rest mirrors SlotDefinition plus
// the mod's display name so the React side can label the slot without
// re-fetching the mod list.
type RegisteredSlot struct {
	Mod       string          `json:"mod"`       // owning mod slug
	ModID     int64           `json:"mod_id"`    // owning mod id (for the loader)
	Name      string          `json:"name"`      // slot name e.g. "instance.detail.tabs"
	Component string          `json:"component"` // export name in the mod bundle
	Props     json.RawMessage `json:"props,omitempty"`
}

// defaultExecTimeout caps how long a synchronous pre-hook may run before the
// engine considers it hung and cancels it. Pre hooks block the host action so
// an unbounded script would freeze the request path; this keeps panel liveness
// above one slow mod. Post hooks run async and are bounded by their own ctx.
const defaultExecTimeout = 5 * time.Second

// New returns a ModEngine wired to its own bus + a stateless storage repo. The
// caller must Boot() before serving mods (call it once the panel has booted the
// HTTP server and migrations have run).
func New() *ModEngine {
	return &ModEngine{
		entries: make(map[string]*modEntry),
		bus:     NewEventBus(),
		storage: NewStorageRepository(),
	}
}

// Bus exposes the underlying event bus so host handlers (instance / node / etc.)
// can EmitPre/EmitPost without depending on the bus type directly. Keeping the
// accessor narrow avoids encouraging ad-hoc Install calls from outside the
// engine — mods should subscribe via the VM's ks.events.on.
func (e *ModEngine) Bus() *EventBus { return e.bus }

// Storage exposes the namespaced storage repo (for diagnostics / future admin
// "inspect mod storage" views). Production code never writes through here; the
// Goja binding is the only writer path.
func (e *ModEngine) Storage() *StorageRepository { return e.storage }

// RunningMode reports which JS backend compiled in: "noop" on a stock build,
// "goja" when built with -tags modengine_goja. The handlers surface this in the
// slot response so the frontend knows whether active backend scripts execute.
func (e *ModEngine) RunningMode() string { return RunningMode }

// Boot loads every active mod's VM at startup. It is idempotent and safe to
// call from the panel's main goroutine after the DB is migrated. Mods whose VM
// fails to start are logged and left inactive in the registry rather than
// crashing the panel — the admin can fix the manifest + re-activate.
//
// The list of active mods is fetched fresh here (so a restarted panel picks up
// the DB's ground truth). Callers pass activeMods pre-resolved to keep this
// function DB-connection-free (the handlers' connection pool is single-slot).
func (e *ModEngine) Boot(ctx context.Context, activeMods []*models.Mod) {
	for _, m := range activeMods {
		if m == nil {
			continue
		}
		man := models.ParseV2Manifest(m.Manifest)
		if man.EngineVersion < 2 {
			// v1 mods have nothing to boot — they're the static manifest
			// system. We still record their slots if a future manifest
			// carries a v2 "slots" block while keeping engineVersion=1 so
			// the panel can render them without a script, but a pure v1 mod
			// (the common case) skips entirely.
			if len(man.Slots) == 0 {
				continue
			}
		}
		if err := e.activate(ctx, m, man); err != nil {
			log.Printf("[modengine] boot failed for mod %q: %v", m.Slug, err)
		}
	}
}

// Activate starts the runtime for one mod and enrols its hooks + slots. Called
// by ActivateModHandler after the row is flipped active. Safe to call for a mod
// that is already active (no-op) — reactivation across a hangar test does the
// right thing. Returns the first error encountered; partial enrolment is
// cleaned up so the registry never reports a half-booted mod.
func (e *ModEngine) Activate(ctx context.Context, mod *models.Mod) error {
	if mod == nil || mod.Slug == "" {
		return fmt.Errorf("modengine: activate requires a mod with a slug")
	}
	man := models.ParseV2Manifest(mod.Manifest)
	if man.EngineVersion < 2 && len(man.Slots) == 0 {
		// v1 mod, or v2 mod with no v2 surface — nothing to run. We still
		// record it as active-but-empty so the bus knows it subscribes to
		// nothing and ActiveSlots() stays consistent with the DB.
		return nil
	}
	return e.activate(ctx, mod, man)
}

// activate is the shared start path for Boot + Activate. It instantiates a
// runtime, asks it to Start, resolves + enrols every declared hook, records the
// declared slots, and finally writes the entry under the engine mutex. Any
// failure unwinds the partial registration.
func (e *ModEngine) activate(ctx context.Context, mod *models.Mod, man models.ModManifestV2) error {
	// Stop any existing entry for this slug WHILE HOLDING the lock.
	// stopLocked mutates the bus + the runtime and is only safe under e.mu;
	// the previous version unlocked first and called stopLocked outside the
	// lock, which raced concurrent activate() calls and could leak tokens.
	var existing *modEntry
	e.mu.Lock()
	if dup, ok := e.entries[mod.Slug]; ok {
		existing = dup
	}
	e.mu.Unlock()
	if existing != nil {
		e.mu.Lock()
		_ = e.stopLocked(existing)
		e.mu.Unlock()
	}

	// Ensure the mod's .kspm package is extracted to its workdir so a
	// file-based `backendScript` (and any frontend/page assets referenced by
	// slots / spec.pages) resolve from disk. A missing/empty workdir degrades
	// gracefully: resolveScript reads the file as empty and the runtime logs a
	// "backendScript present but noop / not found" notice. A failure here is
	// logged but never blocks activation so a half-extracted package doesn't
	// wedge the row — the engine's Error Isolation contract holding.
	workDir, werr := EnsureWorkDirLocked(mod.Slug)
	if werr != nil {
		log.Printf("[modengine] mod %q: ensure workdir: %v", mod.Slug, werr)
	}

	rt := newJSRuntime()
	// Construct the entry BEFORE rt.Start so runtime-installed hooks
	// (ks.events.on fired during script eval inside Start) can be attributed
	// to it. The entry isn't visible in e.entries until the commit below, so
	// a concurrent Deactivate sees nothing and no-ops — the same
	// partial-activation visibility contract the original held. The
	// per-activation installer captures `entry` directly (instead of routing
	// through a shared engine field) so two concurrent activations of
	// different mods can't clobber each other's hook tracking.
	entry := &modEntry{
		slug:     mod.Slug,
		manifest: man,
		rt:       rt,
	}
	installer := &activationInstaller{eng: e, entry: entry}

	defer func() {
		if r := recover(); r != nil {
			e.cleanupPartial(entry, rt)
			panic(r)
		}
	}()

	if err := rt.Start(mod.Slug, resolveScript(man, workDir), installer); err != nil {
		// Start failed: unwind any runtime hooks the script registered during
		// its (partial) evaluation and stop the VM so neither leaks. The
		// entry was never committed to e.entries, so a concurrent Deactivate
		// wouldn't see it — cleanupPartial is the only path that releases
		// the bus tokens + VM here.
		e.cleanupPartial(entry, rt)
		return fmt.Errorf("start runtime: %w", err)
	}

	// Enrol every manifest-declared hook. We resolve the JS handler name
	// through the runtime; when the runtime can't find it (noop, or the
	// script forgot to export it) we log a dangling notice but still register
	// a non-cancelling thunk so the admin UI's "this mod subscribes to X"
	// introspection stays truthful.
	//
	// We bind the handler to the engine's long-lived startCtx, NOT a fresh
	// per-enrollment ctx.WithTimeout: wrapHandlerWithTimeout already arms a
	// per-CALL 5s deadline internally, and a per-enrollment timeout would
	// EXPIRE the parent 5s after activation — so any hook fired later would
	// see an already-done context and the inner WithTimeout would return
	// instantly, silently making manifest hooks stop working 5s after boot.
	// Mirrors the runtime-installer (activationInstaller) binding.
	for _, h := range man.Hooks {
		handler, ok := rt.ResolveHook(h.Handler)
		if !ok {
			logDanglingHook(mod.Slug, h.Event, h.Handler)
			continue
		}
		bounded := wrapHandlerWithTimeout(e.startCtx, handler)
		var tok HandleToken
		if h.Phase == "post" {
			tok = e.bus.InstallPost(h.Event, bounded)
			entry.postToks = append(entry.postToks, hookRef{h.Event, tok})
		} else {
			// pre is the default phase (and the case the manifest omits).
			tok = e.bus.InstallPre(h.Event, bounded)
			entry.preToks = append(entry.preToks, hookRef{h.Event, tok})
		}
	}

	// Record declared slots so ActiveSlots() can serve them without parsing
	// manifests again on the request path.
	for _, s := range man.Slots {
		entry.slots = append(entry.slots, RegisteredSlot{
			Mod:       mod.Slug,
			ModID:     mod.ID,
			Name:      s.Name,
			Component: s.Component,
			Props:     s.Props,
		})
	}

	// Commit under the lock. Stop any concurrently-started duplicate first.
	e.mu.Lock()
	if dup, ok := e.entries[mod.Slug]; ok {
		_ = e.stopLocked(dup)
	}
	e.entries[mod.Slug] = entry
	e.rebuildSlotsLocked()
	e.mu.Unlock()
	return nil
}

// cleanupPartial unwinds an entry that never reached e.entries. It uninstalls
// every bus subscription we already wired up and stops the VM. Caller does
// NOT need to hold e.mu — stopLocked has its own expectations but uninstalls
// use the bus's own locking.
//
// `entry` may be nil if the panic happened before the entry was constructed;
// in that case we still stop the runtime via `rt` so the Goja VM doesn't
// leak. Bus subscriptions are entry-tracked and don't need teardown yet.
func (e *ModEngine) cleanupPartial(entry *modEntry, rt JSRuntime) {
	if entry != nil {
		for _, ref := range entry.preToks {
			e.bus.UninstallPre(ref.event, ref.tok)
		}
		for _, ref := range entry.postToks {
			e.bus.UninstallPost(ref.event, ref.tok)
		}
		entry.preToks = nil
		entry.postToks = nil
		entry.slots = nil
	}
	if rt != nil {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[modengine] partial-cleanup Stop panicked: %v", r)
				}
			}()
			rt.Stop()
		}()
	}
}

// Deactivate stops the mod's VM, uninstalls every enrolled hook, and drops its
// slots from the registry. Idempotent: an unknown slug is a no-op so the handler
// can call it unconditionally. After this returns, the bus has no listeners and
// ActiveSlots() no longer references the mod.
func (e *ModEngine) Deactivate(slug string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	entry, ok := e.entries[slug]
	if !ok {
		return
	}
	_ = e.stopLocked(entry)
	delete(e.entries, slug)
	e.rebuildSlotsLocked()
}

// stopLocked unwinds one entry's bus subscriptions + runtime. Caller MUST hold
// e.mu. A panic in the underlying Stop is recovered so a crashed runtime can't
// prevent the engine from cleaning up.
func (e *ModEngine) stopLocked(entry *modEntry) error {
	if entry == nil {
		return nil
	}
	for _, ref := range entry.preToks {
		e.bus.UninstallPre(ref.event, ref.tok)
	}
	for _, ref := range entry.postToks {
		e.bus.UninstallPost(ref.event, ref.tok)
	}
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[modengine] mod %q: runtime Stop panicked: %v", entry.slug, r)
			}
		}()
		entry.rt.Stop()
	}()
	entry.preToks = nil
	entry.postToks = nil
	entry.slots = nil
	return nil
}

// rebuildSlotsLocked recomputes the flat slot registry snapshot from every live
// entry. Caller MUST hold e.mu. Kept as a small slice (active mods +
// declared slots is a small set) so ActiveSlots() is a cheap copy.
func (e *ModEngine) rebuildSlotsLocked() {
	e.slots = e.slots[:0]
	for _, entry := range e.entries {
		e.slots = append(e.slots, entry.slots...)
	}
}

// ActiveSlots returns a snapshot of every slot currently served by an active
// mod. The slice is a defensive copy so callers (the HTTP handler) can hand it
// to json.Marshal without holding the engine lock.
func (e *ModEngine) ActiveSlots() []RegisteredSlot {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]RegisteredSlot, len(e.slots))
	copy(out, e.slots)
	return out
}

// IsActive reports whether a mod currently has a running runtime. The admin UI
// can use it to distinguish "active in DB" from "VM actually running" (they
// drift e.g. while a crashed mod awaits re-activation).
func (e *ModEngine) IsActive(slug string) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	_, ok := e.entries[slug]
	return ok
}

// EmitPre forwards to the bus. Host handlers call this before an action so a
// mod's pre-hook can cancel it (see eventbus.EmitPre).
func (e *ModEngine) EmitPre(ctx context.Context, event string, payload any) (bool, string) {
	return e.bus.EmitPre(ctx, event, payload)
}

// EmitPost forwards to the bus and returns immediately — post hooks run async.
func (e *ModEngine) EmitPost(ctx context.Context, event string, payload any) {
	e.bus.EmitPost(ctx, event, payload)
}

// HasHooks reports whether any mod is currently subscribed to `event`. Host
// code can short-circuit the (no-op) bus dispatch when nothing is listening,
// which is the common case on a panel with no active mods.
func (e *ModEngine) HasHooks(event string) bool { return e.bus.HasListeners(event) }

// ---------------------------------------------------------------------------
// Per-activation HookInstaller (the adapter the runtime writes through).
//
// activate() builds one activationInstaller per mod it boots and hands it to
// rt.Start. When the script does ks.events.on(name, fn), the runtime calls
// InstallPre/Post on THIS adapter (not on the engine), so the bus token lands
// against the entry being built — even though that entry isn't in e.entries
// yet (it's only committed after Start + manifest enrolment). Capturing the
// entry in the adapter (instead of routing through a shared engine field)
// keeps concurrent activations of different mods from clobbering each other's
// hook tracking. The runtime owns its thunk creation; the adapter owns bus
// membership + token-to-entry attribution.
// ---------------------------------------------------------------------------

// activationInstaller is the per-mod HookInstaller activate() creates. It
// proxies each handler through a timeout wrapper, installs it on the shared
// bus, and records the returned token against the captured entry so Deactivate
// / stopLocked / cleanupPartial can uninstall it. Methods are safe to call
// from the activating goroutine; the entry's hook slices are also mutated by
// activate()'s manifest enrolment, but always before the commit that
// publishes the entry under e.mu, so the commit lock + bus lock together
// establish the happens-before for later readers.
type activationInstaller struct {
	eng   *ModEngine
	entry *modEntry
}

// InstallPre wraps the handler in the timeout bound, installs it as a
// cancellable pre hook on the bus, and records the token under the entry.
func (a *activationInstaller) InstallPre(event string, h eventHandler) HandleToken {
	tok := a.eng.bus.InstallPre(event, wrapHandlerWithTimeout(a.eng.startCtx, h))
	a.entry.preToks = append(a.entry.preToks, hookRef{event, tok})
	return tok
}

// InstallPost is the post-hook variant: fire-and-forget on the bus, but the
// token is still recorded so stopLocked uninstalls it on Deactivate.
func (a *activationInstaller) InstallPost(event string, h eventHandler) HandleToken {
	tok := a.eng.bus.InstallPost(event, wrapHandlerWithTimeout(a.eng.startCtx, h))
	a.entry.postToks = append(a.entry.postToks, hookRef{event, tok})
	return tok
}

// SetStartCtx lets the panel refresh the base context used for hook dispatch.
// Called once after Boot with a long-lived panel context so cancelled requests
// don't cancel long-running post hooks (which should outlive the triggering
// request).
func (e *ModEngine) SetStartCtx(ctx context.Context) {
	e.startCtx = ctx
}

// wrapHandlerWithTimeout returns a handler that runs `h` under a per-call
// timeout derived from ctx. A timeout does NOT forcibly abort the underlying
// Goja VM (Goja has no preempt granularity we expose here), but it lets the
// caller's deadline propagate so the host action proceeds and the slow hook is
// logged. When ctx is nil we run with the engine's defaultExecTimeout alone.
func wrapHandlerWithTimeout(ctx context.Context, h eventHandler) eventHandler {
	if h == nil {
		return func(context.Context, any) HandleResult { return HandleResult{} }
	}
	return func(callCtx context.Context, payload any) HandleResult {
		base := ctx
		if base == nil {
			base = context.Background()
		}
		c, cancel := context.WithTimeout(base, defaultExecTimeout)
		defer cancel()
		done := make(chan HandleResult, 1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[modengine] hook panicked: %v", r)
					done <- HandleResult{}
				}
			}()
			done <- h(c, payload)
		}()
		select {
		case res := <-done:
			return res
		case <-c.Done():
			log.Printf("[modengine] hook timed out after %s", defaultExecTimeout)
			return HandleResult{}
		}
	}
}

// resolveScript returns the JS source a runtime should evaluate. We prefer an
// inline `backendScriptSource` (self-contained dev manifest) and fall back to
// `backendScript` (a file path inside the extracted .kspm workdir the loader
// resolves); when neither is present we hand the runtime an empty string, which
// the noop path treats as "no script".
//
// When `backendScript` is a path, the file is read from `workDir` (the
// extracted package directory; empty when no package was extracted). A missing
// or unreadable file degrades to "" so the runtime logs a helpful notice and
// activation still succeeds — the mod's slots/hooks register declaratively but
// no backend code runs.
func resolveScript(man models.ModManifestV2, workDir string) string {
	if man.BackendScriptSource != "" {
		return man.BackendScriptSource
	}
	if man.BackendScript == "" || workDir == "" {
		return ""
	}
	// The manifest's backendScript is a zip-relative path (e.g. "backend/main.js").
	// Join it onto the extracted workdir and read it. os.ReadFile already
	// rejects absolute paths, but we also clean + scope-check so a hostile
	// manifest path ("../../etc/passwd") can't escape the mod's workdir.
	rel := filepath.Clean(filepath.FromSlash(man.BackendScript))
	if filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return ""
	}
	full := filepath.Join(workDir, rel)
	if !strings.HasPrefix(full, workDir+string(filepath.Separator)) && full != workDir {
		return ""
	}
	src, err := os.ReadFile(full)
	if err != nil {
		return ""
	}
	return string(src)
}

// defaultEngine is the package-level engine handlers resolve when none is
// explicitly injected. It mirrors the pattern other handlers use (a package
// singleton wired at server boot). Tests can call ResetDefault to start clean.
var (
	defaultOnce   sync.Once
	defaultEngine *ModEngine
)

// Default returns the shared ModEngine, constructing it on first use. Handlers
// that don't take an explicit engine reference call this; it keeps the
// activation handlers small and the lifecycle testable in isolation.
func Default() *ModEngine {
	defaultOnce.Do(func() {
		defaultEngine = New()
	})
	return defaultEngine
}

// ResetDefault clears the package singleton. Intended for tests that want a
// fresh engine between cases.
func ResetDefault() {
	defaultOnce = sync.Once{}
	defaultEngine = nil
}

// LoadActiveMods is a helper the panel calls at boot to fetch every active mod
// row from the DB and feed it to Boot. Kept here so the boot caller doesn't
// have to know the repository column list; it opens its own connection (the
// single-connection pool forbids sharing one).
func LoadActiveMods() ([]*models.Mod, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, err
	}
	defer con.Close()
	repo := repository.NewModRepository(con)
	all, err := repo.ListMods()
	if err != nil {
		return nil, err
	}
	out := make([]*models.Mod, 0, len(all))
	for i := range all {
		if all[i].Active {
			m := all[i]
			out = append(out, &m)
		}
	}
	return out, nil
}
