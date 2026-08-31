package modengine

import (
	"context"
	"errors"
	"log"
)

// This file defines the JSRuntime contract the ModEngine uses to execute a
// mod's backendScript, plus the shared HookInstaller and a few small helpers.
//
// There are two implementations of JSRuntime:
//
//   runtime_noop.go  (default, no build tag) — a safe no-op stub that enrols
//   every hook declaratively (from the manifest) but executes no JS. The
//   panel builds and runs on stock Go 1.22 without the goja dependency.
//
//   runtime_goja.go  (build tag: modengine_goja) — the real embedded JS
//   sandbox running github.com/dop251/goja VMs with the full Host API
//   (logging, namespaced storage, event subscriptions). Compile the panel
//   with `-tags modengine_goja` (and a Go toolchain that satisfies goja's
//   module go.mod) to enable live JS execution.
//
// Both implementations honour the same JSRuntime contract, so the engine,
// event bus, storage repo, and HTTP handlers are identical across the two
// modes — only the runtime backing changes. This keeps the panel safe to
// ship today and a single build-flag away from the full v2 plugin engine.

// RunningMode reports which JS runtime is compiled in. The handlers and admin
// UI surface this so an operator knows whether active mods are executing JS
// ("goja") or parked in manifest-only mode ("noop") — the latter still gets
// their slots/hooks/storage surfaced, but no backend script runs.
//
// The constant is defined twice (once per build tag) so the binary carries
// exactly one value: runtime_noop.go sets "noop" for the default build,
// runtime_goja.go sets "goja" under the `modengine_goja` tag. Keeping it in
// the tag-guarded files (not here, unguarded) avoids a duplicate-decl panic
// when both build paths are considered.

// HookInstaller bridges a runtime to the host event bus. The engine hands one
// to JSRuntime.Start; the runtime then, as the script calls
// `ks.events.on("name", fn)`, calls Install(name, handler) where `handler` is a
// thunk the bus invokes at emit time. The bus itself never touches a JS VM.
//
// Install returns (token, true) on success so the runtime can record what to
// uninstall on teardown.
type HookInstaller interface {
	InstallPre(event string, h eventHandler) HandleToken
	InstallPost(event string, h eventHandler) HandleToken
}

// JSRuntime is the contract every backend-script execution backend satisfies.
// The engine calls these methods when a v2 mod is activated / deactivated and
// when an event fires that the mod subscribed to.
//
// All methods must be safe to hold alongside another mod's runtime (the engine
// calls them under its own per-mod mutex). A panic in any method must be
// recovered by the implementation, never propagated into the engine.
type JSRuntime interface {
	// Start boots the runtime for the mod identified by slug and loads its
	// backendScript source. The runtime should subscribe the manifest's
	// declarative hooks to the bus through `install` (giving the script a
	// chance to register more via `ks.events.on` at module-eval time), and
	// return an error describing why the boot failed (e.g. parse error). The
	// engine treats any non-nil error as a hard deactivation.
	Start(slug, source string, install HookInstaller) error

	// ResolveHook returns a bus-compatible thunk for the JS handler named
	// `handlerName` that the manifest declared for a hook. When the runtime
	// can resolve the exported JS function it returns the thunk + true; when
	// the script never defined it (or the runtime is the no-op stub) it
	// returns nil + false, which the engine logs as a "dangling hook" notice
	// rather than failing activation.
	ResolveHook(handlerName string) (eventHandler, bool)

	// Stop tears the runtime down and frees its VM. After Stop, ResolveHook
	// must return (nil, false).
	Stop()
}

// noopHookInstaller is the no-op implementation's installer. Hooks registered
// through it are never invoked because the no-op runtime never resolves a JS
// thunk for them; we still install so the admin UI can introspect "the mod
// subscribes to event X" via the bus's HasListeners. The thunks return a
// non-cancelling HandleResult so pre-events pass through unblocked.
type noopHookInstaller struct {
	pre  map[HandleToken]string
	post map[HandleToken]string
}

// logDanglingHook is a small helper shared by both runtimes: when a manifest
// declares a hook the loaded script does not export, we log a single notice
// rather than aborting activation. A misconfigured mod still activates so the
// admin can fix it from the panel; a refusing runtime would be far worse UX.
func logDanglingHook(slug, event, handler string) {
	log.Printf("[modengine] mod %q: hook %s -> handler %q not exported by backendScript; hook registered but inactive", slug, event, handler)
}

// ErrJSRuntimePanicked is a sentinel an implementation may wrap a recovered
// panic into so the engine can recognise it in logs and (optionally)
// auto-deactivate the mod.
var ErrJSRuntimePanicked = errors.New("mod JS runtime panicked")

// eventCtx is a tiny alias so runtime files that don't otherwise need context
// avoid an unused-import dance; Goja's runtime uses context through here too.
type eventCtx = context.Context
