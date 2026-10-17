package handlers

// mod_events.go — one-line host-action hook emitters for the mod engine.
//
// The instance lifecycle handlers (instance_handler.go) emit their hooks with
// inline HasHooks guards; as the event surface grew (files, backups, console,
// login, deploy/reinstall/install) the same three lines were about to be
// copy-pasted a dozen times, so this file centralises them:
//
//	modEmitPre  — cancellable pre hook. Returns (cancelled, message). Callers
//	              map a cancellation to their own conflict response (409).
//	              Context comes from the HTTP request so a disconnected client
//	              cancels the hook dispatch too.
//	modEmitPost — async post hook. Fire-and-forget on the bus: a slow or
//	              crashing mod must never stall the host action. HasHooks is
//	              checked first so panels with no listening mods pay one map
//	              lookup and nothing else.
//
// Event catalogue (payload always carries at least {id, name} when the
// instance row is known):
//
//	pre/post:instance.deploy     — deploy kickoff (pre cancellable)
//	pre/post:instance.reinstall  — reinstall kickoff (pre cancellable)
//	post:instance.install        — install workflow finished (done | failed)
//	pre/post:file.write          — file save / overwrite (pre cancellable)
//	pre/post:file.delete         — file/dir delete (pre cancellable)
//	pre/post:file.upload         — multipart or URL upload (pre cancellable)
//	pre/post:backup.create       — backup upload started / completed
//	pre/post:backup.restore      — backup restore (pre cancellable)
//	pre/post:backup.delete       — backup delete (pre cancellable)
//	pre/post:console.command     — one command line sent to a workflow stdin
//	                               (pre cancellable drops the command)
//	post:console.output          — a stdout/stderr frame from the terminal
//	                               bridge (high frequency; subscriber-guarded)
//	post:user.login              — successful panel login

import (
	"context"

	"github.com/example/kspanel/internal/modengine"
)

// modEmitPre fires a cancellable pre hook. HasHooks-guarded: no listeners →
// (false, "") with zero allocation. The ctx bounds the dispatch (the bus
// additionally wraps every handler with the engine's 5s default timeout).
func modEmitPre(ctx context.Context, event string, payload map[string]any) (bool, string) {
	if !modengine.Default().HasHooks(event) {
		return false, ""
	}
	return modengine.Default().EmitPre(ctx, event, payload)
}

// modEmitPost fires an async post hook, guarded by HasHooks.
func modEmitPost(event string, payload map[string]any) {
	if !modengine.Default().HasHooks(event) {
		return
	}
	modengine.Default().EmitPost(context.Background(), event, payload)
}
