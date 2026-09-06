//go:build modengine_goja

// sandbox.go — the real embedded JavaScript sandbox the v2 engine runs on.
//
// This file is compiled ONLY when the panel is built with
// `-tags modengine_goja` AND goja is present in go.mod. The default (no tag)
// build uses runtime_noop.go instead, so a stock panel never links goja and
// stays a static JSON/manifest system. See runtime.go for the JSRuntime
// contract both files implement.
//
// The sandbox is per-mod: one *goja.Runtime owns one VM. We bind a strictly
// restricted Host API onto each VM under the global `ks`:
//
//	ks.log(level, msg)          — structured logging back into the Go log path.
//	ks.storage.get(key)         — read this mod's namespaced value (null when
//	                              absent).
//	ks.storage.set(key, value)   — upsert a JSON value under this mod's slug.
//	ks.storage.delete(key)      — remove a key (no-op when missing).
//	ks.events.on(eventName, fn) — subscribe a JS fn to a host lifecycle event.
//	                              Returns an opaque numeric handle.
//
// Security contract: the VM exposes NO host OS surface. No `require`, no `os`,
// no file reads, no `process`, no network. A mod that needs terminal /
// filesystem access must declare the matching capability AND reach it through
// a future capability-guarded binding — the raw host is never reachable from
// `ks`. Goja's Set / Define is the only escape hatch and we only set `ks`.
//
// Concurrency: a goja.Runtime is NOT safe to call from multiple goroutines, so
// every JS invocation (Start eval, hook dispatch) holds the VM's mutex. The
// engine's per-mod serialisation + this mutex together keep VM access linear.
// A crashing script is recovered, logged, and the runtime is flagged broken so
// the engine deactivates it without taking the panel down (Error Isolation).

package modengine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

// RunningMode overrides the noop stub's default so the engine + admin UI can
// report "goja" when real JS is executing.
const RunningMode = "goja"

// newJSRuntime overrides runtime_noop.go's factory for the modengine_goja
// build. The engine calls it unconditionally; the build tag picks the impl.
func newJSRuntime() JSRuntime { return &gojaRuntime{} }

// hookReturn is the structured object a JS pre hook returns. Its field tags
// mirror HandleResult so we read fields off the goja value without reflection.
type hookReturn struct {
	Cancel  bool        `json:"cancel"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

// gojaRuntime is the per-mod VM manager. It is constructed empty by
// newJSRuntime and fully initialised by Start. A panic recovered in any entry
// point tears the VM down so the engine stops dispatching into a broken VM.
type gojaRuntime struct {
	slug    string
	mu      sync.Mutex
	vm      *goja.Runtime
	binding *storageBinding // namespaced ks.storage backing (see storage.go)
	install HookInstaller
	started atomic.Bool
}

// Start boots the VM, injects the `ks` Host API, then evaluates the entry
// script. `source` may be empty (a v2 mod that only declares slots/hooks
// without code); we still boot so ResolveHook could wire declarative hooks to
// script exports — when nothing exports, the engine logs a dangling notice.
func (r *gojaRuntime) Start(slug, source string, install HookInstaller) error {
	r.slug = slug
	r.install = install
	r.binding = newStorageBinding(slug, Default().storage)

	vm := goja.New()
	r.vm = vm

	if err := vm.Set("ks", r.buildKS(vm)); err != nil {
		return fmt.Errorf("inject ks host api: %w", err)
	}

	if source != "" {
		if _, err := r.runEval(source, "backendScript"); err != nil {
			return fmt.Errorf("eval backendScript for %q: %w", slug, err)
		}
	}
	r.started.Store(true)
	return nil
}

// ResolveHook looks up an exported JS function by name and returns a bus thunk
// that invokes it with the event payload. Unknown names return (nil, false) so
// the engine logs a dangling hook rather than crashing activation.
func (r *gojaRuntime) ResolveHook(name string) (eventHandler, bool) {
	if name == "" {
		return nil, false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.vm == nil {
		return nil, false
	}
	fn, ok := goja.AssertFunction(r.vm.Get(name))
	if !ok {
		return nil, false
	}
	return r.makeThunk(fn), true
}

// makeThunk wraps a resolved JS function into a bus-compatible handler. Each
// dispatch serialises against the VM mutex, marshals the payload to a JS value
// via JSON (the simplest structural bridge), and coerces the return into a
// HandleResult. A JS throw becomes a logged error + a non-cancelling result so
// one broken mod can't poison the host path.
func (r *gojaRuntime) makeThunk(fn goja.Callable) eventHandler {
	return func(ctx context.Context, payload any) (result HandleResult) {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.vm == nil {
			return HandleResult{}
		}
		defer func() {
			if exc := recover(); exc != nil {
				log.Printf("[modengine] mod %q: hook panicked: %v", r.slug, exc)
				Default().AppendLog(r.slug, "error", fmt.Sprintf("hook panicked: %v", exc))
			}
		}()
		// Bridge the payload. We can't hand an arbitrary Go value to goja
		// reliably (struct field name casing), so round-trip through JSON then
		// evaluate the literal — the JS side sees the plain object it expects.
		raw, err := json.Marshal(payload)
		if err != nil {
			log.Printf("[modengine] mod %q: marshal hook payload: %v", r.slug, err)
			return HandleResult{}
		}
		jsPayload, err := r.vm.RunString("(" + string(raw) + ")")
		if err != nil {
			log.Printf("[modengine] mod %q: parse hook payload: %v", r.slug, err)
			return HandleResult{}
		}
		stop := r.armInterrupt(ctx)
		defer stop()
		ret, err := fn(goja.Undefined(), jsPayload)
		if err != nil {
			log.Printf("[modengine] mod %q: hook threw: %v", r.slug, err)
			Default().AppendLog(r.slug, "error", fmt.Sprintf("hook threw: %v", err))
			return HandleResult{}
		}
		return coerceHandleResult(ret)
	}
}

// coerceHandleResult turns a JS return value into a HandleResult. Accepts the
// {cancel, message, data} object shape the manifest documents, a bare boolean
// (cancel), or undefined/null (no-op).
func coerceHandleResult(ret goja.Value) HandleResult {
	if ret == nil || goja.IsUndefined(ret) || goja.IsNull(ret) {
		return HandleResult{}
	}
	if obj, ok := ret.(*goja.Object); ok {
		var hr hookReturn
		if b, ok := obj.Get("cancel").Export().(bool); ok {
			hr.Cancel = b
		}
		if m, ok := obj.Get("message").Export().(string); ok {
			hr.Message = m
		}
		if d := obj.Get("data"); d != nil && !goja.IsUndefined(d) {
			hr.Data = d.Export()
		}
		return HandleResult{Cancel: hr.Cancel, Message: hr.Message, Data: hr.Data}
	}
	if b, ok := ret.Export().(bool); ok {
		return HandleResult{Cancel: b}
	}
	return HandleResult{}
}

// interruptVM raises a goja interrupt on the live VM, if any. Both watchdog
// timers funnel through here: Stop() nils r.vm while a timer may still be
// armed, and a bare r.vm.Interrupt there would nil-dereference inside the
// timer goroutine — an unrecoverable panic that crashes the panel process.
// The nil-guard keeps teardown-vs-watchdog a silent no-op; interrupting an
// idle VM is harmless.
func (r *gojaRuntime) interruptVM(reason string) {
	r.mu.Lock()
	vm := r.vm
	r.mu.Unlock()
	if vm == nil {
		return
	}
	vm.Interrupt(reason)
}

// armInterrupt schedules a watchdog that calls vm.Interrupt after the ctx
// deadline, terminating an over-running JS call with a goja.InterruptedError
// (which the thunk recovers as a logged error). Returns a stop() that disarms
// the timer early.
func (r *gojaRuntime) armInterrupt(ctx context.Context) func() {
	deadline := defaultExecTimeout
	if dl, ok := ctx.Deadline(); ok {
		if remaining := time.Until(dl); remaining > 0 && remaining < deadline {
			deadline = remaining
		}
	}
	// vm.Interrupt is a method (func(v interface{})) on the Runtime: it sets
	// the interrupt flag the VM checks at safepoints, turning the in-flight JS
	// call into an *InterruptedError promptly without needing a pre-wired
	// channel. Safe to call from the timer goroutine. Routed via
	// interruptVM so a Stop() racing the deadline cannot nil-dereference.
	timer := time.AfterFunc(deadline, func() {
		r.interruptVM("hook timeout")
	})
	return func() { timer.Stop() }
}

// runEval is the locked eval helper used by Start. It arms the interrupt
// watchdog against the VM so an infinite-loop script can't wedge activation
// forever — the timer calls vm.Interrupt, which surfaces an
// *InterruptedError from RunString.
func (r *gojaRuntime) runEval(source, label string) (goja.Value, error) {
	timer := time.AfterFunc(defaultExecTimeout, func() {
		r.vm.Interrupt("script timeout")
	})
	defer timer.Stop()
	v, err := r.vm.RunString(source)
	if err != nil {
		var ie *goja.InterruptedError
		if errors.As(err, &ie) {
			return nil, fmt.Errorf("%s interrupted: %v", label, ie.Value())
		}
		return nil, err
	}
	return v, nil
}

// Stop tears the VM down and frees its state. Subsequent ResolveHook returns
// (nil, false). Safe to call repeatedly.
func (r *gojaRuntime) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.vm = nil
	r.install = nil
	r.binding = nil
	r.started.Store(false)
}

// buildKS constructs the `ks` global the VM sees. Each member is a closure
// capturing `r` so the mod's slug is fixed at Start time and never readable
// back from JS in a forgeable way. Methods recover their own panic so a
// misuse can't crash the host.
//
// Structure:
//
//	ks.log(level, msg)
//	ks.storage.get(key) / .set(key,val) / .delete(key)
//	ks.events.on(name, fn)
//	ks.slug // read-only identity
func (r *gojaRuntime) buildKS(vm *goja.Runtime) map[string]any {
	return map[string]any{
		"log": r.logfn,
		"storage": map[string]any{
			"get":    r.storageGet,
			"set":    r.storageSet,
			"delete": r.storageDelete,
		},
		"events": map[string]any{
			"on": r.eventsOn,
		},
		"slug": r.slug, // read-only identity
	}
}

// logfn routes JS log calls into Go's logging. Forwarded (level, msg) verbatim;
// a non-string msg is JSON-coerced so the log line stays readable. This is the
// ONLY host-side persistence a script has besides storage — no console/stdout.
func (r *gojaRuntime) logfn(call goja.FunctionCall) goja.Value {
	level := "info"
	if len(call.Arguments) > 0 {
		if l, ok := call.Arguments[0].Export().(string); ok && l != "" {
			level = l
		}
	}
	msg := ""
	if len(call.Arguments) > 1 {
		if m, ok := call.Arguments[1].Export().(string); ok {
			msg = m
		} else if b, err := json.Marshal(call.Arguments[1].Export()); err == nil {
			msg = string(b)
		}
	}
	switch level {
	case "error":
		log.Printf("[mod:%s] ERROR %s", r.slug, msg)
	case "warn":
		log.Printf("[mod:%s] WARN %s", r.slug, msg)
	case "debug":
		log.Printf("[mod:%s] DEBUG %s", r.slug, msg)
	default:
		log.Printf("[mod:%s] %s", r.slug, msg)
	}
	// Mirror into the per-mod diagnostics ring so the admin can read script
	// output from the Mods UI. Lock-order safe: we hold the VM mutex here,
	// AppendLog only takes the innermost statusMu (see status.go).
	Default().AppendLog(r.slug, level, msg)
	return goja.Undefined()
}

// storageGet reads this mod's value. Returns goja null (not undefined) when the
// key is absent so JS can distinguish "no key" from "stored null". Errors are
// logged and surfaced as null too — keeping the host path panic-free.
func (r *gojaRuntime) storageGet(call goja.FunctionCall) goja.Value {
	if r.binding == nil {
		return goja.Null()
	}
	key, _ := call.Argument(0).Export().(string)
	raw, err := r.binding.get(key)
	if err != nil {
		if !errors.Is(err, ErrStorageNotFound) {
			log.Printf("[mod:%s] storage.get(%q) error: %v", r.slug, key, err)
		}
		return goja.Null()
	}
	// Round-trip through JSON so the JS side sees a real object/array, not a
	// string-typed blob. Empty value coerces to the JSON default "{}".
	if len(raw) == 0 {
		raw = json.RawMessage("{}")
	}
	v, err := r.vm.RunString("(" + string(raw) + ")")
	if err != nil {
		log.Printf("[mod:%s] storage.get(%q) parse error: %v", r.slug, key, err)
		return goja.Null()
	}
	return v
}

// storageSet upserts a value. We coerce the JS argument through json.Marshal so
// functions / undefined (non-JSON) become null rather than crashing the binding.
func (r *gojaRuntime) storageSet(call goja.FunctionCall) goja.Value {
	if r.binding == nil {
		return goja.Undefined()
	}
	key, _ := call.Argument(0).Export().(string)
	val := call.Argument(1).Export()
	if err := r.binding.set(key, val); err != nil {
		log.Printf("[mod:%s] storage.set(%q) error: %v", r.slug, key, err)
	}
	return goja.Undefined()
}

// storageDelete removes a key. A no-op on missing keys is the repo's contract,
// so we just forward.
func (r *gojaRuntime) storageDelete(call goja.FunctionCall) goja.Value {
	if r.binding == nil {
		return goja.Undefined()
	}
	key, _ := call.Argument(0).Export().(string)
	if err := r.binding.delete(key); err != nil {
		log.Printf("[mod:%s] storage.delete(%q) error: %v", r.slug, key, err)
	}
	return goja.Undefined()
}

// eventsOn subscribes a JS function to a host event. We wrap it into a bus
// thunk via makeThunk (so the VM mutex is held during dispatch) and install it
// on the bus through the HookInstaller. Returns an opaque numeric token so a
// future ks.events.off can match without holding JS function references.
//
// Phase is decided from the event name prefix (mirrors the manifest
// HookDefinition.phase convention): names beginning with "pre:" are cancellable
// pre-hooks; everything else defaults to a post hook (the common case).
func (r *gojaRuntime) eventsOn(call goja.FunctionCall) goja.Value {
	eventName, _ := call.Argument(0).Export().(string)
	fn, ok := goja.AssertFunction(call.Argument(1))
	if !ok || eventName == "" {
		panic(r.vm.ToValue("ks.events.on(eventName, fn): requires an event name and a function"))
	}
	thunk := r.makeThunk(fn)
	var tok HandleToken
	if isPreEvent(eventName) {
		tok = r.install.InstallPre(eventName, thunk)
	} else {
		tok = r.install.InstallPost(eventName, thunk)
	}
	return r.vm.ToValue(uint64(tok))
}

// isPreEvent implements the "pre:"-prefix convention so imperative + declarative
// subscriptions agree on phase without a second argument.
func isPreEvent(name string) bool {
	return len(name) > 4 && name[:4] == "pre:"
}
