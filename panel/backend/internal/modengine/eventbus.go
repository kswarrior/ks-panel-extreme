package modengine

import (
	"context"
	"errors"
	"log"
	"sort"
	"sync"
)

// EventBus routes host lifecycle events to mod hook handlers.
//
// The bus distinguishes two phases:
//
//	EmitPre(event, payload) runs synchronously BEFORE a host action. It is
//	cancellable: if any registered handler returns a result with Cancel == true
//	the caller treats the event as cancelled and skips the action. Used for
//	e.g. "pre:instance.destroy" so a mod can veto a destructive action.
//
//	EmitPost(event, payload) runs AFTER a host action completes. It is async /
//	fire-and-forget by design (errors are logged, never surfaced to the
//	original request) so a slow post-hook never stalls the panel's request path.
//
// Handlers are JS functions the install-time `ks.events.on(name, fn)` binding
// registered into the bus. The bus does NOT call Goja directly — the sandbox
// owns the VM, so the engine wires a `(name, payload) -> result` callback that
// the bus invokes; this keeps the bus dependency-free and unit-testable
// without a Goja runtime. (See engine.go Engine.InstallEventHook.)
//
// Concurrency: a handler list may mutate (install/uninstall) concurrently with
// emission, so the bus guards handler slices with a mutex. Emission iterates a
// snapshot taken under the lock so a handler may safely uninstall itself.
//
// Handlers are compared by an opaque HandleToken the caller keeps; that token
// is the only way to remove a handler, which sidesteps Go's "func values are
// not comparable" rule and makes unregister O(1).
type EventBus struct {
	mu        sync.RWMutex
	preHooks  map[string]map[HandleToken]eventHandler
	postHooks map[string]map[HandleToken]eventHandler
	nextID    uint64
}

// HandleToken is the opaque identity handed back to an installer. Keeping it
// numeric means removal needs no string conversion and two tokens never
// collide over the bus lifetime (monotonic under the write lock).
type HandleToken uint64

// eventHandler is one registered listener. `cancel` on the returned result
// (when non-nil) signals cancellation of the host action for pre hooks.
type eventHandler func(ctx context.Context, payload any) HandleResult

// HandleResult is the structured result a hook handler returns. For a pre
// hook, setting Cancel == true (and a Message) aborts the host action with
// that message. For a post hook the fields are informational only.
type HandleResult struct {
	Cancel  bool   `json:"cancel"`
	Message string `json:"message,omitempty"`
	// Data is returned to the bus caller (e.g. the engine logs it). Opaque.
	Data any `json:"data,omitempty"`
}

// NewEventBus returns an empty bus.
func NewEventBus() *EventBus {
	return &EventBus{
		preHooks:  make(map[string]map[HandleToken]eventHandler),
		postHooks: make(map[string]map[HandleToken]eventHandler),
	}
}

// InstallPre registers a synchronous pre-hook handler for `event`. Multiple
// handlers for the same event run in registration order; the FIRST one that
// returns a cancelling result aborts the remainder of the pre chain. Returns
// the token to call uninstall with.
func (b *EventBus) InstallPre(event string, h eventHandler) HandleToken {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.nextID++
	tok := HandleToken(b.nextID)
	if b.preHooks[event] == nil {
		b.preHooks[event] = make(map[HandleToken]eventHandler)
	}
	b.preHooks[event][tok] = h
	return tok
}

// UninstallPre removes a previously installed pre hook. Unknown tokens are a
// no-op (idempotent) so an engine tearing down a mod may call it unconditionally.
func (b *EventBus) UninstallPre(event string, tok HandleToken) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if bucket := b.preHooks[event]; bucket != nil {
		delete(bucket, tok)
		if len(bucket) == 0 {
			delete(b.preHooks, event)
		}
	}
}

// InstallPost registers an async post-hook handler for `event`. Post hooks run
// concurrently (goroutines) after the host action; order is not guaranteed and
// no handler can cancel another.
func (b *EventBus) InstallPost(event string, h eventHandler) HandleToken {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.nextID++
	tok := HandleToken(b.nextID)
	if b.postHooks[event] == nil {
		b.postHooks[event] = make(map[HandleToken]eventHandler)
	}
	b.postHooks[event][tok] = h
	return tok
}

// UninstallPost removes a previously installed post hook.
func (b *EventBus) UninstallPost(event string, tok HandleToken) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if bucket := b.postHooks[event]; bucket != nil {
		delete(bucket, tok)
		if len(bucket) == 0 {
			delete(b.postHooks, event)
		}
	}
}

// EmitPre runs every pre-hook for `event` synchronously, in token-ascending
// (i.e. registration) order. The first handler that returns a cancelling result
// short-circuits the rest and EmitPre returns (cancelled, message). A handler
// panic is recovered and logged so a misbehaving mod can be debugged, but the
// panic never propagates into the host path.
//
// Returns (cancelled bool, message string). cancelled==true means the host
// action MUST be skipped.
func (b *EventBus) EmitPre(ctx context.Context, event string, payload any) (cancelled bool, message string) {
	snapshot := b.snapshotOrdered(b.preHooks, event)
	for _, h := range snapshot {
		func() {
			defer func() {
				if r := recover(); r != nil {
					// Log so Error Isolation remains debuggable. A panicking
					// hook MUST NOT take the host down (so we recover), but
					// silently dropping the panic hid a class of bugs.
					log.Printf("[modengine] pre hook for %q panicked: %v", event, r)
				}
			}()
			res := h(ctx, payload)
			if res.Cancel {
				cancelled = true
				if res.Message != "" {
					message = res.Message
				} else {
					message = "blocked by a pre hook"
				}
			}
		}()
		if cancelled {
			return
		}
	}
	return false, ""
}

// EmitPost fires every post-hook for `event`, concurrently with one another.
// Each handler runs in its own goroutine; the call returns as soon as dispatch
// is queued — handlers that exceed ctx's deadline observe ctx.Done() inside
// their VM and exit cleanly. Errors/panics are swallowed (logged by the
// engine's wrapper) so a slow hook never stalls a request.
func (b *EventBus) EmitPost(ctx context.Context, event string, payload any) {
	snapshot := b.snapshotOrdered(b.postHooks, event)
	for _, h := range snapshot {
		go func(h eventHandler) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[modengine] post hook for %q panicked: %v", event, r)
				}
			}()
			_ = h(ctx, payload)
		}(h)
	}
	// Don't block the caller on the goroutines. If a caller wants to wait it
	// can pass a bounded ctx; the hooks themselves honour ctx.Done().
	_ = ctx
}

// snapshotOrdered copies the handler map for an event under the read lock so
// a handler may freely uninstall itself during iteration without racy map
// mutation. The returned slice is sorted by token ascending == registration
// order, which is the contract the JS-facing `ks.events.on` documents.
func (b *EventBus) snapshotOrdered(store map[string]map[HandleToken]eventHandler, event string) []eventHandler {
	b.mu.RLock()
	defer b.mu.RUnlock()
	src := store[event]
	if len(src) == 0 {
		return nil
	}
	type entry struct {
		tok HandleToken
		h   eventHandler
	}
	entries := make([]entry, 0, len(src))
	for tok, h := range src {
		entries = append(entries, entry{tok, h})
	}
	// Sort by token so pre hooks run in registration order (tokens are
	// monotonic per bus). Map iteration order is random; this restores the
	// deterministic sequence the JS-facing contract promises.
	sort.Slice(entries, func(i, j int) bool { return entries[i].tok < entries[j].tok })
	out := make([]eventHandler, len(entries))
	for i, e := range entries {
		out[i] = e.h
	}
	return out
}

// HasListeners reports whether any handler (pre or post) is registered for
// the event. Used by the engine to short-circuit the bus invocation cost on
// the (usual) empty case.
func (b *EventBus) HasListeners(event string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.preHooks[event]) > 0 || len(b.postHooks[event]) > 0
}

// ErrPreEventCancelled is returned when a pre hook chain cancels an event. It
// is mostly informational; the (bool, string) return of EmitPre is the
// primary cancellation signal, this sentinel is reserved for handlers that
// wish to abort by error-return rather than result-shape.
var ErrPreEventCancelled = errors.New("pre-event cancelled by a mod hook")
