//go:build !modengine_goja

package modengine

import (
	"log"
)

// RunningMode is "noop" for the default build (no goja dependency). See
// runtime.go for the dual-tag rationale.
const RunningMode = "noop"

// runtimeNoop is the default JSRuntime the panel ships with on a stock Go
// toolchain (no goja dependency). It enrols manifest-declared hooks for
// introspection and emits the "running, but no JS executes" notice once per
// mod activation so an operator knows what to expect.
//
// Compile with `-tags modengine_goja` (and a Go satisfying goja's go.mod) to
// swap in the real embedded JS sandbox — runtime_goja.go replaces this file
// 1:1 under that build tag.
type runtimeNoop struct {
	slug    string
	source  string
	install HookInstaller
}

// newJSRuntime is the single factory the engine calls; the build-tag version
// in runtime_goja.go overrides it. Keeping the factory name fixed lets the
// engine stay build-tag-agnostic.
func newJSRuntime() JSRuntime { return &runtimeNoop{} }

func (r *runtimeNoop) Start(slug, source string, install HookInstaller) error {
	r.slug = slug
	r.source = source
	r.install = install
	if source != "" {
		log.Printf("[modengine] mod %q: backendScript present but JS runtime is noop (build with -tags modengine_goja to execute it)", slug)
	}
	return nil
}

// ResolveHook returns a non-cancelling thunk so manifest hooks the runtime
// can't actually call still register as "subscribed" for the admin UI. The
// thunk logs once per hook so the operator sees the gap, then no-ops. Pre
// events therefore never block the host.
func (r *runtimeNoop) ResolveHook(name string) (eventHandler, bool) {
	if name == "" {
		return nil, false
	}
	// The signature is (slug, event, handler). In the noop runtime we never
	// have a real event name at the call site (it lives in the manifest, not
	// the runtime), so pass "*" for the event and the JS export as the
	// handler — matches what the operator sees on the dangling-hook log.
	logDanglingHook(r.slug, "*", name)
	h := func(_ eventCtx, _ any) HandleResult {
		return HandleResult{}
	}
	return h, true
}

func (r *runtimeNoop) Stop() {
	r.install = nil
	r.source = ""
}
